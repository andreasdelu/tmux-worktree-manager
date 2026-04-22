import React from "react";
import { Box, Text } from "ink";
import type { Item } from "../types";

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
            >
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
          </Box>
        );
      })}
    </>
  );
};
