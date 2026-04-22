import React from "react";
import type { Item } from "../types";
import { CreateWorktreeDialog } from "./CreateWorktreeDialog";
import { DialogFrame } from "./DialogFrame";

type CreateWorktreeOverlayProps = {
  rootHeight: number;
  isSplit: boolean;
  current?: Item;
  value: string;
  createTargetPath: string;
};

export const CreateWorktreeOverlay = ({
  rootHeight,
  isSplit,
  current,
  value,
  createTargetPath,
}: CreateWorktreeOverlayProps) => {
  const subtitle = current
    ? current.kind === "source-empty"
      ? `Create the first linked worktree from ${current.group}.`
      : `Create a new worktree from ${current.group}.`
    : "Create a new worktree.";

  return (
    <DialogFrame
      rootHeight={rootHeight}
      isSplit={isSplit}
      borderColor="gray"
      title="Create worktree"
      subtitle={subtitle}
      footer="enter create • esc cancel"
    >
      <CreateWorktreeDialog
        value={value}
        createTargetPath={createTargetPath}
      />
    </DialogFrame>
  );
};
