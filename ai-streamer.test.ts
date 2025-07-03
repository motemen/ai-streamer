import { describe, it, expect, vi, beforeEach } from "vitest";
import { createStreamingMockModel } from "./test-utils";
import { aiStreamer } from "./ai-streamer";
import { FrontendCommand } from "./commands";

vi.mock("./model-provider", () => ({
  getLanguageModel: vi.fn(),
}));

describe("AIStreamer", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock fetch for VOICEVOX API calls
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/audio_query")) {
        return Promise.resolve({
          json: () => Promise.resolve({ test: "query" }),
        });
      }
      if (url.includes("/synthesis")) {
        return Promise.resolve({
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
        });
      }
      return Promise.reject(new Error("Unknown URL"));
    });
  });

  describe("generateTalkText", () => {
    it("should process streaming response and split by punctuation", async () => {
      const mockModel = createStreamingMockModel([
        "こんにちは。",
        "今日はいい天気ですね！",
      ]);

      const { getLanguageModel } = await import("./model-provider");
      (getLanguageModel as any).mockReturnValue(mockModel);

      aiStreamer.configure({
        ai: { model: "mock-model" },
      });

      const result = await aiStreamer.dispatchSpeechLine("テスト", {});

      expect(result).toEqual(["こんにちは。", "今日はいい天気ですね！"]);
    });

    it("should handle maxHistory configuration", async () => {
      const mockModel = createStreamingMockModel(["レスポンス1"]);
      mockModel.doStream = vi.fn(mockModel.doStream);

      const { getLanguageModel } = await import("./model-provider");
      (getLanguageModel as any).mockReturnValue(mockModel);

      aiStreamer.configure({
        ai: { model: "mock-model" },
        maxHistory: 2,
      });

      await aiStreamer.dispatchSpeechLine("プロンプト1", {});
      await aiStreamer.dispatchSpeechLine("プロンプト2", {});
      await aiStreamer.dispatchSpeechLine("プロンプト3", {});

      expect(mockModel.doStream).toHaveBeenCalledTimes(3);
    });
  });

  describe("command parsing", () => {
    it("should parse and emit setAvatar commands", async () => {
      const mockModel = createStreamingMockModel([
        "アバターを変更します。<setAvatar avatar1>",
      ]);

      const { getLanguageModel } = await import("./model-provider");
      (getLanguageModel as any).mockReturnValue(mockModel);

      aiStreamer.configure({
        ai: { model: "mock-model" },
      });

      const emittedCommands: FrontendCommand[] = [];
      aiStreamer.on("frontendCommand", (command) => {
        emittedCommands.push(command);
      });

      await aiStreamer.dispatchSpeechLine("アバターを変更して", {});

      const avatarCommand = emittedCommands.find(
        (cmd) => cmd.type === "SET_AVATAR"
      );
      expect(avatarCommand).toEqual({
        type: "SET_AVATAR",
        avatar: "avatar1",
      });
    });

    it("should remove commands from displayed text", async () => {
      const mockModel = createStreamingMockModel([
        "テキスト<setAvatar test>です。",
      ]);

      const { getLanguageModel } = await import("./model-provider");
      (getLanguageModel as any).mockReturnValue(mockModel);

      aiStreamer.configure({
        ai: { model: "mock-model" },
      });

      const captionCommands: FrontendCommand[] = [];
      aiStreamer.on("frontendCommand", (command) => {
        if (command.type === "UPDATE_CAPTION") {
          captionCommands.push(command);
        }
      });

      await aiStreamer.dispatchSpeechLine("テスト", {});

      const captionCommand = captionCommands.find(
        (cmd) => cmd.type === "UPDATE_CAPTION"
      );
      expect(captionCommand?.caption).toBe("テキストです。");
    });
  });

  describe("configuration", () => {
    it("should apply temperature setting", async () => {
      const mockModel = createStreamingMockModel(["レスポンス"]);
      mockModel.doStream = vi.fn(mockModel.doStream);

      const { getLanguageModel } = await import("./model-provider");
      (getLanguageModel as any).mockReturnValue(mockModel);

      aiStreamer.configure({
        ai: {
          model: "mock-model",
          temperature: 0.8,
        },
      });

      await aiStreamer.dispatchSpeechLine("テスト", {});

      expect(mockModel.doStream).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.8,
        })
      );
    });
  });

  describe("error handling", () => {
    it("should handle stream interruption", async () => {
      const mockModel = createStreamingMockModel([
        "長い",
        "レスポンス",
        "テキスト",
      ]);

      const { getLanguageModel } = await import("./model-provider");
      (getLanguageModel as any).mockReturnValue(mockModel);

      aiStreamer.configure({
        ai: { model: "mock-model" },
      });

      const commands: FrontendCommand[] = [];
      aiStreamer.on("frontendCommand", (command) => {
        commands.push(command);
      });

      await aiStreamer.dispatchSpeechLine("プロンプト2", { interrupt: true });

      const clearCommand = commands.find((cmd) => cmd.type === "CLEAR_QUEUE");
      expect(clearCommand).toBeDefined();
    });
  });
});
