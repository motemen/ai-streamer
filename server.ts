import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { streamSSE } from "hono/streaming";
import { toFetchResponse, toReqRes } from "fetch-to-node";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { loadConfig } from "c12";
import createDebug from "debug";
import { z } from "zod";

import { aiStreamer } from "./ai-streamer";
import { ConfigureCommand, FrontendCommand } from "./commands";
import { mcpServer } from "./mcp";

const debug = createDebug("aistreamer");

const app = new Hono();

app.use(
  "*",
  serveStatic({
    root: "./dist",
    rewriteRequestPath: (path) =>
    ({
      "/director": "/director.html",
    }[path] ?? path),
  })
);

app.get("/api/stream", (c) => {
  debug("start streaming");

  return streamSSE(
    c,
    async (stream) => {
      return new Promise((_resolve, reject) => {
        const sendCommand = async (command: FrontendCommand) => {
          debug("sendCommand", {
            ...command,
            ...("audioDataBase64" in command ? { audioDataBase64: "..." } : {}),
          });
          await stream.writeSSE({
            data: JSON.stringify(command),
            event: command.type,
          });
        };

        // Send ConfigureCommand on client connection
        const configureCommand: ConfigureCommand = {
          type: "CONFIGURE",
          config: aiStreamer.config,
        };
        sendCommand(configureCommand);

        aiStreamer.on("frontendCommand", sendCommand);

        stream.onAbort(() => {
          debug("stream aborted");
          aiStreamer.off("frontendCommand", sendCommand);
          reject("stream aborted");
        });
      });
    },
    async (error, stream) => {
      console.error("stream error", error);
      stream.close();
    }
  );
});

const ChatPayloadSchema = z.object({
  prompt: z.string().nonempty(),
  imageURL: z.string().optional(),
  interrupt: z.boolean().optional().default(true),
  direct: z.boolean().optional(),
});

app.post("/api/chat", async (c) => {
  const body = await c.req.json();
  const { success, data, error } = ChatPayloadSchema.safeParse(body);
  if (!success) {
    return c.json(
      { error: "Invalid payload", details: error },
      { status: 400 }
    );
  }

  const { prompt, imageURL, interrupt, direct } = data;

  // ストリーミングレスポンスを返す
  c.header("Content-Type", "application/x-ndjson");
  c.header("Transfer-Encoding", "chunked");

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const text of aiStreamer.dispatchSpeechLineStream(prompt, {
          imageURL,
          interrupt,
          direct,
        })) {
          const jsonLine = JSON.stringify({ text, type: "speech_chunk" }) + "\n";
          controller.enqueue(encoder.encode(jsonLine));
        }

        // 完了を示すメッセージ
        const completeMessage = JSON.stringify({ type: "complete" }) + "\n";
        controller.enqueue(encoder.encode(completeMessage));
        controller.close();
      } catch (error) {
        const errorMessage = JSON.stringify({
          type: "error",
          error: error instanceof Error ? error.message : "Unknown error"
        }) + "\n";
        controller.enqueue(encoder.encode(errorMessage));
        controller.close();
      }
    }
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Transfer-Encoding": "chunked",
    },
  });
});

// XXX: 雑談のタイミングはクライアント側でコントロールしているが、クライアントが複数あると困る
app.post("/api/idle", async (c) => {
  const idlePrompt = aiStreamer.config.idle?.prompt;
  if (!idlePrompt) {
    return c.json({ error: "No idle prompt configured" }, { status: 400 });
  }

  // ストリーミングレスポンスを返す
  c.header("Content-Type", "application/x-ndjson");
  c.header("Transfer-Encoding", "chunked");

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const text of aiStreamer.dispatchSpeechLineStream(
          idlePrompt,
          {}
        )) {
          const jsonLine =
            JSON.stringify({ text, type: "speech_chunk" }) + "\n";
          controller.enqueue(encoder.encode(jsonLine));
        }

        // 完了を示すメッセージ
        const completeMessage = JSON.stringify({ type: "complete" }) + "\n";
        controller.enqueue(encoder.encode(completeMessage));
        controller.close();
      } catch (error) {
        const errorMessage =
          JSON.stringify({
            type: "error",
            error: error instanceof Error ? error.message : "Unknown error",
          }) + "\n";
        controller.enqueue(encoder.encode(errorMessage));
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Transfer-Encoding": "chunked",
    },
  });
});

app.get("/api/avatar/:name", async (c) => {
  const name = c.req.param("name");
  const imageData = await aiStreamer.getAvatarImage(name);
  if (!imageData) {
    return c.notFound();
  }

  return c.body(imageData, {
    headers: {
      "Content-Type": "image/png",
      Expires: new Date(Date.now() + 60 * 60 * 1000).toUTCString(),
    },
  });
});

// https://github.com/modelcontextprotocol/typescript-sdk?tab=readme-ov-file#without-session-management-stateless
// https://azukiazusa.dev/blog/mcp-server-streamable-http-transport/
// https://zenn.dev/georgia1/articles/dd4fb566e470fe
app.post("/api/mcp", async (c) => {
  try {
    const { req, res } = toReqRes(c.req.raw);

    res.on("close", () => {
      debug("MCP: Request closed");
      transport.close();
      mcpServer.close();
    });

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    transport.onerror = console.error.bind(console);
    await mcpServer.connect(transport);

    const body = await c.req.json();
    await transport.handleRequest(req, res, body);

    return toFetchResponse(res);
  } catch (err) {
    console.error("[error] MCP request error:", err);
    return c.json(
      {
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error",
        },
        id: null,
      },
      { status: 500 }
    );
  }
});

app.on(["GET", "DELETE"], "/api/mcp", (c) => {
  return c.json(
    {
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed." },
      id: null,
    },
    { status: 405 }
  );
});

const { config } = await loadConfig({
  configFile: process.argv[2],
  giget: false,
});

aiStreamer.configure(config);

serve({ fetch: app.fetch, port: 7766 }, (info) => {
  console.info(`Listening on http://localhost:${info.port}`);
});
