import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme";

type AddSourceDialogProps = {
  value: string;
};

export const AddSourceDialog = ({ value }: AddSourceDialogProps) => (
  <Box flexDirection="column" marginTop={1}>
    <Text color={theme.colors.muted}>Repository path</Text>
    <Box borderStyle="round" borderColor={theme.colors.border} paddingX={1}>
      <Text color={theme.colors.text}>{value || "_"}</Text>
    </Box>
  </Box>
);
