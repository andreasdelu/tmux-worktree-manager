import React from "react";
import { Box, Text } from "ink";
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
      <Text bold color="cyan">
        {current.group}
      </Text>
      <Text color="gray">{formatPath(current.path)}</Text>
      <Text> </Text>
      <Text>No linked worktrees yet for this repo.</Text>
      <Box marginTop={1} flexDirection="column">
        <Text color="gray">Next step</Text>
        <Text>Press c to create the first worktree.</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text color="gray">Default path</Text>
        <Text>{formatPath(createTargetPath)}</Text>
      </Box>
    </>
  );
};
