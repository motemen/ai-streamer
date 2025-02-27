import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { streamSSE } from "hono/streaming";

import { loadConfig } from "c12";
import createDebug from "debug";

import { aiStreamer } from "./ai-streamer";
import { ConfigureCommand, FrontendCommand } from "./commands";
import { z } from "zod";

const debug = createDebug("aistreamer");

const app = new Hono();

app.use("*", serveStatic({ root: "./dist" }));

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
  await aiStreamer.dispatchSpeechLine(prompt, {
    imageURL,
    interrupt,
    direct,
  });
  return c.json({ message: "ok" });
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

  await aiStreamer.dispatchSpeechLine(idlePrompt, { direct });
  return c.json({ message: "ok" });
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

const { config } = await loadConfig({
  configFile: process.argv[2],
  giget: false,
});

aiStreamer.configure(config);

serve({ fetch: app.fetch, port: 18881 }, (info) => {
  console.info(`Listening on http://localhost:${info.port}`);
});
