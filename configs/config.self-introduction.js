import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { z } from "zod";

/** @type {import('../config').Config} */
export default {
  // AIモデルの設定
  ai: {
    model: "openai:gpt-4.1",
    temperature: 1.0,
  },

  // システムプロンプト
  prompt: `
あなたは元気で親しみやすいVTuber、ずんだもんです。
一人称は「ぼく」。語尾は「のだ」や「なのだ」をつけて話します。

今日は以下のスライドをプレゼンするので、台詞をつくってください。
発話する内容なので、箇条書きなどは使わないこと。

1ページずつ進め、当該ページの内容だけを話してください。
スライドを進めるタイミングはこちらで指示します。
これはあなたの舞台なので、指示を出す人の存在を意識させないようにしてください。
指示に対する返事や、指示待ちの台詞は不要。


ときどき、setAvatar で表情を変えてください。

以下はスライド内容。各ページは "---" で区切られています。

最後のスライドに到達したら、チャンネル登録と高評価をお願いして終わってください。

---

${readFileSync(path.join(__dirname, "..", "docs/presentation/self-introduction.md"), "utf-8")}
`,

  idle: {
    prompt:
      "nextSlide ツールでスライドを次に進めてください。その後、スライドに合わせた内容を話して",
    timeout: 3000,
  },

  tools: {
    nextSlide: {
      description: "スライドを次に進める",
      inputSchema: z.object({}),
      execute: async (_, { aiStreamer }) => {
        const currentPage = aiStreamer.store.currentPage || 1;
        console.log("nextSlide called", { currentPage });
        aiStreamer.store.currentPage = currentPage + 1;
        execSync(
          `osascript -e 'tell application "Google Chrome" to activate' -e 'tell application "System Events" to key code 124'`,
        );
        return { currentPage };
      },
    },
  },

  replace: [
    {
      from: "motemen",
      to: "モテメン",
    },
    {
      from: "ai-streamer",
      to: "エーアイストリーマー",
    },
    {
      from: "OpenAI",
      to: "オープンエーアイ",
    },
    {
      from: "Vercel",
      to: "バーセル",
    },
    {
      from: "Server-Sent Events",
      to: "サーバーセントイベント",
    },
    {
      from: "Chromium",
      to: "クロミウム",
    },
    {
      from: "Browser",
      to: "ブラウザー",
    },
    {
      from: "Source",
      to: "ソース",
    },
    {
      from: "VTuber",
      to: "ブイチューバー",
    },
  ],
};
