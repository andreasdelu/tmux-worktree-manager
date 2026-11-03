import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme";
import type { Item } from "../types";
import { Spinner } from "./Spinner";
import { useTwmStore } from "../store";
import { matchPullRequestForBranch } from "../lib/pullRequests";
import { AgentStatus } from "./AgentStatus";
import { PullRequestNumber } from "./PullRequestNumber";

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
  const data = useTwmStore(state => state.pullRequests[item.repoRoot]);
  const pr = data?.status === "ready" ? matchPullRequestForBranch(data, item.branch) : null;
  const removalIndex = useTwmStore(state => state.removingPaths.indexOf(item.path));

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
        </Box>
        <Box flexShrink={0}>
          {removalIndex >= 0 ? <Text color={theme.colors.warning}>{removalIndex === 0 ? " Removing…" : " Queued…"}</Text> : null}
          {!item.available ? <Text color={theme.colors.muted}> unavailable</Text> : item.locked ? <Text color={theme.colors.muted}> locked</Text> : null}
          {item.agentPanes?.length ? <Text> <AgentStatus panes={item.agentPanes} compact /></Text> : null}
          <Box width={2} justifyContent="flex-end">{pr?.status === "matched" ? <PullRequestNumber {...pr.pullRequest} dot /> : null}</Box>
          <Box width={2} justifyContent="flex-end">{item.hasSession ? <Text color={theme.colors.muted}>T</Text> : null}</Box>
        </Box>
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
