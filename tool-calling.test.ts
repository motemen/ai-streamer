import { describe, it, expect, vi, beforeEach } from "vitest";
import { MockLanguageModelV1 } from "ai/test";
import { z } from "zod";
import AIStreamer from "./ai-streamer";
import { builtInHandlers } from "./tool-handlers";

describe("Tool Calling", () => {
  let aiStreamer: AIStreamer;
  let mockModel: MockLanguageModelV1;

  beforeEach(() => {
    aiStreamer = new AIStreamer();
    mockModel = new MockLanguageModelV1({
      doStream: async ({ tools }) => {
        // ツールが定義されていることを確認
        expect(tools).toBeDefined();
        expect(tools?.setAvatar).toBeDefined();
        expect(tools?.getTime).toBeDefined();

        return {
          stream: new ReadableStream({
            async start(controller) {
              // テキストを送信
              controller.enqueue({
                type: "text-delta",
                textDelta: "今から",
              });
              controller.enqueue({
                type: "text-delta",
                textDelta: "時刻を確認します。",
              });

              // ツール呼び出し
              controller.enqueue({
                type: "tool-call",
                toolCallType: "function",
                toolCallId: "1",
                toolName: "getTime",
                args: {},
              });

              // ツール結果を受け取った後のテキスト
              controller.enqueue({
                type: "text-delta",
                textDelta: "現在の時刻は",
              });
              controller.enqueue({
                type: "text-delta",
                textDelta: "取得しました。",
              });

              controller.enqueue({
                type: "finish",
                finishReason: "stop",
                usage: { promptTokens: 10, completionTokens: 20 },
              });
              controller.close();
            },
          }),
          rawCall: { rawPrompt: null, rawSettings: {} },
        };
      },
    });

    // モックモデルを使用するように設定
    vi.spyOn(AIStreamer as never, "providerRegistry", "get").mockReturnValue({
      languageModel: () => mockModel,
    });
  });

  it("デフォルトのsetAvatarツールが利用可能", async () => {
    aiStreamer.configure({
      ai: { model: "mock:test" },
    });

    const tools = aiStreamer["buildTools"]();
    
    // setAvatarツールの存在を確認
    expect(tools.setAvatar).toBeDefined();
  });

  it("設定ファイル内で直接定義したツールを読み込める", async () => {
    aiStreamer.configure({
      ai: { model: "mock:test" },
      tools: {
        getTime: {
          description: "現在の時刻を取得する",
          parameters: z.object({}),
          execute: async () => {
            const now = new Date();
            return now.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
          },
        },
        rollDice: {
          description: "サイコロを振る",
          parameters: z.object({
            sides: z.number().default(6).describe("サイコロの面数"),
          }),
          execute: async ({ sides }) => {
            const result = Math.floor(Math.random() * sides) + 1;
            return `${sides}面のサイコロを振った結果: ${result}`;
          },
        },
      },
    });

    const tools = aiStreamer["buildTools"]();
    expect(tools.getTime).toBeDefined();
    expect(tools.rollDice).toBeDefined();
    expect(tools.setAvatar).toBeDefined(); // デフォルトツールも存在
    
    // ツールの実行テスト
    const timeResult = await tools.getTime.execute({});
    expect(timeResult).toMatch(/\d{4}\/\d{1,2}\/\d{1,2}/);
    
    const diceResult = await tools.rollDice.execute({ sides: 6 });
    expect(diceResult).toMatch(/6面のサイコロを振った結果: [1-6]/);
  });

  it("setAvatarツールがフロントエンドコマンドを発行する", async () => {
    const emitSpy = vi.spyOn(aiStreamer, "emit");

    await builtInHandlers.setAvatar({ name: "happy" }, aiStreamer);

    expect(emitSpy).toHaveBeenCalledWith("frontendCommand", {
      type: "SET_AVATAR",
      name: "happy",
    });
  });

  it("setAvatarハンドラーが正しく動作する", async () => {
    const result = await builtInHandlers.setAvatar({ name: "neutral" }, aiStreamer);
    expect(result).toBe("アバターをneutralに変更しました");
  });

  it("aiStreamerインスタンスを使用するツール", async () => {
    aiStreamer.configure({
      ai: { model: "mock:test" },
      tools: {
        incrementCounter: {
          description: "内部カウンターをインクリメント",
          parameters: z.object({}),
          execute: async (params, aiStreamer) => {
            if (!aiStreamer._counter) {
              aiStreamer._counter = 0;
            }
            aiStreamer._counter += 1;
            return `カウンターの値: ${aiStreamer._counter}`;
          },
        },
      },
    });

    const tools = aiStreamer["buildTools"]();
    const result1 = await tools.incrementCounter.execute({});
    expect(result1).toBe("カウンターの値: 1");
    
    const result2 = await tools.incrementCounter.execute({});
    expect(result2).toBe("カウンターの値: 2");
  });
});