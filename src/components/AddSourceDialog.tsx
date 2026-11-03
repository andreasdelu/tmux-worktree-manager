import React from "react";
import { Box, Text } from "ink";
import { TextInput } from "./TextInput";
import { theme } from "../theme";

type AddSourceDialogProps = {
  value: string;
  cursor?: number;
};

export const AddSourceDialog = ({ value, cursor }: AddSourceDialogProps) => (
  <Box flexDirection="column" marginTop={1}>
    <Text color={theme.colors.muted}>Repository path</Text>
    <Box borderStyle="round" borderColor={theme.colors.border} paddingX={1}>
      <TextInput value={value} cursor={cursor} placeholder="~/code/repository" />
    </Box>
  </Box>
);
