import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { aiStreamer } from "./ai-streamer";

export const mcpServer = new McpServer({
  name: "AI Streamer MCP",
  version: "0.1.0",
});

mcpServer.tool(
  "aistreamer_chat",
  "AI Streamerに発話させる",
  {
    text: z.string().describe("発話のベースとなるテキスト"),
    direct: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "textを直接、台詞として扱う。falseの場合はAIに台詞を生成させる",
      ),
    interrupt: z
      .boolean()
      .optional()
      .default(false)
      .describe("進行中の発話を中断する"),
  },
  async ({ text, direct, interrupt }) => {
    // run in background
    (async () => {
      for await (const _ of aiStreamer.dispatchSpeechLineStream(text, {
        direct,
        interrupt,
      })) {
        // do nothing
      }
    })().catch((err) => {
      console.error(`[error] MCP report_status: ${err}`);
    });

    return {
      content: [
        {
          type: "text",
          text: `発話を受け付けました: ${text}`,
        },
      ],
    };
  },
);
