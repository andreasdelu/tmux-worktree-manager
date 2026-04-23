import React from "react";
import { Box, Text } from "ink";
import type { Item, OverwatchMatch } from "../types";

const badgeForOverwatch = (match: OverwatchMatch | undefined, loadingGlyph: string) => {
  if (!match) {
    return null;
  }

  const agents = match.kind === "single" ? [match.agent] : match.agents;
  const onlineAgents = agents.filter((agent) => agent.status !== "offline");

  if (onlineAgents.length === 0) {
    return null;
  }

  if (onlineAgents.some((agent) => agent.status === "working")) {
    return { prefix: " π", suffix: loadingGlyph, color: "cyan" } as const;
  }

  if (onlineAgents.every((agent) => agent.status === "done")) {
    return { prefix: " π", suffix: "✓", color: "green" } as const;
  }

  return { prefix: " π", suffix: "", color: "gray" } as const;
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
        <Text color="cyan">{loadingGlyph} Loading worktrees…</Text>
        <Text color="gray">
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
              <Box>
                <Text bold color="gray">
                  {item.group}
                </Text>
              </Box>
            ) : null}
            <Box
              paddingLeft={1}
              paddingRight={1}
              backgroundColor={isSelected ? "#12363a" : undefined}
              justifyContent="space-between"
            >
              <Box>
                <Text color={isSelected ? "cyan" : "gray"}>
                  {isSelected ? "› " : "  "}
                </Text>
                <Text
                  bold={item.kind === "worktree"}
                  color={
                    isSelected
                      ? "white"
                      : item.kind === "source-empty"
                        ? "gray"
                        : undefined
                  }
                >
                  {item.name}
                </Text>
                {item.hasSession ? (
                  <Text color={isSelected ? "cyan" : "gray"}> ●</Text>
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
