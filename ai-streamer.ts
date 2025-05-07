import { readFile } from "node:fs/promises";
import EventEmitter from "node:events";
import path from "node:path";

import { OpenAI } from "openai";
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
  DEFAULT_OPENAI_MODEL,
  DEFAULT_VOICEVOX_ORIGIN,
} from "./config";

import {
  ChatCompletionMessageParam,
  ChatCompletionContentPartImage,
} from "openai/resources/index";

const debug = createDebug("aistreamer");

const PUNCTUATION_REGEX = /(?<=[、。！？]+)/;

type AIStreamerEventMap = {
  frontendCommand: [FrontendCommand];
};

class AIStreamer extends EventEmitter<AIStreamerEventMap> {
  config: z.infer<typeof ConfigSchema>;
  private openai: OpenAI | null = null;
  private history: string[] = [];

  // enqueueChatが並列に実行されると台詞が混ざるので、一つずつ実行する
  private queue: PQueue;
  private currentAbortController: AbortController | null = null;

  constructor() {
    super({ captureRejections: true });
    this.config = ConfigSchema.parse({});
    this.queue = new PQueue({ concurrency: 1 });
  }

  configure(input: unknown) {
    this.config = ConfigSchema.parse(input);
    debug("Loaded configuration: %O", this.config);
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
  ): Promise<void> {
    if (interrupt) {
      this.cancelCurrentTask();
      this.queue.clear();
      this.emit("frontendCommand", { type: CLEAR_QUEUE });
    }

    await this.queue.add(async () => {
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
        }
      } finally {
        if (this.currentAbortController === abortController) {
          this.currentAbortController = null;
        }
      }
    });
  }

  async getAvatarImage(name: string): Promise<Buffer | null> {
    const filePath = path.join(this.config.avatarImageDir, name);
    return readFile(filePath).catch((err) => {
      console.warn(`Avatar image ${filePath} not found`, err);
      return null;
    });
  }

  private async *generateTalkText(
    prompt: string,
    imageURL?: string,
    { signal }: { signal?: AbortSignal } = {}
  ): AsyncGenerator<string, void, unknown> {
    if (!this.openai) {
      const baseURL = this.config.openai?.baseURL;
      this.openai = new OpenAI({
        ...(baseURL ? { baseURL } : {}),
      });
    }

    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: this.config.prompt },

      ...this.history.slice(-this.config.maxHistory).map(
        (content): ChatCompletionMessageParam => ({
          role: "assistant",
          content,
        })
      ),

      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          ...(imageURL
            ? [
                {
                  type: "image_url",
                  image_url: { url: imageURL },
                } satisfies ChatCompletionContentPartImage,
              ]
            : []),
        ],
      },
    ];

    const responseStream = await this.openai.chat.completions.create(
      {
        temperature: 1.2,
        model: this.config.openai?.model ?? DEFAULT_OPENAI_MODEL,
        messages,
        stream: true,
      },
      signal ? { signal } : {}
    );

    let buffer = "";
    let totalBuffer = "";
    for await (const chunk of responseStream) {
      if (signal?.aborted) {
        break;
      }

      buffer += chunk.choices[0].delta.content ?? "";
      totalBuffer += chunk.choices[0].delta.content ?? "";

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

export const aiStreamer = new AIStreamer();
