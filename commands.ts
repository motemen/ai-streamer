export const UPDATE_CAPTION = "updateCaption";
export const SET_AVATAR = "setAvatar";

export type UpdateCaptionCommand = {
  type: typeof UPDATE_CAPTION;
  caption: string;
};

export type SetAvatarCommand = {
  type: typeof SET_AVATAR;
  avatar: string;
};

export type FrontendCommand = UpdateCaptionCommand | SetAvatarCommand;
