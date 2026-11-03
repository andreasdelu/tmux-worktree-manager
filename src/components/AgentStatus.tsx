import React, { useEffect, useState } from "react";
import { Text } from "ink";
import { loadingFrames, loadingFrameIntervalMs } from "../config";
import { agentActivityBadge, agentDuration, agentIsBusy, agentStateLabel, freshAgentState, freshChildState } from "../lib/agents";
import type { AgentPane } from "../types";

// Keep animation inside Ink's clipping/layout. Absolute-cell painting would
// overwrite unrelated rows when an agent scrolls out of the details viewport.
export const AgentStatus = ({ panes, compact = false, parentOnly = false, inline = false }: { panes: AgentPane[]; compact?: boolean; parentOnly?: boolean; inline?: boolean }) => {
  // Even a parent-only label must not paint an all-clear for unknown children.
  const uncertainChildren = panes.some(pane => pane.children && !["active", "inactive"].includes(freshChildState(pane) ?? "unknown"));
  // The details panel gives children their own row; sidebar remains aggregate.
  if (parentOnly) panes = panes.map(pane => ({ ...pane, children: undefined }));
  const [tick, setTick] = useState(0);
  const now = Date.now();
  const busy = panes.some(pane => agentIsBusy(pane, now));
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => setTick(value => value + 1), loadingFrameIntervalMs);
    return () => clearInterval(timer);
  }, [busy]);
  const expiry = Math.min(...panes.filter(pane => freshAgentState(pane, now)).map(pane => Math.min(pane.report!.heartbeat, freshChildState(pane, now) ? pane.children!.heartbeat : Infinity) + 15000));
  useEffect(() => {
    if (!Number.isFinite(expiry)) return;
    // Polling pauses during dialogs. Expiry still redraws terminal/non-busy
    // reports, so a stopped reporter cannot leave a fresh Finished badge.
    const timer = setTimeout(() => setTick(value => value + 1), Math.max(1, expiry - Date.now()));
    return () => clearTimeout(timer);
  }, [expiry]);
  const badge = agentActivityBadge(panes, now);
  const states = panes.map(pane => freshAgentState(pane, now));
  const childrenUnknown = panes.some(pane => pane.children && freshChildState(pane, now) !== "inactive" && freshChildState(pane, now) !== "active");
  const finished = states.includes("done") && !childrenUnknown && !uncertainChildren;
  const failed = states.includes("error");
  const needsInput = states.includes("needs-input");
  const color = needsInput ? "yellow" : busy ? "cyan" : failed ? "red" : finished ? "green" : "gray";
  const glyph = needsInput ? "?" : busy ? loadingFrames[tick % loadingFrames.length] : failed ? "!" : finished ? "✓"
    : states.includes("stopped") || panes.every(pane => pane.dead) ? "■" : "π";
  if (!badge) return null;
  if (compact) return <Text color={color}>{glyph === "π" ? "π" : `π${glyph}`}</Text>;
  const pane = panes[0]!;
  const duration = agentDuration(pane, now);
  return <Text color={color} wrap="truncate-end">
    {`${glyph} ${inline ? "" : `${pane.windowIndex}.${pane.paneIndex} ${parentOnly ? "Parent · " : ""}`}${agentStateLabel(pane, now)}${duration ? ` · ${duration}` : ""}`}
  </Text>;
};
