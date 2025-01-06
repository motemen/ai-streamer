import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { streamSSE } from "hono/streaming";

import { loadConfig } from "c12";
import mkDebug from "debug";

import {
  enqueueChat,
  Events,
  getAvatarImage,
  configure,
  startOBSCaptureIfRequired,
} from "./ai-streamer";
import { FrontendCommand } from "./commands";
import { z } from "zod";

const debug = mkDebug("aistreamer");

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

        Events.on("frontendCommand", sendCommand);

        stream.onAbort(() => {
          debug("stream aborted");
          Events.off("frontendCommand", sendCommand);
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

const APIChatPayloadSchema = z.object({
  prompt: z.string().nonempty(),
  imageURL: z.string().optional(),
  preempt: z.boolean().optional(),
  direct: z.boolean().optional(),
});

app.post("/api/chat", async (c) => {
  const body = await c.req.json();
  const { success, data, error } = APIChatPayloadSchema.safeParse(body);
  if (!success) {
    return c.json(
      { error: "Invalid payload", details: error },
      { status: 400 }
    );
  }

  const { prompt, imageURL, preempt, direct } = data;
  await enqueueChat(prompt, { imageURL, preempt, useDirectPrompt: direct });
  return c.json({ message: "ok" });
});

app.get("/api/avatar/:name", async (c) => {
  const name = c.req.param("name");
  const imageData = await getAvatarImage(name);
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

configure(config);

startOBSCaptureIfRequired();

serve({ fetch: app.fetch, port: 18881 }, (info) => {
  console.info(`Listening on http://localhost:${info.port}`);
});
