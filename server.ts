import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { streamSSE } from "hono/streaming";

import {
  streamChatAndSynthesize,
  Events,
} from "./openai-to-voicevox-streaming";

const app = new Hono();

app.use("*", serveStatic({ root: "./dist" }));

app.get("/api/stream", (c) => {
  console.log("start streaming");

  return streamSSE(
    c,
    async (stream) => {
      return new Promise((_resolve, reject) => {
        const sendCaption = async (s: string) => {
          console.log("sendCaption", s);
          await stream.writeSSE({
            data: JSON.stringify({
              text: s,
            }),
            event: "setCaption",
            id: Date.now().toString(),
          });
        };

        Events.on("updateCaption", sendCaption);

        stream.onAbort(() => {
          console.log("stream aborted");
          Events.off("updateCaption", sendCaption);
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

serve({ fetch: app.fetch, port: 18881 }, (info) => {
  console.log(`Listening on http://localhost:${info.port}`);
});
