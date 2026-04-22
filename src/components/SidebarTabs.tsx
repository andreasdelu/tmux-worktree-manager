import React from "react";
import { Box, Text } from "ink";
import type { ViewMode } from "../types";

type SidebarTabsProps = {
  view: ViewMode;
};

export const SidebarTabs = ({ view }: SidebarTabsProps) => (
  <Box marginBottom={1}>
    {view === "worktrees" ? (
      <Box flexDirection="row" gap={1}>
        <Text color="blue">Worktrees</Text>
        <Text color="gray">|</Text>
        <Text color="gray">Sources</Text>
      </Box>
    ) : (
      <Box flexDirection="row" gap={1}>
        <Text color="gray">Worktrees</Text>
        <Text color="gray">|</Text>
        <Text color="blue">Sources</Text>
      </Box>
    )}
  </Box>
);
