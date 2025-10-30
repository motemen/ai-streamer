import { z } from "zod";
import { tool } from "ai";
import { SET_AVATAR } from "./commands.js";
import type AIStreamer from "./ai-streamer.js";
import { getAvailableAvatars } from "./config.js";

export const buildDefaultTools = (aiStreamer: AIStreamer) => {
  const availableAvatars = getAvailableAvatars(
    aiStreamer.config.avatar.directory,
  );
  return {
    setAvatar:
      aiStreamer.config.avatar.enabled && availableAvatars.length > 0
        ? tool({
          description: "Update current avatar for ai-streamer",
          inputSchema: z.object({
            avatarName: z.enum(availableAvatars as [string, ...string[]]),
          }),
          execute: async (params) => {
            const { avatarName } = params;
            aiStreamer.emit("frontendCommand", {
              type: SET_AVATAR,
              avatar: avatarName,
            });
            return `Updated avatar to ${avatarName}`;
          },
        })
        : null,
  };
};
