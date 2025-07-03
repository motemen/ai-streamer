import { z } from "zod";
import { SET_AVATAR } from "./commands";
import type AIStreamer from "./ai-streamer";

export type ToolHandler = (
  params: Record<string, unknown>,
  aiStreamer: AIStreamer
) => Promise<string>;

export const builtInHandlers: Record<string, ToolHandler> = {
  setAvatar: async (params, aiStreamer) => {
    const { name } = params;
    aiStreamer.emit("frontendCommand", { type: SET_AVATAR, name });
    return `アバターを${name}に変更しました`;
  },

  getTime: async () => {
    const now = new Date();
    return now.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
  },

  getWeather: async (params) => {
    const { location } = params;
    // これはモックの例です
    const weather = ["晴れ", "曇り", "雨", "雪"][Math.floor(Math.random() * 4)];
    const temp = Math.floor(Math.random() * 20) + 10;
    return `${location}の天気は${weather}、気温は${temp}度です`;
  },

  rollDice: async (params) => {
    const { sides = 6 } = params;
    const result = Math.floor(Math.random() * sides) + 1;
    return `${sides}面のサイコロを振った結果: ${result}`;
  },
};

// デフォルトのツール定義
export const defaultTools = {
  setAvatar: {
    description: "AI Streamerのアバターを変更する",
    parameters: z.object({
      name: z.string().describe("アバター名"),
    }),
    handler: "setAvatar",
  },
  getTime: {
    description: "現在の時刻を取得する",
    parameters: z.object({}),
    handler: "getTime",
  },
};