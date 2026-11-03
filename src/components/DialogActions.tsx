// Adapted from InkUI's Dialog action-row presentation (MIT).
// See vendor/inkui/LICENSE. twm's controller retains confirmation authority.
import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme";

export const DialogActions = () => <Box marginTop={1} gap={2} flexWrap="wrap">
  <Text color={theme.colors.muted}>[y] Confirm</Text>
  <Text inverse color={theme.colors.accent}> [n / esc] Cancel </Text>
</Box>;
