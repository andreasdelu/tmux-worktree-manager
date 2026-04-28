import React from "react";
import { theme } from "../theme";
import type { Item } from "../types";
import { CreateWorktreeDialog } from "./CreateWorktreeDialog";
import { DialogFrame } from "./DialogFrame";

type CreateWorktreeOverlayProps = {
  rootHeight: number;
  isSplit: boolean;
  current?: Item;
  worktreeName: string;
  branchName: string;
  activeField: "worktreeName" | "branchName";
  createTargetPath: string;
};

export const CreateWorktreeOverlay = ({
  rootHeight,
  isSplit,
  current,
  worktreeName,
  branchName,
  activeField,
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
      borderColor={theme.colors.border}
      title="Create worktree"
      subtitle={subtitle}
      footer="tab switch field • enter create • esc cancel"
    >
      <CreateWorktreeDialog
        worktreeName={worktreeName}
        branchName={branchName}
        activeField={activeField}
        createTargetPath={createTargetPath}
      />
    </DialogFrame>
  );
};
