import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme";
import type { Item, OverwatchMatch } from "../types";

const badgeForOverwatch = (
  match: OverwatchMatch | undefined,
  loadingGlyph: string,
) => {
  if (!match) {
    return null;
  }

  const agents = match.kind === "single" ? [match.agent] : match.agents;
  const onlineAgents = agents.filter((agent) => agent.status !== "offline");

  if (onlineAgents.length === 0) {
    return null;
  }

  if (onlineAgents.some((agent) => agent.status === "working")) {
    return {
      prefix: " π",
      suffix: loadingGlyph,
      color: theme.colors.accent,
    } as const;
  }

  if (onlineAgents.every((agent) => agent.status === "done")) {
    return { prefix: " π", suffix: "✓", color: theme.colors.success } as const;
  }

  return { prefix: " π", suffix: "", color: theme.colors.muted } as const;
};

type WorktreeSidebarProps = {
  loading: boolean;
  loadingGlyph: string;
  visibleRows: Item[];
  visibleStart: number;
  selected: number;
};

export const WorktreeSidebar = ({
  loading,
  loadingGlyph,
  visibleRows,
  visibleStart,
  selected,
}: WorktreeSidebarProps) => {
  if (loading) {
    return (
      <>
        <Text color={theme.colors.accent}>
          {loadingGlyph} Loading worktrees…
        </Text>
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

        const overwatchBadge = badgeForOverwatch(item.overwatch, loadingGlyph);

        return (
          <Box
            key={item.path}
            flexDirection="column"
            marginTop={showGroup && absoluteIndex !== 0 ? 1 : 0}
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
                <Text
                  color={isSelected ? theme.colors.accent : theme.colors.muted}
                >
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
                  <Text
                    color={
                      isSelected ? theme.colors.accent : theme.colors.muted
                    }
                  >
                    {" "}
                    ●
                  </Text>
                ) : null}
              </Box>
              {overwatchBadge ? (
                <Text color={overwatchBadge.color}>
                  {overwatchBadge.prefix}
                  {overwatchBadge.suffix}
                </Text>
              ) : null}
            </Box>
          </Box>
        );
      })}
    </>
  );
};
