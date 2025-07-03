import { readFile } from "node:fs/promises";
import EventEmitter from "node:events";
import path from "node:path";

import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";
import { anthropic } from "@ai-sdk/anthropic";
import {
  streamText,
  CoreMessage,
  createProviderRegistry,
  CoreAssistantMessage,
  LanguageModelV1,
  tool,
} from "ai";
import PQueue from "p-queue";

import { z } from "zod";
import createDebug from "debug";

import {
  FrontendCommand,
  UPDATE_CAPTION,
  SET_AVATAR,
  PLAY_AUDIO,
  CLEAR_QUEUE,
} from "./commands";

import {
  ConfigSchema,
  DEFAULT_VOICEVOX_ORIGIN,
  generateSystemPrompt,
} from "./config";
import {
  builtInHandlers,
} from "./tool-handlers";

const debug = createDebug("aistreamer");

const PUNCTUATION_REGEX = /(?<=[、。！？]+)/;

type AIStreamerEventMap = {
  frontendCommand: [FrontendCommand];
};

class AIStreamer extends EventEmitter<AIStreamerEventMap> {
  config: z.infer<typeof ConfigSchema>;
  private history: string[] = [];

  // enqueueChatが並列に実行されると台詞が混ざるので、一つずつ実行する
  private queue: PQueue;
  private currentAbortController: AbortController | null = null;

  constructor() {
    super({ captureRejections: true });
    this.config = ConfigSchema.parse({});
    this.queue = new PQueue({ concurrency: 1 });
  }

  private static providerRegistry = createProviderRegistry({
    openai,
    google,
    anthropic,
  });
  private model: LanguageModelV1;

  configure(input: unknown) {
    this.config = ConfigSchema.parse(input);
    debug("Loaded configuration: %O", this.config);

    this.model = AIStreamer.providerRegistry.languageModel(
      // @ts-expect-error 入力はstringなので無視しておく
      this.config.ai.model
    );
  }

