import fs from "node:fs";
import path from "node:path";
import { runCommand } from "./commands";
import { rememberSessionName, defaultSessionNameFor } from "./session";
import { associatedSessionName, parseSessionRecords, sessionListFormat } from "./sessionAssociations";
import { loadLiveItems } from "./agents";
import type { Item, SourceEntry } from "../types";

export const parseWorktreeRecords = (output: string) => {
  const records: Array<{ path: string; branch: string; bare: boolean; locked: boolean; prunable: boolean }> = [];
  let current: (typeof records)[number] | undefined;
  for (const line of output.split("\0")) {
    if (line.startsWith("worktree ")) {
      current = { path: line.slice(9), branch: "", bare: false, locked: false, prunable: false };
      records.push(current);
    } else if (current) {
      if (line.startsWith("branch ")) current.branch = line.slice(7).replace(/^refs\/heads\//, "");
      if (line === "bare") current.bare = true;
      if (line.startsWith("locked")) current.locked = true;
      if (line.startsWith("prunable")) current.prunable = true;
    }
  }
  return records;
};

export const annotateItemsWithLiveState = loadLiveItems;

const annotateSessions = async (items: Item[]): Promise<Item[]> => {
  const result = await runCommand(["tmux", "list-sessions", "-F", sessionListFormat]);
  const sessions = parseSessionRecords(result.stdout);
  const names = new Set(sessions.map(session => session.name));
  return items.map(item => {
    if (item.kind !== "worktree") return item;
    const sessionName = associatedSessionName(item.path, defaultSessionNameFor(item.path), sessions);
    return { ...item, sessionName, hasSession: names.has(sessionName) };
  });
};

const loadSourceItems = async (source: SourceEntry, strict = false): Promise<Item[]> => {
  if (!source.valid || !source.exists) return [];
  const listed = await runCommand(["git", "-C", source.resolvedPath, "worktree", "list", "--porcelain", "-z"]);
  if (!listed.success || !source.commonDir) {
    if (strict) throw new Error("Could not discover Git worktrees");
    return [];
  }
  const repoRoot = path.dirname(source.commonDir);
  const records = parseWorktreeRecords(listed.stdout);
  // Separate Git storage may list the metadata directory as the primary path.
  // A validated primary source supplies its actual checkout; never open storage.
  if (source.isPrimary && records[0] && !records[0].bare) records[0].path = source.resolvedPath;
  const items = records.filter(record => !record.bare).map(record => {
    // Preserve the existing naming convention, including separate Git directories.
    const sessionName = rememberSessionName(record.path, repoRoot, path.resolve(record.path) === path.resolve(repoRoot));
    return {
      kind: "worktree" as const,
      group: path.basename(repoRoot),
      path: record.path,
      name: path.basename(record.path),
      repoRoot: source.resolvedPath,
      createRoot: !records[0]?.bare && record === records[0]
        ? path.join(path.dirname(repoRoot), `${path.basename(repoRoot)}-worktrees`)
        : path.dirname(record.path),
      branch: record.branch,
      sessionName,
      available: record.path !== source.commonDir && fs.existsSync(record.path),
      locked: record.locked,
      isPrimary: !records[0]?.bare && record === records[0],
      hasSession: false,
    };
  });
  return items.length ? items : [{
    kind: "source-empty", group: path.basename(repoRoot), path: source.resolvedPath,
    repoRoot: source.resolvedPath, createRoot: path.join(path.dirname(repoRoot), `${path.basename(repoRoot)}-worktrees`),
    name: "No linked worktrees yet", branch: "", sessionName: "",
    available: true, locked: false, isPrimary: false, hasSession: false,
  }];
};

export const loadItems = async (sources: SourceEntry[], strict = false): Promise<Item[]> => {
  const results: Item[][] = new Array(sources.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(3, sources.length) }, async () => {
    while (cursor < sources.length) {
      const index = cursor++;
      results[index] = await loadSourceItems(sources[index]!, strict);
    }
  }));
  const seen = new Set<string>();
  return annotateSessions(results.flat().filter(item => {
    if (seen.has(item.path)) return false;
    seen.add(item.path);
    return true;
  }));
};

export const reloadRepositoryItems = async (items: Item[], sources: SourceEntry[], repoRoot: string) => {
  const source = sources.find(entry => entry.resolvedPath === repoRoot);
  if (!source) return loadItems(sources, true);
  const replacement = await loadSourceItems(source, true);
  const firstIndex = items.findIndex(item => item.repoRoot === repoRoot);
  const remaining = items.filter(item => item.repoRoot !== repoRoot);
  remaining.splice(firstIndex < 0 ? remaining.length : firstIndex, 0, ...replacement);
  return annotateSessions(remaining);
};
