import React from "react";
import { DialogFrame } from "./DialogFrame";

type RunningOverlayProps = {
  rootHeight: number;
  isSplit: boolean;
  loadingGlyph: string;
  label: string;
};

export const RunningOverlay = ({
  rootHeight,
  isSplit,
  loadingGlyph,
  label,
}: RunningOverlayProps) => (
  <DialogFrame
    rootHeight={rootHeight}
    isSplit={isSplit}
    borderColor="cyan"
    title={`${loadingGlyph} ${label || "Working…"}`}
    titleColor="cyan"
    subtitle="Please wait while the action completes."
  />
);
