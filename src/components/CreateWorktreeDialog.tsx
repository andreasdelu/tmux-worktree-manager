import React from "react";
import { Box, Text } from "ink";

type CreateWorktreeDialogProps = {
  value: string;
  createTargetPath: string;
};

export const CreateWorktreeDialog = ({
  value,
  createTargetPath,
}: CreateWorktreeDialogProps) => (
  <Box flexDirection="column" marginTop={1}>
    <Text color="gray">Branch name</Text>
    <Box borderStyle="round" borderColor="gray" paddingX={1}>
      <Text color="white">{value || "_"}</Text>
    </Box>
    <Box marginTop={1} flexDirection="column">
      <Text color="gray">Target path</Text>
      <Text>{createTargetPath}</Text>
    </Box>
  </Box>
);
