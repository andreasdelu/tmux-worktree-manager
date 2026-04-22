import React from "react";
import { Box, Text } from "ink";
import type { SourceEntry } from "../types";

type SourceSidebarProps = {
  sources: SourceEntry[];
  selectedSource: number;
};

export const SourceSidebar = ({
  sources,
  selectedSource,
}: SourceSidebarProps) => {
  if (sources.length === 0) {
    return <Text color="gray">No repo roots configured yet.</Text>;
  }

  return (
    <>
      {sources.map((source, index) => {
        const isSelected = index === selectedSource;
        return (
          <Box key={`${source.resolvedPath}:${index}`}>
            <Text color={isSelected ? "cyan" : "gray"}>
              {isSelected ? "› " : "  "}
            </Text>
            <Text bold color={isSelected ? "white" : undefined}>
              {source.path}
            </Text>
          </Box>
        );
      })}
    </>
  );
};
