import type { Config } from "./config.ts";

export const CONFIGURE = "CONFIGURE";
// TODO: UPDATE_CAPTIONとPLAY_AUDIOは合体させる
export const UPDATE_CAPTION = "UPDATE_CAPTION";
export const SET_AVATAR = "SET_AVATAR";
export const PLAY_AUDIO = "PLAY_AUDIO";
export const CLEAR_QUEUE = "CLEAR_QUEUE";
export const CHARACTER_TALKING = "CHARACTER_TALKING";

export const DEFAULT_SLOT = "default";

export type ConfigureCommand = {
  type: typeof CONFIGURE;
  config: Config;
};

export type UpdateCaptionCommand = {
  type: typeof UPDATE_CAPTION;
  caption: string;
  slot?: string;
};

export type SetAvatarCommand = {
  type: typeof SET_AVATAR;
  avatar: string;
  slot?: string;
};

export type PlayAudioCommand = {
  type: typeof PLAY_AUDIO;
  audioDataBase64: string;
  slot?: string;
};

export type ClearQueueCommand = {
  type: typeof CLEAR_QUEUE;
};

export type CharacterTalkingCommand = {
  type: typeof CHARACTER_TALKING;
  slot: string;
  talking: boolean;
};

export type FrontendCommand =
  | ConfigureCommand
  | UpdateCaptionCommand
  | SetAvatarCommand
  | PlayAudioCommand
  | ClearQueueCommand
  | CharacterTalkingCommand;
