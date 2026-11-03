import React from "react";
import { Box, Text } from "ink";
import { TextInput } from "./TextInput";
import { theme } from "../theme";

import type { CreateField, CreateSessionMode } from "../types";
type Props = {
  worktreeName: string;
  branchName: string;
  baseRef: string;
  defaultBase: string;
  activeField: CreateField;
  sessionMode?: CreateSessionMode;
  cursor?: number;
  createTargetPath: string;
};
export const CreateWorktreeDialog = ({ worktreeName, branchName, baseRef, defaultBase, activeField, cursor, createTargetPath, sessionMode = "none" }: Props) => (
  <Box flexDirection="column" marginTop={1}>
    <Text color={theme.colors.muted} wrap="truncate-end">Paste a Linear Git branch: keep branch, suggest issue ID + 4 words.</Text>
    {([
      ["worktreeName", "Name", worktreeName],
      ["branchName", "Branch", branchName],
      ["baseRef", "Base", baseRef],
    ] as const).map(([field, label, value]) => (
      <Box key={field} height={1}>
        <Text color={activeField === field ? theme.colors.accent : theme.colors.muted}>{`${activeField === field ? "›" : " "} ${label.padEnd(7)} `}</Text>
        <TextInput value={value} cursor={activeField === field ? cursor : undefined} focus={activeField === field}
          placeholder={field === "branchName" ? worktreeName : field === "baseRef" ? `(selected: ${defaultBase || "HEAD"})` : "worktree name"} />
      </Box>
    ))}
    {([
      ["createSession", "Create tmux session", sessionMode !== "none"],
      ["openSession", "Open after creation", sessionMode === "open"],
    ] as const).map(([field, label, checked]) => <Text key={field}
      color={activeField === field ? theme.colors.accent : theme.colors.muted}>
      {`${activeField === field ? "›" : " "} [${checked ? "x" : " "}] ${label}`}
    </Text>)}
    <Text color={theme.colors.muted} wrap="truncate-end">{`Target ${createTargetPath}`}</Text>
  </Box>
);
