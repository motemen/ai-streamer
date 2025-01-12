import { z } from "zod";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const DEFAULT_VOICEVOX_ORIGIN = "http://localhost:50021";
export const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
export const DEFAULT_AVATAR_IMAGE_DIR = path.join(__dirname, "avatars");

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

  idle: z
    .object({
      timeout: z.number().default(30 * 1000),
      prompt: z.string().default("簡単に雑談してください"),
    })
    .optional(),

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

export type Config = z.infer<typeof ConfigSchema>;
