import path from "node:path";
import { isPrimaryWorktree } from "./actions";
import { loadTmuxSessionNames, sessionNameFor } from "./session";
import { loadOverwatchAgents, matchOverwatchAgent } from "./overwatch";
import type { Item, OverwatchAgentState, SourceEntry } from "../types";

const parseWorktreeItems = (
  repoRoot: string,
  sessionNames: Set<string>,
  overwatchAgents: OverwatchAgentState[],
): Item[] => {
  const proc = Bun.spawnSync({
    cmd: ["git", "-C", repoRoot, "worktree", "list", "--porcelain"],
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  });

  if (proc.exitCode !== 0) {
    return [];
  }

  const repoName = path.basename(repoRoot);

  return proc.stdout
    .toString()
    .split("\n")
    .filter((line) => line.startsWith("worktree "))
    .map((line) => line.slice("worktree ".length).trim())
    .filter(Boolean)
    .map((itemPath) => {
      const sessionName = sessionNameFor(itemPath);

      return {
        kind: "worktree" as const,
        group: repoName,
        path: itemPath,
        name: path.basename(itemPath),
        isPrimary: isPrimaryWorktree(itemPath),
        hasSession: sessionNames.has(sessionName),
        overwatch: matchOverwatchAgent(itemPath, sessionName, overwatchAgents),
      };
    });
};

export const annotateItemsWithLiveState = (items: Item[]): Item[] => {
  const sessionNames = loadTmuxSessionNames();
  const overwatchAgents = loadOverwatchAgents();

  return items.map((item) => {
    if (item.kind !== "worktree") {
      return item;
    }

    const sessionName = sessionNameFor(item.path);

    return {
      ...item,
      hasSession: sessionNames.has(sessionName),
      overwatch: matchOverwatchAgent(item.path, sessionName, overwatchAgents),
    };
  });
};

export const loadItems = (sourceEntries: SourceEntry[]): Item[] => {
  const sessionNames = loadTmuxSessionNames();
  const overwatchAgents = loadOverwatchAgents();
  const seen = new Set<string>();

  return sourceEntries.flatMap((source) => {
    if (!source.exists || !source.valid) {
      return [];
    }

    const items = parseWorktreeItems(
      source.resolvedPath,
      sessionNames,
      overwatchAgents,
    ).filter(
      (item) => {
        if (seen.has(item.path)) {
          return false;
        }
        seen.add(item.path);
        return true;
      },
    );

    if (items.length > 0) {
      return items;
    }

    return [
      {
        kind: "source-empty" as const,
        group: path.basename(source.resolvedPath),
        path: source.resolvedPath,
        name: "No linked worktrees yet",
        isPrimary: false,
        hasSession: false,
      },
    ];
  });
};
