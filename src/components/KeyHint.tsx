// Adapted from InkUI's KeyHint (MIT). See vendor/inkui/LICENSE.
// https://github.com/kamlesh723/InkUI/blob/main/packages/key-hint/src/KeyHint.tsx
import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme";

export type KeyHintItem = { key: string; label: string };

// Wrap between hints, not between a key and its action. Keep twm's theme and
// input ownership instead of importing InkUI's core or keyboard hooks.
export const KeyHint = ({ keys }: { keys: KeyHintItem[] }) => (
  <Box flexWrap="wrap" width="100%">
    {keys.map(({ key, label }) => (
      <Box key={key} marginRight={2} flexShrink={0}>
        <Text bold color={theme.colors.secondary}>[{key}]</Text>
        <Text color={theme.colors.muted}> {label}</Text>
      </Box>
    ))}
  </Box>
);
