import React from "react";
import { Box, Text } from "ink";
import type { PullRequestsState } from "../lib/pullRequests";
import { derivePullRequestStack } from "../lib/pullRequests";
import { theme } from "../theme";
import { PullRequestNumber } from "./PullRequestNumber";

export const PullRequestDetails = ({ branch, data }: { branch: string; data?: PullRequestsState }) => {
  if (!branch) return null;
  if (!data || data.status === "loading") return <Text color={theme.colors.muted}>PR  Loading…</Text>;
  if (data.status !== "ready") return <Text color={theme.colors.muted}>PR  Unknown ({data.reason})</Text>;
  const stack = derivePullRequestStack(data, branch);
  if (stack.current.status !== "matched") return <Text color={theme.colors.muted}>
    PR  {data.coverage === "recent" ? "No PR in recent history" : "No PR found"}
  </Text>;
  const pr = stack.current.pullRequest;
  return <Box flexDirection="column">
    <Text bold color={theme.colors.muted}>PR stack{data.coverage === "recent" ? " · partial history" : ""}</Text>
    {[...stack.parents].reverse().map(parent => <Text key={`p${parent.number}`} wrap="truncate-end">
      {"↑ "}<PullRequestNumber {...parent} />{` ${parent.headRef}`}
    </Text>)}
    <Text wrap="truncate-end">{"• "}<PullRequestNumber {...pr} />{` ${pr.headRef} → ${pr.baseRef}`}</Text>
    {stack.children.map(child => <Text key={`c${child.number}`} wrap="truncate-end">
      {"↓ "}<PullRequestNumber {...child} />{` ${child.headRef} → ${child.baseRef}`}
    </Text>)}
    <Text color={theme.colors.muted} wrap="truncate-end">{pr.url}</Text>
    {stack.cycle ? <Text color={theme.colors.warning}>Cyclic PR relationships; stack incomplete.</Text> : null}
  </Box>;
};
