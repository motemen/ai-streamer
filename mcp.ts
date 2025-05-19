import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { aiStreamer } from "./ai-streamer";

export const mcpServer = new McpServer({
  name: "AI Streamer MCP",
  version: "0.1.0",
});

mcpServer.tool(
  "report_status",
  "現状を共有・レポートする。textパラメータで自然言語の説明を受け取り、記録します。",
  {
    text: z.string().describe("現状や状況説明など、自由記述のテキスト"),
  },
  async ({ text }) => {
    aiStreamer.dispatchSpeechLine(`ステータス: ${text}`, {}).catch((err) => {
      console.error(`[error] MCP report_status: ${err}`);
    });

    return {
      content: [
        {
          type: "text",
          text: `レポートを受け付けました: ${text}`,
        },
      ],
    };
  }
);
