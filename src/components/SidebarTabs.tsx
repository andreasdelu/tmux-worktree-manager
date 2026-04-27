import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme";
import type { ViewMode } from "../types";

type SidebarTabsProps = {
  view: ViewMode;
};

export const SidebarTabs = ({ view }: SidebarTabsProps) => (
  <Box marginBottom={1}>
    {view === "worktrees" ? (
      <Box flexDirection="row" gap={1}>
        <Text color={theme.colors.primary}>Worktrees</Text>
        <Text color={theme.colors.muted}>|</Text>
        <Text color={theme.colors.muted}>Sources</Text>
      </Box>
    ) : (
      <Box flexDirection="row" gap={1}>
        <Text color={theme.colors.muted}>Worktrees</Text>
        <Text color={theme.colors.muted}>|</Text>
        <Text color={theme.colors.primary}>Sources</Text>
      </Box>
    )}
  </Box>
);
