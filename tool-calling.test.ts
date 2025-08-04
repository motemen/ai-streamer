import { describe, it, expect, beforeEach } from "vitest";
import { z } from "zod";
import AIStreamer from "./ai-streamer";
import { buildDefaultTools } from "./tool-handlers";

describe("Tool Calling", () => {
  let aiStreamer: AIStreamer;

  beforeEach(() => {
    aiStreamer = new AIStreamer();
  });

  it("デフォルトのsetAvatarツールが利用可能", async () => {
    // AIモデルの設定なしでツールのみテスト
    const tools = buildDefaultTools(aiStreamer);

    // setAvatarツールの存在を確認
    expect(tools.setAvatar).toBeDefined();
  });

  it("設定ファイル内で直接定義したツールを読み込める", async () => {
    // AIモデルの設定なしでツールのみ設定
    aiStreamer.config = {
      ai: { model: "", temperature: 1 }, // 空のモデル設定
      prompt: "",
      maxHistory: 10,
      avatar: { enabled: true, directory: "" },
      replace: [],
      tools: {
        getTime: {
          description: "現在の時刻を取得する",
          inputSchema: z.object({}),
          execute: async () => {
            const now = new Date();
            return now.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
          },
        },
        rollDice: {
          description: "サイコロを振る",
          inputSchema: z.object({
            sides: z.number().default(6).describe("サイコロの面数"),
          }),
          execute: async (args: { sides: number }) => {
            const { sides } = args;
            const result = Math.floor(Math.random() * sides) + 1;
            return `${sides}面のサイコロを振った結果: ${result}`;
          },
        },
      },
    };

    const builtTools = aiStreamer["buildTools"]();
    expect(builtTools.getTime).toBeDefined();
    expect(builtTools.rollDice).toBeDefined();

    const defaultTools = buildDefaultTools(aiStreamer);
    expect(defaultTools.setAvatar).toBeDefined(); // デフォルトツールも存在

    // ツールの定義確認
    expect(builtTools.getTime.description).toBe("現在の時刻を取得する");
    expect(builtTools.rollDice.description).toBe("サイコロを振る");
  });

  it("setAvatarツールの定義が正しい", async () => {
    const tools = buildDefaultTools(aiStreamer);

    if (tools.setAvatar) {
      expect(tools.setAvatar.description).toBe(
        "Update current avatar for ai-streamer"
      );
      expect(tools.setAvatar.inputSchema).toBeDefined();
    }
  });

  it("aiStreamerインスタンスを使用するツール", async () => {
    // AIモデルの設定なしでツールのみ設定
    aiStreamer.config = {
      ai: { model: "", temperature: 1 },
      prompt: "",
      maxHistory: 10,
      avatar: { enabled: true, directory: "" },
      replace: [],
      tools: {
        incrementCounter: {
          description: "内部カウンターをインクリメント",
          inputSchema: z.object({}),
          execute: async (args: {}, aiStreamer: any) => {
            if (!aiStreamer._counter) {
              aiStreamer._counter = 0;
            }
            aiStreamer._counter += 1;
            return `カウンターの値: ${aiStreamer._counter}`;
          },
        },
      },
    };

    const tools = aiStreamer["buildTools"]();

    // ツールの定義確認
    expect(tools.incrementCounter).toBeDefined();
    expect(tools.incrementCounter.description).toBe(
      "内部カウンターをインクリメント"
    );
  });
});
