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
  interrupt: z.boolean().optional(),
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
  const speechLine = await aiStreamer.dispatchSpeechLine(prompt, {
    imageURL,
    interrupt,
    direct,
  });
  return c.json({ message: "ok", speechLine });
});

const IdlePayloadSchema = z.object({
  prompt: z.string().optional(),
  direct: z.boolean().optional(),
});

// XXX: 雑談のタイミングはクライアント側でコントロールしているが、クライアントが複数あると困る
app.post("/api/idle", async (c) => {
  const body = await c.req.json();
  const { success, data, error } = IdlePayloadSchema.safeParse(body);
  if (!success) {
    return c.json(
      { error: "Invalid payload", details: error },
      { status: 400 }
    );
  }

  const { prompt, direct } = data;
  const idlePrompt = prompt ?? aiStreamer.config.idle?.prompt;
  if (!idlePrompt) {
    return c.json({ error: "No idle prompt configured" }, { status: 400 });
  }

  const speechLine = await aiStreamer.dispatchSpeechLine(idlePrompt, {
    direct,
  });
  return c.json({ message: "ok", speechLine });
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

// https://zenn.dev/georgia1/articles/dd4fb566e470fe
app.post("/api/mcp", async (c) => {
  try {
    // Fetch APIのリクエスト/レスポンスをNode.jsのリクエスト/レスポンスに変換
    const { req, res } = toReqRes(c.req.raw);
    const body = await c.req.json();

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    transport.onerror = console.error.bind(console);

    // MCPサーバーをトランスポートに接続
    await mcpServer.connect(transport);

    // MCPリクエストを処理
    await transport.handleRequest(req, res, body);

    // リクエストが終了したらリソースをクリーンアップ
    res.on("close", () => {
      console.log("Request closed");
      transport.close();
      mcpServer.close();
    });

    // Node.jsのレスポンスをFetch APIのレスポンスに変換して返す
    return toFetchResponse(res);
  } catch (e) {
    console.error("MCP request error:", e);
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

// GET リクエスト（MCP）
app.get("/api/mcp", (c) => {
  console.log("Received GET MCP request");
  return c.json(
    {
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed.",
      },
      id: null,
    },
    { status: 405 }
  );
});

// DELETE リクエスト（MCP）
app.delete("/api/mcp", (c) => {
  console.log("Received DELETE MCP request");
  return c.json(
    {
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed.",
      },
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

// MCPサーバーを起動
console.info("MCP Server enabled via HTTP endpoint at /mcp");

serve({ fetch: app.fetch, port: 7766 }, (info) => {
  console.info(`Listening on http://localhost:${info.port}`);
});
