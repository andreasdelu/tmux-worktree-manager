import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme";
import type { SourceEntry } from "../types";

type SourceDetailsProps = {
  currentSource?: SourceEntry;
  formatPath: (itemPath: string) => string;
};

export const SourceDetails = ({
  currentSource,
  formatPath,
}: SourceDetailsProps) => {
  if (!currentSource) {
    return <Text color={theme.colors.muted}>Add a repo root to start browsing more repos.</Text>;
  }

  return (
    <>
      <Text bold color={theme.colors.accent}>
        {currentSource.path}
      </Text>
      <Text> </Text>
      <Box>
        <Text color={theme.colors.muted}>Status </Text>
        <Text
          color={
            currentSource.valid
              ? theme.colors.success
              : theme.colors.warning
          }
        >
          {currentSource.valid ? "ready" : currentSource.issue}
        </Text>
      </Box>
      {currentSource.resolvedPath !== currentSource.path ? (
        <Box>
          <Text color={theme.colors.muted}>Resolved </Text>
          <Text>{formatPath(currentSource.resolvedPath)}</Text>
        </Box>
      ) : null}
      {!currentSource.valid ? (
        <Box marginTop={1}>
          <Text color={theme.colors.muted}>
            Add the actual git repo root, not a child folder inside it.
          </Text>
        </Box>
      ) : null}
    </>
  );
};
