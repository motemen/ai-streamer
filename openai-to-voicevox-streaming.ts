import { readFile, writeFile } from "node:fs/promises";
import { mkdtempSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import EventEmitter from "node:events";

import { OpenAI } from "openai";
import PQueue from "p-queue";
import { FrontendCommand } from "./commands";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

/*** Configuration ***/

const VOICEVOX_API_ORIGIN =
  process.env["VOICEVOX_API_ORIGIN"] ?? "http://localhost:50021";

const OPENAI_MODEL = process.env["OPENAI_MODEL"] ?? "gpt-4o-mini";

const SYSTEM_PROMPT = `
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const AVATAR_IMAGE_DIR = path.join(__dirname, "avatars");

const TEMP_AUDIO_DIR = mkdtempSync(tmpdir() + path.sep);

type AIStreamerEventMap = {
  frontendCommand: [FrontendCommand];
};
export const Events = new EventEmitter<AIStreamerEventMap>({
  captureRejections: true,
});

const openai = new OpenAI({
  apiKey: process.env["OPENAI_API_KEY"],
  baseURL: process.env["OPENAI_API_BASE_URL"],
});

export async function getAvatarImage(
  name: string
): Promise<Buffer<ArrayBufferLike> | null> {
  const filePath = path.join(AVATAR_IMAGE_DIR, name);
  return readFile(filePath).catch((err) => {
    console.warn(`Avatar image ${filePath} not found`, err);
    return null;
  });
}

async function* getChatResponsesStream(
  prompt: string
): AsyncGenerator<string, void, unknown> {
  const responseStream = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
    stream: true,
  });

  let buffer = "";
  for await (const chunk of responseStream) {
    buffer += chunk.choices[0].delta.content ?? "";
    process.stderr.write("\r" + buffer);
    const parts = buffer.split(/(?<=[、。！？])/);
    buffer = parts.pop() || "";
    for (const part of parts) {
      yield part;
    }
  }
  yield buffer;
}

const taskQueue = new PQueue({ concurrency: 1 });

let audioFileIndex = 0;

async function synthesizeAudio(text: string): Promise<string> {
  const audioQueryResponse = await fetch(
    `${VOICEVOX_API_ORIGIN}/audio_query?speaker=1&text=${encodeURIComponent(
      text
    )}`,
    {
      method: "POST",
    }
  ).catch((err) => {
    throw new Error(`POST ${VOICEVOX_API_ORIGIN}/audio_query failed: ${err}`);
  });
  const audioQuery = await audioQueryResponse.json();

  const synthesisResponse = await fetch(
    `${VOICEVOX_API_ORIGIN}/synthesis?speaker=1`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(audioQuery),
    }
  ).catch((err) => {
    throw new Error(`POST ${VOICEVOX_API_ORIGIN}/synthesis failed: ${err}`);
  });

  const buffer = await synthesisResponse
    .arrayBuffer()
    .then((b) => Buffer.from(b));

  const filePath = path.join(
    TEMP_AUDIO_DIR,
    "synth_" + (audioFileIndex++).toString().padStart(3, "0") + ".wav"
  );

  await writeFile(filePath, buffer);

  return filePath;
}

async function playAudioFile(text: string, filePath: string) {
  // Events.emit("captionUpdated", text);
  console.log(`Playing ${filePath}`);
  return new Promise((resolve, reject) => {
    const child = spawn("afplay", [filePath]);
    child.on("exit", resolve);
    child.on("error", reject);
  });
}

// parse "<command a1 a2>" to { "command": "setAvatar", args: ["a1", "a2"] }
function parseCommand(text: string): FrontendCommand | null {
  const match = text.trim().match(/<([^>\s]+)(?:\s+([^>]+))?>/);
  if (!match) {
    return null;
  }

  const [, command, args] = match;
  if (command === "setAvatar") {
    return { type: "setAvatar", avatar: args ?? "default" };
  }

  console.warn("Unknown command", command);

  return null;
}

// Function to connect the streaming and speech synthesis
export async function streamChatAndSynthesize(prompt: string) {
  for await (let text of getChatResponsesStream(prompt)) {
    const commands: FrontendCommand[] = [];
    text = text.replace(/\s*<[^>]+>\s*/g, (match) => {
      const command = parseCommand(match);
      if (command) {
        commands.push(command);
      }
      return "";
    });

    commands.push({ type: "updateCaption", caption: text });

    const filePath = await synthesizeAudio(text);
    taskQueue.add(async () => {
      for (const command of commands) {
        Events.emit("frontendCommand", command);
      }

      return playAudioFile(text, filePath);
    });
  }
}

// streamChatAndSynthesize("こんにちは、元気ですか？ 400文字程度で。");

// TODO: HTML配信
// TODO: AI発言API
// TODO: 直接発言API
// TODO: キャプション更新をHTMLに伝える
