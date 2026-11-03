import React from "react";
import { theme } from "../theme";
import type { Item, CreateField, CreateSessionMode } from "../types";
import { CreateWorktreeDialog } from "./CreateWorktreeDialog";
import { DialogFrame } from "./DialogFrame";

type CreateWorktreeOverlayProps = {
  rootHeight: number;
  isSplit: boolean;
  current?: Item;
  worktreeName: string;
  branchName: string;
  baseRef: string;
  activeField: CreateField;
  sessionMode?: CreateSessionMode;
  createTargetPath: string;
  cursor?: number;
};

export const CreateWorktreeOverlay = ({
  rootHeight,
  isSplit,
  current,
  worktreeName,
  branchName,
  baseRef,
  activeField,
  cursor,
  createTargetPath,
  sessionMode,
}: CreateWorktreeOverlayProps) => {
  return (
    <DialogFrame
      rootHeight={rootHeight}
      isSplit={isSplit}
      borderColor={theme.colors.border}
      title="Create worktree"
      footer="tab field • space toggle • enter create • esc cancel"
    >
      <CreateWorktreeDialog
        worktreeName={worktreeName}
        branchName={branchName}
        baseRef={baseRef}
        defaultBase={current?.branch || "selected HEAD"}
        activeField={activeField}
        sessionMode={sessionMode}
        cursor={cursor}
        createTargetPath={createTargetPath}
      />
    </DialogFrame>
  );
};
