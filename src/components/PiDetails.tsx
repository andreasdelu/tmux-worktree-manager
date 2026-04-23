import React from "react";
import { Box, Text } from "ink";
import { sortOverwatchAgents } from "../lib/overwatch";
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
      return "cyan";
    case "done":
      return "green";
    case "stale":
      return "yellow";
    case "error":
      return "red";
    default:
      return "gray";
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

  return summary.length > 40 ? `${summary.slice(0, 37)}...` : summary;
};

const rowColor = (status: string) => (status === "offline" ? "gray" : undefined);

const STATE_WIDTH = 7;
const TARGET_WIDTH = 24;
const WHERE_WIDTH = 10;
const DOING_WIDTH = 14;
const SUMMARY_WIDTH = 40;
const TABLE_WIDTH =
  STATE_WIDTH + TARGET_WIDTH + WHERE_WIDTH + DOING_WIDTH + SUMMARY_WIDTH + 8;

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
    return <Text color="gray">No Pi activity for this worktree.</Text>;
  }

  if (!current.overwatch) {
    return <Text color="gray">No Pi activity for this worktree.</Text>;
  }

  const instances = current.overwatch.kind === "single"
    ? [current.overwatch.agent]
    : sortOverwatchAgents(current.overwatch.agents);

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Box width={STATE_WIDTH + 1}>
          <Text color="gray">{fit("STATE", STATE_WIDTH)}</Text>
        </Box>
        <Box width={TARGET_WIDTH + 1}>
          <Text color="gray">{fit("TARGET", TARGET_WIDTH)}</Text>
        </Box>
        <Box width={WHERE_WIDTH + 1}>
          <Text color="gray">{fit("WHERE", WHERE_WIDTH)}</Text>
        </Box>
        <Box width={DOING_WIDTH + 1}>
          <Text color="gray">{fit("DOING", DOING_WIDTH)}</Text>
        </Box>
        <Box flexGrow={1}>
          <Text color="gray">SUMMARY</Text>
        </Box>
      </Box>
      <Text color="gray">{"─".repeat(TABLE_WIDTH)}</Text>
      {instances.map((instance) => {
        const workLabel = currentWorkLabel(
          instance.status,
          instance.summary,
          instance.phase,
          instance.toolName,
        );
        const summary = summaryLabel(instance.summary, workLabel);

        return (
          <Box key={`${current.path}:pi:${instance.agentId}`}>
            <Box width={STATE_WIDTH + 1}>
              <Text color={statusColor(instance.status)}>
                {fit(statusLabel(instance.status, loadingGlyph), STATE_WIDTH)}
              </Text>
            </Box>
            <Box width={TARGET_WIDTH + 1}>
              <Text color={rowColor(instance.status)}>{fit(instance.identity, TARGET_WIDTH)}</Text>
            </Box>
            <Box width={WHERE_WIDTH + 1}>
              <Text color={rowColor(instance.status)}>{fit(whereLabel(instance), WHERE_WIDTH)}</Text>
            </Box>
            <Box width={DOING_WIDTH + 1}>
              <Text color={rowColor(instance.status)}>
                {fit(doingLabel(instance.status, instance.phase, instance.toolName), DOING_WIDTH)}
              </Text>
            </Box>
            <Box flexGrow={1}>
              <Text color={rowColor(instance.status)}>{fit(summary, SUMMARY_WIDTH)}</Text>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
};
