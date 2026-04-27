import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme";
import type { Item } from "../types";

type WorktreeEmptyStateProps = {
  current: Item;
  createTargetPath: string;
  formatPath: (itemPath: string) => string;
};

export const WorktreeEmptyState = ({
  current,
  createTargetPath,
  formatPath,
}: WorktreeEmptyStateProps) => {
  if (current.kind !== "source-empty") {
    return null;
  }

  return (
    <>
      <Text bold color={theme.colors.accent}>
        {current.group}
      </Text>
      <Text color={theme.colors.muted}>{formatPath(current.path)}</Text>
      <Text> </Text>
      <Text>No linked worktrees yet for this repo.</Text>
      <Box marginTop={1} flexDirection="column">
        <Text color={theme.colors.muted}>Next step</Text>
        <Text>Press c to create the first worktree.</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text color={theme.colors.muted}>Default path</Text>
        <Text>{formatPath(createTargetPath)}</Text>
      </Box>
    </>
  );
};
