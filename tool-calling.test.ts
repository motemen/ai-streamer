import { describe, it, expect, vi, beforeEach } from "vitest";
import { MockLanguageModelV1 } from "ai/test";
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

  it("デフォルトツールが利用可能", async () => {
    aiStreamer.configure({
      ai: { model: "mock:test" },
    });

    const tools = aiStreamer["buildTools"]();
    
    // デフォルトツールの存在を確認
    expect(tools.setAvatar).toBeDefined();
    expect(tools.getTime).toBeDefined();
    
    // ツールの実行を確認（モックモデルでの統合テストは難しいため）
    const timeResult = await tools.getTime.execute({});
    expect(timeResult).toMatch(/\d{4}\/\d{1,2}\/\d{1,2}/);
  });

  it("カスタムツールを設定から読み込める", async () => {
    aiStreamer.configure({
      ai: { model: "mock:test" },
      tools: {
        rollDice: {
          description: "サイコロを振る",
          parameters: {
            sides: {
              type: "number",
              description: "サイコロの面数",
              optional: true,
            },
          },
          handler: "rollDice",
        },
      },
    });

    const tools = aiStreamer["buildTools"]();
    expect(tools.rollDice).toBeDefined();
    expect(tools.setAvatar).toBeDefined(); // デフォルトツールも存在
    expect(tools.getTime).toBeDefined();
  });

  it("setAvatarツールがフロントエンドコマンドを発行する", async () => {
    const emitSpy = vi.spyOn(aiStreamer, "emit");

    await builtInHandlers.setAvatar({ name: "happy" }, aiStreamer);

    expect(emitSpy).toHaveBeenCalledWith("frontendCommand", {
      type: "SET_AVATAR",
      name: "happy",
    });
  });

  it("getTimeツールが現在時刻を返す", async () => {
    const result = await builtInHandlers.getTime({}, aiStreamer);
    expect(result).toMatch(/\d{4}\/\d{1,2}\/\d{1,2}/); // 日付形式を確認
  });

  it("rollDiceツールがランダムな結果を返す", async () => {
    const result = await builtInHandlers.rollDice({ sides: 6 }, aiStreamer);
    expect(result).toMatch(/6面のサイコロを振った結果: [1-6]/);
  });

  it("getWeatherツールがモックの天気情報を返す", async () => {
    const result = await builtInHandlers.getWeather(
      { location: "東京" },
      aiStreamer
    );
    expect(result).toMatch(/東京の天気は.+、気温は\d+度です/);
  });
});