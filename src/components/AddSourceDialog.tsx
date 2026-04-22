import React from "react";
import { Box, Text } from "ink";

type AddSourceDialogProps = {
  value: string;
};

export const AddSourceDialog = ({ value }: AddSourceDialogProps) => (
  <Box flexDirection="column" marginTop={1}>
    <Text color="gray">Repository path</Text>
    <Box borderStyle="round" borderColor="gray" paddingX={1}>
      <Text color="white">{value || "_"}</Text>
    </Box>
  </Box>
);
