import React from "react";
import { theme } from "../theme";
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
    borderColor={theme.colors.accent}
    title={`${loadingGlyph} ${label || "Working…"}`}
    titleColor={theme.colors.accent}
    subtitle="Please wait while the action completes."
  />
);
