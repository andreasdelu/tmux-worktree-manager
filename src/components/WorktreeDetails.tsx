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
  pullRequestDetails?: React.ReactNode;
};

export const WorktreeDetails = ({ current, previewPath, showPreviewLoading, previewMetaRows,
  previewChanges, hiddenPreviewChanges, pullRequestDetails }: WorktreeDetailsProps) => {
  if (current.kind === "source-empty") return null;
  const rows = previewMetaRows.filter(row => row.label !== "Role"); // primary is in the header
  const labelWidth = Math.max(8, ...rows.map(row => row.label.length)) + 2;
  return <Box flexDirection="column" flexShrink={0}>
    <Text bold color={theme.colors.accent} wrap="truncate-end">
      {`${current.group}/${current.name}${current.isPrimary ? " · primary" : ""}`}
    </Text>
    {previewPath ? <Text color={theme.colors.muted} wrap="truncate-middle">{previewPath}</Text> : null}
    <Box flexDirection="column" marginTop={1}>{pullRequestDetails}</Box>
    {showPreviewLoading ? <Box marginTop={1}><Spinner color="cyan" /><Text color={theme.colors.muted}> Loading Git details…</Text></Box>
      : <Box flexDirection="column" marginTop={1}>
        <Text bold color={theme.colors.muted}>Git</Text>
        {rows.map(row => <Box key={row.label}>
          <Box width={labelWidth} flexShrink={0}><Text color={theme.colors.muted}>{row.label}</Text></Box>
          <Text wrap="truncate-end">{row.value}</Text>
        </Box>)}
        {previewChanges.length ? <Box flexDirection="column" marginTop={1}>
          <Text bold color={theme.colors.muted}>Changes</Text>
          {previewChanges.map((line, index) => {
            const match = line.match(/^\s*([A-Z\?]{1,2})\s+(.*)$/);
            return <Text key={index} wrap="truncate-end">
              {match ? <><Text color={theme.colors.muted}>{match[1]!.padEnd(4, " ")}</Text>{match[2]}</> : line}
            </Text>;
          })}
          {hiddenPreviewChanges ? <Text color={theme.colors.muted}>+{hiddenPreviewChanges} more changes</Text> : null}
        </Box> : null}
      </Box>}
  </Box>;
};
