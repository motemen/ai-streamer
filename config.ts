import { z } from "zod";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { readdirSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const DEFAULT_VOICEVOX_ORIGIN = "http://localhost:50021";
export const DEFAULT_AI_MODEL = "openai:gpt-4o-mini";
export const DEFAULT_AVATAR_IMAGE_DIR = path.join(__dirname, "avatars");

const DEFAULT_PROMPT = `
あなたはゲーム実況ストリーマーです。
あなたは情緒豊かで、いつも視聴者に楽しい時間を提供します。
これからゲームのプレイ状況を伝えるので、それに合わせたセリフを生成してください。
`.trim();

export const ConfigSchema = z.object({
  voicevox: z
    .object({
      origin: z.string().default(DEFAULT_VOICEVOX_ORIGIN),
    })
    .optional(),

  ai: z
    .object({
      model: z.string().default(DEFAULT_AI_MODEL),
    })
    .default({
      model: DEFAULT_AI_MODEL,
    }),

  prompt: z.string().default(DEFAULT_PROMPT),
  maxHistory: z.number().default(10),

  avatar: z
    .object({
      enabled: z.boolean().default(true),
      directory: z.string().default(DEFAULT_AVATAR_IMAGE_DIR),
    })
    .default({ enabled: true, directory: DEFAULT_AVATAR_IMAGE_DIR }),

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
});

export type Config = z.infer<typeof ConfigSchema>;

/**
 * 指定されたavatarディレクトリからアバター名のリストを取得する
 */
export function getAvailableAvatars(avatarDirectory: string): string[] {
  try {
    const files = readdirSync(avatarDirectory);
    const avatarNames = files
      .filter((file) => /\.(png|jpg|jpeg|gif|webp)$/i.test(file))
      .map((file) => path.parse(file).name);

    // defaultは常に先頭に
    const avatars = avatarNames.filter((name) => name !== "default");
    if (avatarNames.includes("default")) {
      avatars.unshift("default");
    }

    return avatars;
  } catch (error) {
    console.warn(`Failed to read avatar directory ${avatarDirectory}:`, error);
    return ["default"];
  }
}

/**
 * 設定に基づいてシステムプロンプトを生成する
 */
export function generateSystemPrompt(config: Config): string {
  let prompt = config.prompt;

  if (config.avatar.enabled) {
    const availableAvatars = getAvailableAvatars(config.avatar.directory);

    const avatarInstructions = `
また、発言の内容に合わせて、文の前後に以下の形式のコマンドを挿入して表情を指定してください。
<setAvatar default>

avatarとして指定できるのは以下です。
${availableAvatars.map((avatar) => `- ${avatar}`).join("\n")}
`.trim();

    prompt = `${prompt}\n\n${avatarInstructions}`;
  }

  return prompt;
}
