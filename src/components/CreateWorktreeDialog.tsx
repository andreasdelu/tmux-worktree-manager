import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme";

type CreateField = "worktreeName" | "branchName";

type CreateWorktreeDialogProps = {
  worktreeName: string;
  branchName: string;
  activeField: CreateField;
  createTargetPath: string;
};

const fieldBorderColor = (field: CreateField, activeField: CreateField) =>
  field === activeField ? theme.colors.accent : theme.colors.border;

export const CreateWorktreeDialog = ({
  worktreeName,
  branchName,
  activeField,
  createTargetPath,
}: CreateWorktreeDialogProps) => {
  const effectiveBranchName = branchName || worktreeName;

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color={theme.colors.muted}>Worktree name</Text>
      <Box
        borderStyle="round"
        borderColor={fieldBorderColor("worktreeName", activeField)}
        paddingX={1}
      >
        <Text color={theme.colors.text}>{worktreeName || "_"}</Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text color={theme.colors.muted}>Branch</Text>
        <Box
          borderStyle="round"
          borderColor={fieldBorderColor("branchName", activeField)}
          paddingX={1}
        >
          <Text color={branchName ? theme.colors.text : theme.colors.muted}>
            {effectiveBranchName || "_"}
          </Text>
        </Box>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text color={theme.colors.muted}>Target path</Text>
        <Text>{createTargetPath}</Text>
      </Box>
    </Box>
  );
};
