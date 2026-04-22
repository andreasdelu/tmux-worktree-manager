import React from "react";
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
    borderColor="yellow"
    title={title}
    subtitle={message}
    footer="enter ok • esc close"
  />
);
