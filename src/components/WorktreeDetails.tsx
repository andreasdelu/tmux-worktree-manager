import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme";
import type { Item } from "../types";
import { Spinner } from "./Spinner";

type PreviewMetaRow = { label: string; value: string };

type WorktreeDetailsProps = {
  current: Item;
  previewPath: string;
  showPreviewLoading: boolean;
  previewMetaRows: PreviewMetaRow[];
  previewChanges: string[];
  hiddenPreviewChanges: number;
};

export const WorktreeDetails = ({
  current,
  previewPath,
  showPreviewLoading,
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
        <Text color={theme.colors.muted}>{current.group}\</Text>
        <Text bold color={theme.colors.accent}>
          {current.name}
        </Text>
        {current.isPrimary ? <Text color={theme.colors.muted}> primary</Text> : null}
      </Box>
      {previewPath ? <Text color={theme.colors.muted}>{previewPath}</Text> : null}
      <Text> </Text>
      {showPreviewLoading ? (
        <Box flexDirection="column">
          <Box>
            <Spinner color="cyan" />
            <Text color={theme.colors.accent}> Loading details…</Text>
          </Box>
          <Text color={theme.colors.muted}>
            Fetching branch, status, last commit, and changed files.
          </Text>
        </Box>
      ) : (
        <>
          <Text bold color={theme.colors.muted}>
            Overview
          </Text>
          {previewMetaRows.map((row, index) => (
            <Box key={`${current.path}:meta:${index}`}>
              <Text color={theme.colors.muted}>{row.label.padEnd(8, " ")}</Text>
              <Text>{row.value}</Text>
            </Box>
          ))}

          <Box flexDirection="column" marginTop={1}>
            <Text bold color={theme.colors.muted}>
              Changes
            </Text>
            {previewChanges.length > 0 ? (
              <>
                {previewChanges.map((line, index) => {
                  const match = line.match(/^\s*([A-Z\?]{1,2})\s+(.*)$/);
                  if (match) {
                    return (
                      <Box key={`${current.path}:change:${index}`}>
                        <Text color={theme.colors.muted}>{match[1].padEnd(4, " ")}</Text>
                        <Text>{match[2]}</Text>
                      </Box>
                    );
                  }

                  return <Text key={`${current.path}:change:${index}`}>{line}</Text>;
                })}
                {hiddenPreviewChanges > 0 ? (
                  <Text color={theme.colors.muted}>+{hiddenPreviewChanges} more changes</Text>
                ) : null}
              </>
            ) : (
              <Text color={theme.colors.muted}>No uncommitted changes</Text>
            )}
          </Box>

        </>
      )}
    </>
  );
};
