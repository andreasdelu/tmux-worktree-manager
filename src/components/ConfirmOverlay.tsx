import React from "react";
import { theme } from "../theme";
import { DialogFrame } from "./DialogFrame";

type ConfirmOverlayProps = {
  rootHeight: number;
  isSplit: boolean;
  mode: "kill" | "remove";
  currentName?: string;
};

export const ConfirmOverlay = ({
  rootHeight,
  isSplit,
  mode,
  currentName,
}: ConfirmOverlayProps) => {
  const title = mode === "kill"
    ? `Close tmux session for ${currentName}?`
    : `Remove clean linked worktree ${currentName}?`;
  const subtitle = mode === "kill"
    ? "This only closes the matching tmux session."
    : "This removes the linked worktree after the safety checks pass.";

  return (
    <DialogFrame
      rootHeight={rootHeight}
      isSplit={isSplit}
      borderColor={theme.colors.warning}
      title={title}
      subtitle={subtitle}
      footer="y confirm • n cancel • esc close"
    />
  );
};
