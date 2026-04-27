import React from "react";
import { Box, Text } from "ink";
import { sortOverwatchAgents } from "../lib/overwatch";
import { theme } from "../theme";
import type { Item, OverwatchAgentState } from "../types";

const statusLabel = (status: string, loadingGlyph: string) => {
  switch (status) {
    case "working":
      return loadingGlyph;
    case "done":
      return "✓";
    case "stale":
      return "!";
    case "error":
      return "×";
    case "idle":
    case "offline":
      return "○";
    default:
      return "·";
  }
};

const statusColor = (status: string) => {
  switch (status) {
    case "working":
      return theme.colors.accent;
    case "done":
      return theme.colors.success;
    case "stale":
      return theme.colors.warning;
    case "error":
      return theme.colors.danger;
    default:
      return theme.colors.muted;
  }
};

const currentWorkLabel = (
  status: string,
  summary?: string,
  phase?: string,
  toolName?: string,
) => {
  if (status === "offline") {
    return "offline";
  }

  if (status === "done") {
    return "—";
  }

  if (toolName) {
    return toolName;
  }

  if (phase === "thinking") {
    return "thinking";
  }

  if (phase === "queueing") {
    return "queued";
  }

  if (phase === "waiting") {
    return "waiting";
  }

  if (summary && summary !== "Working") {
    return summary;
  }

  return "—";
};

const summaryLabel = (summary?: string, workLabel?: string) => {
  if (!summary || summary === "Working" || summary === workLabel) {
    return "—";
  }

  return summary;
};

const rowColor = (status: string) =>
  status === "offline" ? theme.colors.muted : undefined;

const STATE_WIDTH = 1;
const TARGET_WIDTH = 14;
const WHERE_WIDTH = 9;
const DOING_WIDTH = 10;

const fit = (value: string, width: number) => {
  if (width <= 0) {
    return "";
  }

  if (value.length <= width) {
    return value.padEnd(width, " ");
  }

  return `${value.slice(0, Math.max(0, width - 1))}…`;
};

const whereLabel = (instance: OverwatchAgentState) => {
  if (instance.tmux?.windowIndex && instance.tmux?.paneIndex) {
    return `tmux ${instance.tmux.windowIndex}.${instance.tmux.paneIndex}`;
  }

  if (instance.tmux?.sessionName) {
    return `tmux ${instance.tmux.sessionName}`;
  }

  return "cwd";
};

const tableLine = (
  state: string,
  target: string,
  where: string,
  doing: string,
  summary: string,
) => `${fit(state, STATE_WIDTH)} ${detailsLine(target, where, doing, summary)}`;

const detailsLine = (
  target: string,
  where: string,
  doing: string,
  summary: string,
) => `${fit(target, TARGET_WIDTH)} ${fit(where, WHERE_WIDTH)} ${fit(doing, DOING_WIDTH)} ${summary}`;

const doingLabel = (status: string, phase?: string, toolName?: string) => {
  if (status === "offline") {
    return "offline";
  }

  if (toolName) {
    return toolName;
  }

  return phase || "—";
};

export const PiDetails = ({
  current,
  loadingGlyph,
}: {
  current: Item;
  loadingGlyph: string;
}) => {
  if (current.kind !== "worktree") {
    return <Text color={theme.colors.muted}>No Pi activity for this worktree.</Text>;
  }

  if (!current.overwatch) {
    return <Text color={theme.colors.muted}>No Pi activity for this worktree.</Text>;
  }

  const instances = current.overwatch.kind === "single"
    ? [current.overwatch.agent]
    : sortOverwatchAgents(current.overwatch.agents);

  return (
    <Box flexDirection="column" overflow="hidden">
      <Box height={1} overflow="hidden">
        <Text color={theme.colors.muted} wrap="truncate-end">
          {tableLine("S", "TARGET", "WHERE", "DOING", "SUMMARY")}
        </Text>
      </Box>
      <Box height={1} overflow="hidden">
        <Text color={theme.colors.muted} wrap="truncate-end">{"─".repeat(200)}</Text>
      </Box>
      {instances.map((instance) => {
        const workLabel = currentWorkLabel(
          instance.status,
          instance.summary,
          instance.phase,
          instance.toolName,
        );
        const summary = summaryLabel(instance.summary, workLabel);

        return (
          <Box key={`${current.path}:pi:${instance.agentId}`} height={1} overflow="hidden">
            <Text color={statusColor(instance.status)}>
              {fit(statusLabel(instance.status, loadingGlyph), STATE_WIDTH)}{" "}
            </Text>
            <Box flexShrink={1} minWidth={0} overflow="hidden">
              <Text color={rowColor(instance.status)} wrap="truncate-end">
                {detailsLine(
                  instance.identity,
                  whereLabel(instance),
                  doingLabel(instance.status, instance.phase, instance.toolName),
                  summary,
                )}
              </Text>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
};
