import React from "react";
import { Box, Text } from "ink";
import type { Item } from "../types";

type PreviewMetaRow = { label: string; value: string };

type WorktreeDetailsProps = {
  current: Item;
  previewPath: string;
  showPreviewLoading: boolean;
  loadingGlyph: string;
  previewMetaRows: PreviewMetaRow[];
  previewChanges: string[];
  hiddenPreviewChanges: number;
};

export const WorktreeDetails = ({
  current,
  previewPath,
  showPreviewLoading,
  loadingGlyph,
  previewMetaRows,
  previewChanges,
  hiddenPreviewChanges,
}: WorktreeDetailsProps) => {
  if (current.kind === "source-empty") {
    return null;
  }

  return (
    <>
      <Box flexDirection="row">
        <Text color="gray">{current.group}\</Text>
        <Text bold color="cyan">
          {current.name}
        </Text>
      </Box>
      {previewPath ? <Text color="gray">{previewPath}</Text> : null}
      <Text> </Text>
      {showPreviewLoading ? (
        <Box flexDirection="column">
          <Text color="cyan">{loadingGlyph} Loading details…</Text>
          <Text color="gray">
            Fetching branch, status, last commit, and changed files.
          </Text>
        </Box>
      ) : (
        <>
          <Text bold color="gray">
            Overview
          </Text>
          {previewMetaRows.map((row, index) => (
            <Box key={`${current.path}:meta:${index}`}>
              <Text color="gray">{row.label.padEnd(8, " ")}</Text>
              <Text>{row.value}</Text>
            </Box>
          ))}

          <Box flexDirection="column" marginTop={1}>
            <Text bold color="gray">
              Changes
            </Text>
            {previewChanges.length > 0 ? (
              <>
                {previewChanges.map((line, index) => {
                  const match = line.match(/^\s*([A-Z\?]{1,2})\s+(.*)$/);
                  if (match) {
                    return (
                      <Box key={`${current.path}:change:${index}`}>
                        <Text color="gray">{match[1].padEnd(4, " ")}</Text>
                        <Text>{match[2]}</Text>
                      </Box>
                    );
                  }

                  return <Text key={`${current.path}:change:${index}`}>{line}</Text>;
                })}
                {hiddenPreviewChanges > 0 ? (
                  <Text color="gray">+{hiddenPreviewChanges} more changes</Text>
                ) : null}
              </>
            ) : (
              <Text color="gray">No uncommitted changes</Text>
            )}
          </Box>
        </>
      )}
    </>
  );
};
