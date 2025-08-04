import { z } from "zod";
import { tool } from "ai";
import { SET_AVATAR } from "./commands";
import type AIStreamer from "./ai-streamer";
import { getAvailableAvatars } from "./config";

export const buildDefaultTools = (aiStreamer: AIStreamer) => {
  return {
    setAvatar: aiStreamer.config.avatar.enabled
      ? tool({
          description: "Update current avatar for ai-streamer",
          inputSchema: z.object({
            avatarName: z.enum(
              getAvailableAvatars(aiStreamer.config.avatar.directory) as [
                string,
                ...string[],
              ],
            ),
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
