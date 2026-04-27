import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme";
import type { SourceEntry } from "../types";

type SourceSidebarProps = {
  sources: SourceEntry[];
  selectedSource: number;
  maxRows: number;
};

export const SourceSidebar = ({
  sources,
  selectedSource,
  maxRows,
}: SourceSidebarProps) => {
  if (sources.length === 0) {
    return (
      <Text color={theme.colors.muted}>No repo roots configured yet.</Text>
    );
  }

  const start = Math.max(
    0,
    Math.min(
      selectedSource - Math.floor(maxRows / 2),
      Math.max(sources.length - maxRows, 0),
    ),
  );
  const visibleSources = sources.slice(start, start + maxRows);

  return (
    <>
      {visibleSources.map((source, offset) => {
        const index = start + offset;
        const isSelected = index === selectedSource;
        return (
          <Box
            height={1}
            overflow="hidden"
            backgroundColor={isSelected ? theme.colors.selected : undefined}
            key={`${source.resolvedPath}:${index}`}
          >
            <Text color={isSelected ? theme.colors.accent : theme.colors.muted}>
              {isSelected ? "› " : "  "}
            </Text>
            <Box flexShrink={1} minWidth={0}>
              <Text
                bold
                color={isSelected ? theme.colors.text : undefined}
                wrap="truncate-end"
              >
                {source.path}
              </Text>
            </Box>
          </Box>
        );
      })}
    </>
  );
};
