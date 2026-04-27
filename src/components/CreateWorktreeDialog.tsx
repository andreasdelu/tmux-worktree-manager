import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme";

type CreateWorktreeDialogProps = {
  value: string;
  createTargetPath: string;
};

export const CreateWorktreeDialog = ({
  value,
  createTargetPath,
}: CreateWorktreeDialogProps) => (
  <Box flexDirection="column" marginTop={1}>
    <Text color={theme.colors.muted}>Branch name</Text>
    <Box borderStyle="round" borderColor={theme.colors.border} paddingX={1}>
      <Text color={theme.colors.text}>{value || "_"}</Text>
    </Box>
    <Box marginTop={1} flexDirection="column">
      <Text color={theme.colors.muted}>Target path</Text>
      <Text>{createTargetPath}</Text>
    </Box>
  </Box>
);
