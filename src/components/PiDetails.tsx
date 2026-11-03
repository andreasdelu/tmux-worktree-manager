import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import { agentIsBusy, freshAgentState, freshChildState } from "../lib/agents";
import { Spinner } from "./Spinner";
import { theme } from "../theme";
import type { AgentPane, Item } from "../types";
import { AgentStatus } from "./AgentStatus";

const PaneDetails = ({ pane, rows }: { pane: AgentPane; rows: number }) => {
  const [, redraw] = useState(0);
  const now = Date.now();
  const expiry = Math.min(...[pane.messages?.heartbeat, pane.report?.heartbeat, pane.children?.heartbeat]
    .filter((heartbeat): heartbeat is number => heartbeat !== undefined && heartbeat + 15000 > now)
    .map(heartbeat => heartbeat + 15000));
  useEffect(() => {
    if (!Number.isFinite(expiry)) return;
    const timer = setTimeout(() => redraw(value => value + 1), Math.max(1, expiry - Date.now()));
    return () => clearTimeout(timer);
  }, [expiry]);
  const messages = freshAgentState(pane) && pane.messages && pane.messages.heartbeat <= Date.now()
    && Date.now() - pane.messages.heartbeat < 15000 ? pane.messages : undefined;
  const state = freshAgentState(pane);
  const live = Boolean(state);
  const children = freshChildState(pane);
  const childrenUnknown = Boolean(pane.children) && children !== "active" && children !== "inactive";
  const showActivity = agentIsBusy(pane) || !live || pane.dead || childrenUnknown || ["needs-input", "error", "stopped"].includes(state ?? "");
  const legacy = live && pane.report?.tools === undefined;
  const human = messages?.human || (legacy ? "Not reported: update reporter and /reload"
    : !live ? "Unavailable without a live reporter" : "No prompt observed yet");
  const agent = messages?.agent || (legacy ? "Not reported by this reporter"
    : !live ? "Unavailable without a live reporter" : "No reply observed yet");
  // At minimum height, status takes priority over stale or clipped messages.
  if (rows < 2) return <AgentStatus panes={[pane]} />;
  return <Box flexDirection="column" flexShrink={0}>
    {rows >= 3 ? <Text color={theme.colors.muted} wrap="truncate-end">π {pane.windowIndex}.{pane.paneIndex}</Text> : null}
    <Box flexShrink={0}><Box width={7} flexShrink={0}><Text color={theme.colors.muted}>You</Text></Box>
      <Text color={messages?.human ? undefined : theme.colors.muted} wrap="truncate-end">{human}</Text></Box>
    <Box flexShrink={0}><Box width={7} flexShrink={0}><Text color={theme.colors.muted}>Agent</Text></Box>
      {showActivity ? <Box><AgentStatus panes={[pane]} inline parentOnly={Boolean(pane.children)} />
        {childrenUnknown ? <Text color={theme.colors.muted} wrap="truncate-end"> · Subagent status unknown</Text> : null}</Box>
        : <Text color={messages?.agent ? undefined : theme.colors.muted} wrap="truncate-end">{agent}</Text>}</Box>
    {children === "active" ? <Box paddingLeft={7} flexShrink={0}>
      <Spinner /><Text color="cyan" wrap="truncate-end"> Subagents working</Text>
    </Box> : null}
  </Box>;
};

export const PiDetails = ({ current, rows = Infinity }: { current: Item; rows?: number }) => {
  const panes = current.agentPanes ?? [];
  const availableRows = rows - Number(Boolean(current.agentUnavailable));
  const neededRows = panes.reduce((sum, pane) => sum + 3 + Number(freshChildState(pane) === "active"), 0) + Math.max(0, panes.length - 1);
  const overflow = panes.length > 1 && neededRows > availableRows;
  let visibleCount = panes.length;
  if (overflow) {
    visibleCount = 0;
    let used = 0;
    for (const pane of panes) {
      const groupRows = 3 + Number(freshChildState(pane) === "active") + Number(visibleCount > 0);
      if (used + groupRows + 1 > availableRows) break; // reserve overflow notice
      used += groupRows;
      visibleCount++;
    }
  }
  return <Box flexDirection="column" flexShrink={0}>
    {current.agentUnavailable ? <Text color={theme.colors.muted}>tmux status unavailable.</Text> : null}
    {panes.slice(0, visibleCount).map((pane, index) => <Box key={pane.paneId} flexDirection="column" flexShrink={0} marginTop={index ? 1 : 0}><PaneDetails pane={pane} rows={availableRows} /></Box>)}
    {overflow ? <Text color={theme.colors.muted} wrap="truncate-end">{panes.length - visibleCount} more agents · enlarge terminal</Text> : null}
  </Box>;
};
