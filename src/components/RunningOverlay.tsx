import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme";
import { DialogFrame } from "./DialogFrame";
import { Spinner } from "./Spinner";

type RunningOverlayProps = {
  rootHeight: number;
  isSplit: boolean;
  label: string;
};

export const RunningOverlay = ({
  rootHeight,
  isSplit,
  label,
}: RunningOverlayProps) => (
  <DialogFrame
    rootHeight={rootHeight}
    isSplit={isSplit}
    borderColor={theme.colors.accent}
    title={
      <Box>
        <Spinner color="cyan" />
        <Text bold color={theme.colors.accent}> {label || "Working…"}</Text>
      </Box>
    }
    titleColor={theme.colors.accent}
    subtitle="Please wait while the action completes."
  />
);
