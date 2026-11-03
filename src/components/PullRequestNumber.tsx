import React from "react";
import { Text } from "ink";
import type { PullRequest } from "../lib/pullRequests";
import { theme } from "../theme";

const colors = {
  merged: "magenta",
  open: theme.colors.warning,
  draft: theme.colors.muted,
  closed: theme.colors.danger,
};

export const PullRequestNumber = ({ number, state, dot = false }: Pick<PullRequest, "number" | "state"> & { dot?: boolean }) => (
  <Text color={colors[state]}>{dot ? "●" : `#${number}`}</Text>
);
