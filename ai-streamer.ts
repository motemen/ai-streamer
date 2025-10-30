import { readFile } from "node:fs/promises";
import EventEmitter from "node:events";
import path from "node:path";

import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";
import { anthropic } from "@ai-sdk/anthropic";
import {
  streamText,
  createProviderRegistry,
  type LanguageModel,
  tool,
  type Tool,
  type AssistantModelMessage,
  type ModelMessage,
  stepCountIs,
} from "ai";
import PQueue from "p-queue";
import { simulateReadableStream } from "ai/test";

import type { z } from "zod";
import createDebug from "debug";

import {
  type FrontendCommand,
  UPDATE_CAPTION,
  PLAY_AUDIO,
  CLEAR_QUEUE,
} from "./commands";

import {
  ConfigSchema,
  DEFAULT_VOICEVOX_ORIGIN,
  generateSystemPrompt,
} from "./config";
import { buildDefaultTools } from "./tool-handlers";

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

  // tool から自由に扱ってよい領域
  public store: Record<string, any> = {};

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
  private model: LanguageModel;
  private tools: Record<string, Tool> = {};

  configure(input: unknown) {
    this.config = ConfigSchema.parse(input);
    debug("Loaded configuration: %O", this.config);

    this.model = AIStreamer.providerRegistry.languageModel(
      this.config.ai.model as Parameters<
        typeof AIStreamer.providerRegistry.languageModel
      >[0],
    );
    this.tools = this.buildTools();
  }

  private cancelCurrentTask() {
    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.currentAbortController = null;
    }
  }

  async *dispatchSpeechLineStream(
    prompt: string,
    {
      imageURL,
      interrupt,
      direct,
    }: { imageURL?: string; interrupt?: boolean; direct?: boolean },
  ): AsyncGenerator<string, void, unknown> {
    if (interrupt) {
      this.cancelCurrentTask();
      this.queue.clear();
      this.emit("frontendCommand", { type: CLEAR_QUEUE });
    }

    const abortController = new AbortController();
    this.currentAbortController = abortController;

    try {
      const textChunks = direct
        ? prompt.split(PUNCTUATION_REGEX)
        : this.generateTalkText(prompt, imageURL, {
            signal: abortController.signal,
          });

      for await (let text of textChunks) {
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

        yield text;
      }
    } finally {
      if (this.currentAbortController === abortController) {
        this.currentAbortController = null;
      }
    }
  }

  async getAvatarImage(name: string): Promise<Buffer | null> {
    const filePath = path.join(this.config.avatar.directory, name);
    return readFile(filePath).catch((err) => {
      debug(`Avatar image ${filePath} not found`, err);
      return null;
    });
  }

  private buildTools() {
    const tools: Record<string, Tool> = {};

    const defaultTools = buildDefaultTools(this);

    // ビルトインツールの追加
    for (const [name, toolDef] of Object.entries(defaultTools)) {
      if (toolDef === null) continue;
      tools[name] = toolDef;
    }

    // 設定ファイルからツールを追加
    for (const [name, toolDef] of Object.entries(this.config.tools || {})) {
      // 設定ファイルでexecute関数が直接定義されている場合
      tools[name] = tool({
        description: toolDef.description,
        inputSchema: toolDef.inputSchema,
        execute: async (params, options) => {
          const result = await toolDef.execute(params, {
            aiStreamer: this,
            ...options,
          });
          return result;
        },
      });
    }

    return tools;
  }

  private async *generateTalkText(
    prompt: string,
    imageURL?: string,
    { signal }: { signal?: AbortSignal } = {},
  ): AsyncGenerator<string, void, unknown> {
    const scripted = this.config.testing?.scripted?.find(
      (entry) => entry.match === prompt,
    );
    if (scripted) {
      const initialDelayInMs =
        scripted.initialDelayMs === undefined ? 0 : scripted.initialDelayMs;
      const chunkDelayInMs =
        scripted.chunkDelayMs === undefined ? 0 : scripted.chunkDelayMs;
      const stream = simulateReadableStream<string>({
        chunks: scripted.chunks,
        initialDelayInMs,
        chunkDelayInMs,
      });
      const reader = stream.getReader();
      let totalBuffer = "";
      let cancelled = false;
      try {
        while (true) {
          if (signal?.aborted) {
            await reader.cancel();
            cancelled = true;
            break;
          }
          const { value, done } = await reader.read();
          if (done) {
            break;
          }
          totalBuffer += value;
          yield value;
        }
      } finally {
        if (!cancelled) {
          reader.releaseLock();
        }
      }
      if (totalBuffer) {
        this.history.push(totalBuffer);
      }
      return;
    }

    const historyMessages: AssistantModelMessage[] = this.history
      .slice(-this.config.maxHistory)
      .map((content) => ({
        role: "assistant",
        content,
      }));

    const messages: ModelMessage[] = [
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

    debug("streamText start");

    const result = streamText({
      model: this.model,
      messages,
      providerOptions: this.config.ai.providerOptions as any,
      temperature: this.config.ai.temperature,
      abortSignal: signal,
      tools: this.tools,
      stopWhen: stepCountIs(5), // allow both tool-calling and text output
    });

    let buffer = "";
    let totalBuffer = "";
    for await (const part of result.fullStream) {
      if (part.type === "error") {
        throw new Error(`Stream error: ${part.error}`);
      }
      if (part.type !== "text-delta") {
        debug("streamText", { partType: part.type });
        continue;
      }

      if (signal?.aborted) {
        break;
      }

      buffer += part.text;
      totalBuffer += part.text;

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
    { signal }: { signal?: AbortSignal } = {},
  ): Promise<ArrayBuffer> {
    for (const { from, to } of this.config.replace) {
      text = text.replace(new RegExp(from, "gi"), to);
    }

    text = text.replace(/\s+/g, "").trim();

    debug("voicevox", { text });

    const voicevoxOrigin =
      this.config.voicevox?.origin ?? DEFAULT_VOICEVOX_ORIGIN;
    const audioQueryResponse = await fetch(
      `${voicevoxOrigin}/audio_query?speaker=1&text=${encodeURIComponent(
        text,
      )}`,
      {
        method: "POST",
        signal,
      },
    ).catch((err) => {
      throw new Error(`VOICEVOX API call failed: ${err.message}`);
    });

    if (!audioQueryResponse.ok) {
      throw new Error(
        `VOICEVOX API returned ${audioQueryResponse.status}: ${await audioQueryResponse.text()}`,
      );
    }
    const audioQuery = await audioQueryResponse.json();

    const synthesisResponse = await fetch(
      `${voicevoxOrigin}/synthesis?speaker=1`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(audioQuery),
        signal,
      },
    ).catch((err) => {
      throw new Error(`VOICEVOX API call failed: ${err.message}`);
    });

    if (!synthesisResponse.ok) {
      throw new Error(
        `VOICEVOX API returned ${synthesisResponse.status}: ${await synthesisResponse.text()}`,
      );
    }

    return synthesisResponse.arrayBuffer();
  }

  private parseCommand(text: string): FrontendCommand | null {
    const match = text.trim().match(/<([^>\s]+)(?:\s+([^>]+))?>/);
    if (!match) {
      return null;
    }

    const [, command] = match;
    debug("Unknown command", command);

    return null;
  }
}

export default AIStreamer;
export const aiStreamer = new AIStreamer();