  private cancelCurrentTask() {
    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.currentAbortController = null;
    }
  }

  async dispatchSpeechLine(
    prompt: string,
    {
      imageURL,
      interrupt,
      direct,
    }: { imageURL?: string; interrupt?: boolean; direct?: boolean }
  ): Promise<void | string[]> {
    if (interrupt) {
      this.cancelCurrentTask();
      this.queue.clear();
      this.emit("frontendCommand", { type: CLEAR_QUEUE });
    }

    return await this.queue.add(async (): Promise<string[]> => {
      const abortController = new AbortController();
      this.currentAbortController = abortController;

      const result: string[] = [];

      try {
        const textChunks = direct
          ? prompt.split(PUNCTUATION_REGEX)
          : this.generateTalkText(prompt, imageURL, {
              signal: abortController.signal,
            });

        for await (let text of textChunks) {
          result.push(text);

          if (abortController.signal.aborted) {
            break;
          }

          const commands: FrontendCommand[] = [];

          text = text.replace(/\s*<[^>]+>\s*/gi, (match) => {
            const command = this.parseCommand(match);
            if (command) {
              commands.push(command);
            }
            return "";
          });

          commands.push({ type: UPDATE_CAPTION, caption: text });

          const audioBuffer = await this.synthesizeAudio(text, {
            signal: abortController.signal,
          });

          for (const command of commands) {
            this.emit("frontendCommand", command);
          }

          const audioDataBase64 = Buffer.from(audioBuffer).toString("base64");
          this.emit("frontendCommand", { type: PLAY_AUDIO, audioDataBase64 });
        }
      } finally {
        if (this.currentAbortController === abortController) {
          this.currentAbortController = null;
        }
      }

      return result;
    });
  }

  async getAvatarImage(name: string): Promise<Buffer | null> {
    const filePath = path.join(this.config.avatar.directory, name);
    return readFile(filePath).catch((err) => {
      console.warn(`Avatar image ${filePath} not found`, err);
      return null;
    });
  }

  private buildTools() {
    const tools: Record<string, ReturnType<typeof tool>> = {};

    // setAvatarツールをデフォルトで追加
    tools.setAvatar = tool({
      description: "AI Streamerのアバターを変更する",
      parameters: z.object({
        name: z.string().describe("アバター名"),
      }),
      execute: async (params) => builtInHandlers.setAvatar(params, this),
    });

    // 設定ファイルからツールを追加
    if (this.config.tools) {
      for (const [name, toolDef] of Object.entries(this.config.tools)) {
        // 設定ファイルでexecute関数が直接定義されている場合
        if (toolDef.execute) {
          tools[name] = tool({
            description: toolDef.description,
            parameters: toolDef.parameters || z.object({}),
            execute: async (params) => {
              // 関数の第二引数にaiStreamerインスタンスを渡す
              const result = await toolDef.execute!(params, this);
              return typeof result === 'string' ? result : JSON.stringify(result);
            },
          });
        }
        // 後方互換性: handlerが指定されている場合
        else if (toolDef.handler) {
          const handler = builtInHandlers[toolDef.handler];
          if (handler) {
            tools[name] = tool({
              description: toolDef.description,
              parameters: toolDef.parameters || z.object({}),
              execute: async (params) => handler(params, this),
            });
          } else {
            console.warn(`Handler '${toolDef.handler}' not found for tool '${name}'`);
          }
        }
      }
    }

    return tools;
  }

  private async *generateTalkText(
    prompt: string,
    imageURL?: string,
    { signal }: { signal?: AbortSignal } = {}
  ): AsyncGenerator<string, void, unknown> {
    const historyMessages: CoreAssistantMessage[] = this.history
      .slice(-this.config.maxHistory)
      .map((content) => ({
        role: "assistant",
        content,
      }));

    const messages: CoreMessage[] = [
      { role: "system", content: generateSystemPrompt(this.config) },
      ...historyMessages,

      {
        role: "user",
        content: imageURL
          ? [
              { type: "text", text: prompt },
              { type: "image", image: new URL(imageURL) },
            ]
          : [{ type: "text", text: prompt }],
      },
    ];

    const result = await streamText({
      model: this.model,
      messages,
      temperature: this.config.ai.temperature,
      abortSignal: signal,
      tools: this.buildTools(),
      maxSteps: 5,
    });

    let buffer = "";
    let totalBuffer = "";
    for await (const textPart of result.textStream) {
      if (signal?.aborted) {
        break;
      }

      buffer += textPart;
      totalBuffer += textPart;

      if (debug.enabled) {
        process.stderr.write("\r" + buffer);
      }

      const parts = buffer.split(PUNCTUATION_REGEX);
      buffer = parts.pop() || "";
      for (const part of parts) {
        yield part;
      }
    }
    yield buffer;

    this.history.push(totalBuffer);
  }

  private async synthesizeAudio(
    text: string,
    { signal }: { signal?: AbortSignal } = {}
  ): Promise<ArrayBuffer> {
    for (const { from, to } of this.config.replace) {
      text = text.replace(new RegExp(from, "g"), to);
    }

    const voicevoxOrigin =
      this.config.voicevox?.origin ?? DEFAULT_VOICEVOX_ORIGIN;
    const audioQueryResponse = await fetch(
      `${voicevoxOrigin}/audio_query?speaker=1&text=${encodeURIComponent(
        text
      )}`,
      {
        method: "POST",
        signal,
      }
    ).catch((err) => {
      throw new Error(`POST ${voicevoxOrigin}/audio_query failed: ${err}`);
    });
    const audioQuery = await audioQueryResponse.json();

    const synthesisResponse = await fetch(
      `${voicevoxOrigin}/synthesis?speaker=1`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(audioQuery),
        signal,
      }
    ).catch((err) => {
      throw new Error(`POST ${voicevoxOrigin}/synthesis failed: ${err}`);
    });

    return synthesisResponse.arrayBuffer();
  }

  private parseCommand(text: string): FrontendCommand | null {
    const match = text.trim().match(/<([^>\s]+)(?:\s+([^>]+))?>/);
    if (!match) {
      return null;
    }

    const [, command, args] = match;
    if (command === "setAvatar") {
      return { type: SET_AVATAR, avatar: args ?? "default" };
    }

    console.warn("Unknown command", command);

    return null;
  }
}

export default AIStreamer;
export const aiStreamer = new AIStreamer();
