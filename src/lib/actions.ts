import fs from "node:fs";
import path from "node:path";
import { runCommand, runCommandSync } from "./commands";
import {
  createSession,
  enterSession,
  hasTmuxSession,
  hasTmuxSessionAsync,
  sessionNameFor,
} from "./session";
import type { ActionMode } from "../types";

const gitPathForDir = (
  dir: string,
  mode: "--git-dir" | "--git-common-dir",
) => {
  const result = runCommandSync(["git", "-C", dir, "rev-parse", mode]);
  const raw = result.stdout.trim();
  const resolved = path.isAbsolute(raw) ? raw : path.resolve(dir, raw);
  return path.resolve(resolved);
};

const gitPathForDirAsync = async (
  dir: string,
  mode: "--git-dir" | "--git-common-dir",
) => {
  const result = await runCommand(["git", "-C", dir, "rev-parse", mode]);
  const raw = result.stdout.trim();
  const resolved = path.isAbsolute(raw) ? raw : path.resolve(dir, raw);
  return path.resolve(resolved);
};

export const isPrimaryWorktree = (dir: string) =>
  gitPathForDir(dir, "--git-dir") === gitPathForDir(dir, "--git-common-dir");

export const isPrimaryWorktreeAsync = async (dir: string) =>
  (await gitPathForDirAsync(dir, "--git-dir")) ===
  (await gitPathForDirAsync(dir, "--git-common-dir"));

const mainRepoForDir = (dir: string) =>
  path.dirname(gitPathForDir(dir, "--git-common-dir"));

const mainRepoForDirAsync = async (dir: string) =>
  path.dirname(await gitPathForDirAsync(dir, "--git-common-dir"));

const defaultWorktreeRootForRepo = (repoRoot: string) =>
  path.join(path.dirname(repoRoot), `${path.basename(repoRoot)}-worktrees`);

const suggestedTargetRootCache = new Map<string, string>();

const suggestedCreateTargetRoot = (dir: string) => {
  const cached = suggestedTargetRootCache.get(dir);
  if (cached) {
    return cached;
  }

  const mainRepo = mainRepoForDir(dir);
  const targetRoot = isPrimaryWorktree(dir)
    ? defaultWorktreeRootForRepo(mainRepo)
    : path.dirname(dir);

  suggestedTargetRootCache.set(dir, targetRoot);
  return targetRoot;
};

export const suggestedCreateTargetDir = (dir: string, worktreeName: string) =>
  path.join(suggestedCreateTargetRoot(dir), worktreeName);

export const removalBlockedReason = async (
  itemPath: string,
): Promise<string | null> => {
  const sessionName = sessionNameFor(itemPath);

  if (await isPrimaryWorktreeAsync(itemPath)) {
    return "This is the primary checkout, so twm won't remove it.";
  }

  if ((await runCommand(["git", "-C", itemPath, "status", "--porcelain"])).stdout.trim()) {
    return "This worktree has uncommitted changes. Commit, stash, or discard them first, then try again.";
  }

  const currentSession = (
    await runCommand(["tmux", "display-message", "-p", "#S"])
  ).stdout.trim();

  if (process.env.TMUX && sessionName === currentSession) {
    return "You're currently inside this worktree's tmux session, so twm won't remove it.";
  }

  return null;
};

export const performAction = async (
  mode: ActionMode,
  itemPath: string,
): Promise<string> => {
  const sessionName = sessionNameFor(itemPath);

  if (mode === "kill") {
    if (!(await hasTmuxSessionAsync(sessionName))) {
      return `No tmux session for ${path.basename(itemPath)}`;
    }

    const currentSession = (
      await runCommand(["tmux", "display-message", "-p", "#S"])
    ).stdout.trim();

    if (process.env.TMUX && sessionName === currentSession) {
      return "Won't close the current tmux session";
    }

    const killed = await runCommand(["tmux", "kill-session", "-t", sessionName]);
    return killed.success
      ? `Closed tmux session for ${path.basename(itemPath)}`
      : `Failed to close tmux session for ${path.basename(itemPath)}`;
  }

  const blockedReason = await removalBlockedReason(itemPath);
  if (blockedReason) {
    return blockedReason;
  }

  if (await hasTmuxSessionAsync(sessionName)) {
    await runCommand(["tmux", "kill-session", "-t", sessionName]);
  }

  const mainRepo = await mainRepoForDirAsync(itemPath);
  const removed = await runCommand([
    "git",
    "-C",
    mainRepo,
    "worktree",
    "remove",
    itemPath,
  ]);
  return removed.success
    ? `Removed worktree ${path.basename(itemPath)}`
    : `Failed to remove worktree ${path.basename(itemPath)}`;
};

export const openItem = (itemPath: string) => {
  const sessionName = sessionNameFor(itemPath);

  if (!hasTmuxSession(sessionName)) {
    createSession(sessionName, itemPath);
  }

  enterSession(sessionName);
};

export const createItem = async (
  itemPath: string,
  worktreeName: string,
  branchName: string,
): Promise<string> => {
  const mainRepo = await mainRepoForDirAsync(itemPath);
  const targetDir = suggestedCreateTargetDir(itemPath, worktreeName);

  if (fs.existsSync(targetDir)) {
    return `Target already exists: ${path.basename(targetDir)}`;
  }

  fs.mkdirSync(path.dirname(targetDir), { recursive: true });

  const branchExists = (
    await runCommand([
      "git",
      "-C",
      mainRepo,
      "show-ref",
      "--verify",
      "--quiet",
      `refs/heads/${branchName}`,
    ])
  ).success;

  const createResult = branchExists
    ? await runCommand([
        "git",
        "-C",
        mainRepo,
        "worktree",
        "add",
        targetDir,
        branchName,
      ])
    : await runCommand([
        "git",
        "-C",
        mainRepo,
        "worktree",
        "add",
        "-b",
        branchName,
        targetDir,
      ]);

  return createResult.success
    ? `Created worktree ${path.basename(targetDir)}`
    : `Failed to create worktree ${branchName}`;
};
