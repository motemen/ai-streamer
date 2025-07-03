// AI Streamerのツール設定例
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
`.trim(),

  // カスタムツールの定義
  tools: {
    // カスタムツール1: サイコロを振る
    rollDice: {
      description: "指定された面数のサイコロを振る",
      parameters: {
        sides: {
          type: "number",
          description: "サイコロの面数（デフォルト6）",
          optional: true,
        },
      },
      handler: "rollDice", // tool-handlers.tsの関数名
    },

    // カスタムツール2: 天気を取得する（モック）
    getWeather: {
      description: "指定された場所の天気を取得する",
      parameters: {
        location: {
          type: "string",
          description: "天気を取得する場所",
        },
      },
      handler: "getWeather",
    },

    // デフォルトツールを上書き
    setAvatar: {
      description: "キャラクターの表情を変更する",
      parameters: {
        name: {
          type: "string",
          description: "表情の名前（happy, sad, angry, surprised, neutralなど）",
        },
      },
      handler: "setAvatar",
    },
  },
};