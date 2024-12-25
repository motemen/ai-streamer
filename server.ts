import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { streamSSE } from "hono/streaming";

import {
  streamChatAndSynthesize,
  Events,
  getAvatarImage,
} from "./openai-to-voicevox-streaming";
import { FrontendCommand } from "./commands";

const app = new Hono();

app.use("*", serveStatic({ root: "./dist" }));

app.get("/api/stream", (c) => {
  console.log("start streaming");

  return streamSSE(
    c,
    async (stream) => {
      return new Promise((_resolve, reject) => {
        const sendCommand = async (command: FrontendCommand) => {
          console.log("sendCommand", command);
          await stream.writeSSE({
            data: JSON.stringify(command),
            event: command.type,
            id: Date.now().toString(),
          });
        };

        Events.on("frontendCommand", sendCommand);

        stream.onAbort(() => {
          console.log("stream aborted");
          Events.off("frontendCommand", sendCommand);
          reject();
        });
      });
    },
    async (error, stream) => {
      console.error("stream error", error);
      stream.close();
    }
  );
});

app.post("/api/chat", async (c) => {
  const formData = await c.req.formData();
  const prompt = formData.get("prompt") ?? "こんにちは。80文字で";
  await streamChatAndSynthesize(prompt.toString());
  return c.json({ message: "ok" });
});

app.get("/api/avatar/:name", async (c) => {
  const name = c.req.param("name");
  const imageData = await getAvatarImage(name);
  console.log({ imageData });
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

serve({ fetch: app.fetch, port: 18881 }, (info) => {
  console.log(`Listening on http://localhost:${info.port}`);
});
