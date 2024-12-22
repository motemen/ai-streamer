import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { streamSSE } from "hono/streaming";

import {
  streamChatAndSynthesize,
  Clients,
} from "./openai-to-voicevox-streaming";

const app = new Hono();

app.get("/api/stream", (c) => {
  console.log("start streaming");

  return streamSSE(c, async (stream) => {
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
      Clients.add(sendCaption);

      stream.onAbort(() => {
        console.log("stream aborted");
        Clients.delete(sendCaption);
        reject();
      });
    });
  });
});

app.post("/api/chat", async (c) => {
  const prompt = "こんにちは。80文字で";
  await streamChatAndSynthesize(prompt);
  return c.json({ message: "ok" });
});

serve({ fetch: app.fetch, port: 18881 }, (info) => {
  console.log(`Listening on http://localhost:${info.port}`);
});
