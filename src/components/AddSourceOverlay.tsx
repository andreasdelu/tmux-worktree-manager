import React from "react";
import { AddSourceDialog } from "./AddSourceDialog";
import { DialogFrame } from "./DialogFrame";

type AddSourceOverlayProps = {
  rootHeight: number;
  isSplit: boolean;
  value: string;
};

export const AddSourceOverlay = ({
  rootHeight,
  isSplit,
  value,
}: AddSourceOverlayProps) => (
  <DialogFrame
    rootHeight={rootHeight}
    isSplit={isSplit}
    borderColor="gray"
    title="Add repo root"
    subtitle="Add a repository root so its linked worktrees can appear in the picker."
    footer="enter add • esc cancel"
  >
    <AddSourceDialog value={value} />
  </DialogFrame>
);
