export const UPDATE_CAPTION = "updateCaption";
export const SET_AVATAR = "setAvatar";
export const PLAY_AUDIO = "playAudio";

export type UpdateCaptionCommand = {
  type: typeof UPDATE_CAPTION;
  caption: string;
};

export type SetAvatarCommand = {
  type: typeof SET_AVATAR;
  avatar: string;
};

export type PlayAudioCommand = {
  type: typeof PLAY_AUDIO;
  audioDataBase64: string;
};

export type FrontendCommand =
  | UpdateCaptionCommand
  | SetAvatarCommand
  | PlayAudioCommand;
