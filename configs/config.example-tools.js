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
あなたは元気で親しみやすいAIアシスタントです。
ユーザーとの会話を楽しみ、役立つ情報を提供します。
時刻や天気、サイコロなど様々なツールを使って楽しい会話をしてください。
`.trim(),

  // カスタムツールの定義（設定ファイル内で直接実装）
  tools: {
    // 現在時刻を取得
    getTime: {
      description: "現在の時刻を取得する",
      parameters: z.object({}),
      execute: async () => {
        const now = new Date();
        return now.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
      },
    },

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

    // 天気を取得する（モック）
    getWeather: {
      description: "指定された場所の天気を取得する",
      parameters: z.object({
        location: z.string().describe("天気を取得する場所"),
      }),
      execute: async ({ location }) => {
        const weather = ["晴れ", "曇り", "雨", "雪"][Math.floor(Math.random() * 4)];
        const temp = Math.floor(Math.random() * 20) + 10;
        return `${location}の天気は${weather}、気温は${temp}度です`;
      },
    },

    // 簡単な計算
    calculate: {
      description: "四則演算を実行する",
      parameters: z.object({
        a: z.number().describe("計算する数値1"),
        b: z.number().describe("計算する数値2"),
        operation: z.enum(["add", "subtract", "multiply", "divide"]).describe("演算子"),
      }),
      execute: async ({ a, b, operation }) => {
        let result;
        switch (operation) {
          case "add":
            result = a + b;
            break;
          case "subtract":
            result = a - b;
            break;
          case "multiply":
            result = a * b;
            break;
          case "divide":
            result = b !== 0 ? a / b : "0で割ることはできません";
            break;
        }
        return `${a} ${operation} ${b} = ${result}`;
      },
    },

    // カウンター（aiStreamerインスタンスを使用する例）
    incrementCounter: {
      description: "内部カウンターをインクリメントする",
      parameters: z.object({}),
      execute: async (params, aiStreamer) => {
        // aiStreamerインスタンスにカウンターを追加（例）
        if (!aiStreamer._counter) {
          aiStreamer._counter = 0;
        }
        aiStreamer._counter += 1;
        return `カウンターの値: ${aiStreamer._counter}`;
      },
    },
  },
};