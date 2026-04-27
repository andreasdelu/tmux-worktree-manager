import React from "react";
import { theme } from "../theme";
import { DialogFrame } from "./DialogFrame";

type NoticeOverlayProps = {
  rootHeight: number;
  isSplit: boolean;
  title: string;
  message: string;
};

export const NoticeOverlay = ({
  rootHeight,
  isSplit,
  title,
  message,
}: NoticeOverlayProps) => (
  <DialogFrame
    rootHeight={rootHeight}
    isSplit={isSplit}
    borderColor={theme.colors.warning}
    title={title}
    subtitle={message}
    footer="enter ok • esc close"
  />
);
