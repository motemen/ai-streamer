// AI Streamerのツール設定例（設定ファイル内でツールを直接定義）
import { z } from "zod";

export default {
  // AIモデルの設定
  ai: {
    model: "openai:gpt-4o-mini",
    temperature: 1.0,
  },

  // システムプロンプト
  prompt: `
あなたは元気で親しみやすいゲーム実況AIです。
サイコロを使った遊びも楽しめます。
`.trim(),

  // カスタムツールの定義（設定ファイル内で直接実装）
  tools: {
    // サイコロを振る
    rollDice: {
      description: "指定された面数のサイコロを振る",
      parameters: z.object({
        sides: z.number().default(6).describe("サイコロの面数"),
      }),
      execute: async ({ sides }) => {
        const result = Math.floor(Math.random() * sides) + 1;
        return `${sides}面のサイコロを振った結果: ${result}`;
      },
    },
  },
};