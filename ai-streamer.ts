import { readFile } from "node:fs/promises";
import EventEmitter from "node:events";
import { fileURLToPath } from "node:url";
import path, { dirname } from "node:path";

import { OpenAI } from "openai";
import PQueue from "p-queue";
import { z } from "zod";
import OBSWebSocket from "obs-websocket-js";
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

const DEFAULT_OBS_URL = "ws://127.0.0.1:4455";

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

  obs: z
    .object({
      url: z.string().default(DEFAULT_OBS_URL),
      password: z.string().optional(),
      sourceName: z.string(),
      prompt: z.string(),
      waitMilliseconds: z.number().default(1000),
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

let Config: z.infer<typeof ConfigSchema>;

export function configure(input: unknown) {
  Config = ConfigSchema.parse(input);
  debug("Loaded configuration: %O", Config);
}

type AIStreamerEventMap = {
  frontendCommand: [FrontendCommand];
};

export const Events = new EventEmitter<AIStreamerEventMap>({
  captureRejections: true,
});

let openai: OpenAI;

export async function enqueueChat(
  prompt: string,
  { imageURL, preempt = true }: { imageURL?: string; preempt?: boolean }
): Promise<void> {
  if (preempt) {
    taskQueue.clear();
  }

  let lastPromise = Promise.resolve();

  for await (let text of getChatResponsesStream(prompt, imageURL)) {
    const commands: FrontendCommand[] = [];

    text = text.replace(/\s*<[^>]+>\s*/gi, (match) => {
      const command = parseCommand(match);
      if (command) {
        commands.push(command);
      }
      return "";
    });

    commands.push({ type: UPDATE_CAPTION, caption: text });

    const audioBuffer = await synthesizeAudio(text);
    lastPromise = taskQueue
      .add(async () => {
        for (const command of commands) {
          Events.emit("frontendCommand", command);
        }

        return playAudio(text, audioBuffer);
      })
      .then(() => {});
  }

  return lastPromise;
}

export async function getAvatarImage(
  name: string
): Promise<Buffer<ArrayBufferLike> | null> {
  const filePath = path.join(DEFAULT_AVATAR_IMAGE_DIR, name);
  return readFile(filePath).catch((err) => {
    console.warn(`Avatar image ${filePath} not found`, err);
    return null;
  });
}

const taskQueue = new PQueue({ concurrency: 1 });

async function* getChatResponsesStream(
  prompt: string,
  imageURL?: string
): AsyncGenerator<string, void, unknown> {
  if (!openai) {
    openai = new OpenAI({
      ...(Config.openai?.baseURL ? { baseURL: Config.openai.baseURL } : {}),
    });
  }

  const responseStream = await openai.chat.completions.create({
    temperature: 1.2,
    model: Config.openai?.model ?? DEFAULT_OPENAI_MODEL,
    messages: [
      { role: "system", content: Config.prompt },
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

    const parts = buffer.split(/(?<=[、。！？]+)/);
    buffer = parts.pop() || "";
    for (const part of parts) {
      yield part;
    }
  }
  yield buffer;
}

async function synthesizeAudio(text: string): Promise<ArrayBuffer> {
  for (const { from, to } of Config.replace) {
    text = text.replace(new RegExp(from, "g"), to);
  }

  const voicevoxOrigin = Config.voicevox?.origin ?? DEFAULT_VOICEVOX_ORIGIN;
  const audioQueryResponse = await fetch(
    `${voicevoxOrigin}/audio_query?speaker=1&text=${encodeURIComponent(text)}`,
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

async function playAudio(text: string, audioBuffer: ArrayBuffer) {
  debug(`Playing audio buffer`);

  const audioDataBase64 = Buffer.from(audioBuffer).toString("base64");
  Events.emit("frontendCommand", { type: PLAY_AUDIO, audioDataBase64 });
}

// parse "<command a1 a2>" to { "command": "setAvatar", args: ["a1", "a2"] }
function parseCommand(text: string): FrontendCommand | null {
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

export async function startOBSCaptureIfRequired() {
  if (!Config.obs) {
    return;
  }

  const obsConfig = Config.obs;

  const obs = new OBSWebSocket();
  await obs.connect(obsConfig.url, obsConfig.password);

  while (true) {
    await new Promise((resolve) =>
      setTimeout(resolve, obsConfig.waitMilliseconds)
    );

    try {
      const resp = await obs.call("GetSourceScreenshot", {
        sourceName: obsConfig.sourceName,
        imageWidth: 480,
        imageFormat: "png",
      });

      await enqueueChat(
        obsConfig.prompt,
        { imageURL: resp.imageData } // "data:image/png;base64,..."
      );
    } catch (err) {
      console.error("GetSourceScreenshot", err);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}
