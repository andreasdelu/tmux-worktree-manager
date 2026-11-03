import React from "react";
import { Text } from "ink";
import { DialogFrame } from "./DialogFrame";
import { theme } from "../theme";
import type { UnassignedSession } from "../lib/session";

export const AssignSessionOverlay = ({ rootHeight, isSplit, sessions, selected }: {
  rootHeight: number; isSplit: boolean; sessions: UnassignedSession[]; selected: number;
}) => {
  const count = Math.max(1, Math.min(8, rootHeight - 16));
  const start = Math.max(0, Math.min(selected - Math.floor(count / 2), sessions.length - count));
  return <DialogFrame rootHeight={rootHeight} isSplit={isSplit} borderColor={theme.colors.border}
    title="Assign existing tmux session"
    subtitle="Links this checkout to the session without renaming it. Keeps panes, processes and directories; does not run layout.sh."
    footer={`j/k move • enter assign • esc cancel (${selected + 1}/${sessions.length})`}>
    {sessions.slice(start, start + count).map((session, index) => <Text key={session.id}
      color={start + index === selected ? theme.colors.accent : theme.colors.text} wrap="truncate-end">
      {start + index === selected ? "› " : "  "}{session.name}
    </Text>)}
  </DialogFrame>;
};
