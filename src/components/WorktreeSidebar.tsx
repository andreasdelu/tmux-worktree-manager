import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme";
import type { Item, OverwatchMatch } from "../types";
import { Spinner } from "./Spinner";

const badgeForOverwatch = (match: OverwatchMatch | undefined) => {
  if (!match) {
    return null;
  }

  const agents = match.kind === "single" ? [match.agent] : match.agents;
  const onlineAgents = agents.filter((agent) => agent.status !== "offline");

  if (onlineAgents.length === 0) {
    return null;
  }

  if (onlineAgents.some((agent) => agent.status === "working")) {
    return { kind: "working", color: theme.colors.accent } as const;
  }

  if (onlineAgents.every((agent) => agent.status === "done")) {
    return { kind: "done", color: theme.colors.success } as const;
  }

  return { kind: "other", color: theme.colors.muted } as const;
};

type WorktreeRowProps = {
  item: Item;
  showGroup: boolean;
  isSelected: boolean;
  isFirstVisibleRow: boolean;
};

const WorktreeRow = React.memo(({
  item,
  showGroup,
  isSelected,
  isFirstVisibleRow,
}: WorktreeRowProps) => {
  const overwatchBadge = badgeForOverwatch(item.overwatch);

  return (
    <Box
      flexDirection="column"
      marginTop={showGroup && !isFirstVisibleRow ? 1 : 0}
    >
      {showGroup ? (
        <Box height={1} overflow="hidden">
          <Text bold color={theme.colors.muted} wrap="truncate-end">
            {item.group}
          </Text>
        </Box>
      ) : null}
      <Box
        paddingLeft={1}
        paddingRight={1}
        height={1}
        overflow="hidden"
        backgroundColor={isSelected ? theme.colors.selected : undefined}
        justifyContent="space-between"
      >
        <Box flexShrink={1} minWidth={0}>
          <Text color={isSelected ? theme.colors.accent : theme.colors.muted}>
            {isSelected ? "› " : "  "}
          </Text>
          <Box flexShrink={1} minWidth={0}>
            <Text
              bold={item.kind === "worktree"}
              color={
                isSelected
                  ? theme.colors.text
                  : item.kind === "source-empty"
                    ? theme.colors.muted
                    : undefined
              }
              wrap="truncate-end"
            >
              {item.name}
            </Text>
          </Box>
          {item.kind === "worktree" && item.isPrimary ? (
            <Text color={theme.colors.muted}> primary</Text>
          ) : null}
          {item.hasSession ? (
            <Text color={isSelected ? theme.colors.accent : theme.colors.muted}>
              {" "}
              ●
            </Text>
          ) : null}
        </Box>
        {overwatchBadge ? (
          <Box>
            <Text color={overwatchBadge.color}>{" π"}</Text>
            {overwatchBadge.kind === "working" ? (
              <Spinner color="cyan" />
            ) : null}
            {overwatchBadge.kind === "done" ? (
              <Text color={overwatchBadge.color}>✓</Text>
            ) : null}
          </Box>
        ) : null}
      </Box>
    </Box>
  );
});

WorktreeRow.displayName = "WorktreeRow";

type WorktreeSidebarProps = {
  loading: boolean;
  visibleRows: Item[];
  visibleStart: number;
  selected: number;
};

export const WorktreeSidebar = ({
  loading,
  visibleRows,
  visibleStart,
  selected,
}: WorktreeSidebarProps) => {
  if (loading) {
    return (
      <>
        <Box>
          <Spinner color="cyan" />
          <Text color={theme.colors.accent}> Loading worktrees…</Text>
        </Box>
        <Text color={theme.colors.muted}>
          Scanning configured repositories and linked worktrees.
        </Text>
      </>
    );
  }

  let lastGroup = "";

  return (
    <>
      {visibleRows.map((item, idx) => {
        const absoluteIndex = visibleStart + idx;
        const showGroup = item.group !== lastGroup;
        const isSelected = absoluteIndex === selected;
        lastGroup = item.group;

        return (
          <WorktreeRow
            key={item.path}
            item={item}
            showGroup={showGroup}
            isSelected={isSelected}
            isFirstVisibleRow={idx === 0}
          />
        );
      })}
    </>
  );
};
