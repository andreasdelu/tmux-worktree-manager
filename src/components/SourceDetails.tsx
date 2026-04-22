import React from "react";
import { Box, Text } from "ink";
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
    return <Text color="gray">Add a repo root to start browsing more repos.</Text>;
  }

  return (
    <>
      <Text bold color="cyan">
        {currentSource.path}
      </Text>
      <Text> </Text>
      <Box>
        <Text color="gray">Status </Text>
        <Text color={currentSource.valid ? "green" : "yellow"}>
          {currentSource.valid ? "ready" : currentSource.issue}
        </Text>
      </Box>
      {currentSource.resolvedPath !== currentSource.path ? (
        <Box>
          <Text color="gray">Resolved </Text>
          <Text>{formatPath(currentSource.resolvedPath)}</Text>
        </Box>
      ) : null}
      {!currentSource.valid ? (
        <Box marginTop={1}>
          <Text color="gray">
            Add the actual git repo root, not a child folder inside it.
          </Text>
        </Box>
      ) : null}
    </>
  );
};
