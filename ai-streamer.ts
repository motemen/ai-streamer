import { readFile } from "node:fs/promises";
import EventEmitter from "node:events";
import { fileURLToPath } from "node:url";
import path, { dirname } from "node:path";

import { OpenAI } from "openai";
import { z } from "zod";
import createDebug from "debug";

import {
  FrontendCommand,
  UPDATE_CAPTION,
  SET_AVATAR,
  PLAY_AUDIO,
} from "./commands";

const debug = createDebug("aistreamer");

/*** Configuration ***/

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEFAULT_VOICEVOX_ORIGIN = "http://localhost:50021";
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";

const DEFAULT_AVATAR_IMAGE_DIR = path.join(__dirname, "avatars");

const DEFAULT_PROMPT = `
あなたはゲーム実況ストリーマーです。
あなたは情緒豊かで、いつも視聴者に楽しい時間を提供します。
これからゲームのプレイ状況を伝えるので、それに合わせたセリフを生成してください。

また、発言の内容に合わせて、文の前後に以下の形式のコマンドを挿入して表情を指定してください。
<setAvatar default>

avatarとして指定できるのは以下です。
- default
- 喜び
- 当惑
- 涙目
- 焦り
- ドヤ顔
`.trim();

const PUNCTUATION_REGEX = /(?<=[、。！？]+)/;

export const ConfigSchema = z.object({
  voicevox: z
    .object({
      origin: z.string().default(DEFAULT_VOICEVOX_ORIGIN),
    })
    .optional(),

  openai: z
    .object({
      model: z.string().default(DEFAULT_OPENAI_MODEL),
      baseURL: z.string().optional(),
    })
    .optional(),

  prompt: z.string().default(DEFAULT_PROMPT),

  replace: z
    .array(
      z.object({
        from: z.string(),
        to: z.string(),
      })
    )
    .default([]),

  avatarImageDir: z.string().default(DEFAULT_AVATAR_IMAGE_DIR),
});

type AIStreamerEventMap = {
  frontendCommand: [FrontendCommand];
};

class AIStreamer extends EventEmitter<AIStreamerEventMap> {
  private config: z.infer<typeof ConfigSchema>;
  private openai: OpenAI | null = null;

  constructor() {
    super({ captureRejections: true });
    this.config = ConfigSchema.parse({});
  }

  configure(input: unknown) {
    this.config = ConfigSchema.parse(input);
    debug("Loaded configuration: %O", this.config);
  }

  async enqueueChat(
    prompt: string,
    {
      imageURL,
      preempt = true,
      useDirectPrompt = false,
    }: { imageURL?: string; preempt?: boolean; useDirectPrompt?: boolean }
  ): Promise<void> {
    if (preempt) {
      // TODO: emit a preempt event
    }

    const textChunks = useDirectPrompt
      ? prompt.split(PUNCTUATION_REGEX)
      : this.getChatResponsesStream(prompt, imageURL);

    for await (let text of textChunks) {
      const commands: FrontendCommand[] = [];

      text = text.replace(/\s*<[^>]+>\s*/gi, (match) => {
        const command = this.parseCommand(match);
        if (command) {
          commands.push(command);
        }
        return "";
      });

      commands.push({ type: UPDATE_CAPTION, caption: text });

      const audioBuffer = await this.synthesizeAudio(text);

      for (const command of commands) {
        this.emit("frontendCommand", command);
      }

      const audioDataBase64 = Buffer.from(audioBuffer).toString("base64");
      this.emit("frontendCommand", { type: PLAY_AUDIO, audioDataBase64 });
    }
  }

  async getAvatarImage(name: string): Promise<Buffer<ArrayBufferLike> | null> {
    const filePath = path.join(DEFAULT_AVATAR_IMAGE_DIR, name);
    return readFile(filePath).catch((err) => {
      console.warn(`Avatar image ${filePath} not found`, err);
      return null;
    });
  }

  private async *getChatResponsesStream(
    prompt: string,
    imageURL?: string
  ): AsyncGenerator<string, void, unknown> {
    if (!this.openai) {
      this.openai = new OpenAI({
        ...(this.config.openai?.baseURL
          ? { baseURL: this.config.openai.baseURL }
          : {}),
      });
    }

    const responseStream = await this.openai.chat.completions.create({
      temperature: 1.2,
      model: this.config.openai?.model ?? DEFAULT_OPENAI_MODEL,
      messages: [
        { role: "system", content: this.config.prompt },
        imageURL
          ? {
              role: "user",
              content: [
                { type: "text", text: prompt },
                { type: "image_url", image_url: { url: imageURL } },
              ],
            }
          : {
              role: "user",
              content: [{ type: "text", text: prompt }],
            },
      ],
      stream: true,
    });

    let buffer = "";
    for await (const chunk of responseStream) {
      buffer += chunk.choices[0].delta.content ?? "";
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
  }

  private async synthesizeAudio(text: string): Promise<ArrayBuffer> {
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
      }
    ).catch((err) => {
      throw new Error(`POST ${voicevoxOrigin}/synthesis failed: ${err}`);
    });

    return synthesisResponse.arrayBuffer();
  }

  private async playAudio(text: string, audioBuffer: ArrayBuffer) {
    debug(`Playing audio buffer`);

    const audioDataBase64 = Buffer.from(audioBuffer).toString("base64");
    this.emit("frontendCommand", { type: PLAY_AUDIO, audioDataBase64 });
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
