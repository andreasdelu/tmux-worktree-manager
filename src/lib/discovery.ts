import path from "node:path";
import { loadTmuxSessionNames, sessionNameFor } from "./session";
import type { Item, SourceEntry } from "../types";

const parseWorktreeItems = (
  repoRoot: string,
  sessionNames: Set<string>,
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
    .map((itemPath) => ({
      group: repoName,
      path: itemPath,
      name: path.basename(itemPath),
      hasSession: sessionNames.has(sessionNameFor(itemPath)),
    }))
    .filter((item) => item.name !== item.group);
};

export const loadItems = (sourceEntries: SourceEntry[]): Item[] => {
  const sessionNames = loadTmuxSessionNames();
  const seen = new Set<string>();

  return sourceEntries.flatMap((source) => {
    if (!source.exists || !source.valid) {
      return [];
    }

    return parseWorktreeItems(source.resolvedPath, sessionNames).filter(
      (item) => {
        if (seen.has(item.path)) {
          return false;
        }
        seen.add(item.path);
        return true;
      },
    );
  });
};
