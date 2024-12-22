import { writeFile } from "node:fs/promises";
import { mkdtempSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";

import { OpenAI } from "openai";
import PQueue from "p-queue";

const VOICEVOX_API_ORIGIN =
  process.env["VOICEVOX_API_ORIGIN"] ?? "http://localhost:50021";

const OPENAI_MODEL = process.env["OPENAI_MODEL"] ?? "gpt-4o-mini";

const TEMP_AUDIO_DIR = mkdtempSync(tmpdir() + path.sep);

const openai = new OpenAI({
  apiKey: process.env["OPENAI_API_KEY"],
  baseURL: process.env["OPENAI_API_BASE_URL"],
});

async function* getChatResponsesStream(
  prompt: string
): AsyncGenerator<string, void, unknown> {
  const responseStream = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [{ role: "user", content: prompt }],
    stream: true,
  });

  let buffer = "";
  for await (const chunk of responseStream) {
    buffer += chunk.choices[0].delta.content ?? "";
    process.stderr.write("\r" + buffer);
    let parts = buffer.split(/(?<=[、。！？])/);
    buffer = parts.pop() || "";
    for (const part of parts) {
      yield part;
    }
  }
  yield buffer;
}

const soundPlayQueue = new PQueue({ concurrency: 1 });

let audioFileIndex = 0;

async function generateAndQueueSpeech(text: string) {
  const audioQueryResponse = await fetch(
    `${VOICEVOX_API_ORIGIN}/audio_query?speaker=1&text=${encodeURIComponent(
      text
    )}`,
    {
      method: "POST",
    }
  );
  const audioQuery = await audioQueryResponse.json();

  const synthesisResponse = await fetch(
    `${VOICEVOX_API_ORIGIN}/synthesis?speaker=1`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(audioQuery),
    }
  );

  const arrayBuffer = await synthesisResponse.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const filePath = path.join(
    TEMP_AUDIO_DIR,
    "synth_" + (audioFileIndex++).toString().padStart(3, "0") + ".wav"
  );

  await writeFile(filePath, buffer);

  soundPlayQueue.add(async () => {
    Clients.forEach((updateClient) => updateClient(text));
    return playAudioFile(filePath);
  });
}

async function playAudioFile(filePath: string) {
  console.log(`Playing ${filePath}`);
  return new Promise((resolve, reject) => {
    const child = spawn("afplay", [filePath]);
    child.on("exit", resolve);
    child.on("error", reject);
  });
}

// Function to connect the streaming and speech synthesis
export async function streamChatAndSynthesize(prompt: string) {
  for await (const part of getChatResponsesStream(prompt)) {
    await generateAndQueueSpeech(part);
    // appendCaption(part);
  }
}

export const Clients = new Set<(s: string) => void>();

// streamChatAndSynthesize("こんにちは、元気ですか？ 400文字程度で。");

// TODO: HTML配信
// TODO: AI発言API
// TODO: 直接発言API
// TODO: キャプション更新をHTMLに伝える
