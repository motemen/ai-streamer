import { SET_AVATAR } from "./commands";
import type AIStreamer from "./ai-streamer";

export type ToolHandler = (
  params: Record<string, unknown>,
  aiStreamer: AIStreamer
) => Promise<string>;

export const builtInHandlers: Record<string, ToolHandler> = {
  setAvatar: async (params, aiStreamer) => {
    const { name } = params;
    aiStreamer.emit("frontendCommand", { type: SET_AVATAR, name });
    return `アバターを${name}に変更しました`;
  },
};