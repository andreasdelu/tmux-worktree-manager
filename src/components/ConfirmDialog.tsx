import React from "react";

type ConfirmDialogProps = {
  mode: "kill" | "remove";
  currentName?: string;
};

export const confirmDialogTitle = ({
  mode,
  currentName,
}: ConfirmDialogProps) =>
  mode === "kill"
    ? `Close tmux session for ${currentName}?`
    : `Remove clean linked worktree ${currentName}?`;

export const confirmDialogSubtitle = ({ mode }: { mode: "kill" | "remove" }) =>
  mode === "kill"
    ? "This only closes the matching tmux session."
    : "This removes the linked worktree after the safety checks pass.";
