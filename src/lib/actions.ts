import fs from "node:fs";
import path from "node:path";
import { runCommand, runCommandSync, stripAnsi } from "./commands";
import { isValidBranchName } from "./branchInput";
import {
  ensureSessionFor,
  enterSession,
  sessionForAsync,
} from "./session";
import type { ActionMode, CreateSessionMode } from "../types";
import { refreshPopupOrigin } from "./popup";

const errorDetail = (value: string) =>
  stripAnsi(value)
    .replace(/\x1B\][^\x07\x1B]*(?:\x07|\x1B\\)/g, "")
    .replace(/[\p{Cc}\p{Cf}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);

const commandFailure = (message: string, stderr: string) => {
  const detail = errorDetail(stderr);
  return detail ? `${message}: ${detail}` : message;
};

const checkedGitPath = (
  dir: string,
  result: { success: boolean; stdout: string; stderr: string },
) => {
  const raw = result.stdout.trim();
  if (!result.success || !raw) {
    throw new Error(commandFailure("Couldn't inspect Git worktree", result.stderr));
  }
  return path.resolve(dir, raw);
};

const gitPathForDir = (
  dir: string,
  mode: "--git-dir" | "--git-common-dir",
) => {
  const result = runCommandSync(["git", "-C", dir, "rev-parse", mode]);
  return checkedGitPath(dir, result);
};

const gitPathForDirAsync = async (
  dir: string,
  mode: "--git-dir" | "--git-common-dir",
) => {
  const result = await runCommand(["git", "-C", dir, "rev-parse", mode]);
  return checkedGitPath(dir, result);
};

export const isPrimaryWorktree = (dir: string) =>
  gitPathForDir(dir, "--git-dir") === gitPathForDir(dir, "--git-common-dir");

export const isPrimaryWorktreeAsync = async (dir: string) =>
  (await gitPathForDirAsync(dir, "--git-dir")) ===
  (await gitPathForDirAsync(dir, "--git-common-dir"));

const mainRepoForDir = (dir: string) =>
  path.dirname(gitPathForDir(dir, "--git-common-dir"));

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

const createTargetDir = (root: string, worktreeName: string) => {
  if (
    !worktreeName.trim() ||
    worktreeName === "." ||
    worktreeName === ".." ||
    !/^[A-Za-z0-9._-]+$/.test(worktreeName)
  ) {
    throw new Error("Invalid worktree folder name: use letters, digits, dots, underscores or hyphens.");
  }

  const targetDir = path.resolve(root, worktreeName);
  if (path.dirname(targetDir) !== path.resolve(root)) {
    throw new Error("Worktree folder must stay inside the worktree root.");
  }
  return targetDir;
};

export const suggestedCreateTargetDir = (dir: string, worktreeName: string) =>
  createTargetDir(suggestedCreateTargetRoot(dir), worktreeName);

// Preserve launch-origin protection and also inspect the exact invoking client
// after retained popup navigation. Never substitute tmux's most-recent client.
const protectedSessions = async (): Promise<string[]> => {
  refreshPopupOrigin();
  const origin = process.env.TWM_ORIGIN_SESSION || process.env.TMUX_PANE;
  const result = await runCommand(["tmux", "display-message", "-p", ...(origin ? ["-t", origin] : []), "#{session_id}"]);
  if (!result.success || !/^\$\d+$/.test(result.stdout.trim())) throw new Error(commandFailure("Couldn't identify current tmux session", result.stderr));
  const sessions = [result.stdout.trim()];
  if (process.env.TWM_ORIGIN_CLIENT) {
    const clients = await runCommand(["tmux", "list-clients", "-F", "#{client_name}\t#{session_id}"]);
    const matches = clients.stdout.split("\n").map(line => line.split("\t")).filter(([name]) => name === process.env.TWM_ORIGIN_CLIENT);
    if (!clients.success || matches.length !== 1 || !/^\$\d+$/.test(matches[0]?.[1] ?? "")) throw new Error(commandFailure("Couldn't identify invoking tmux client's session", clients.stderr));
    sessions.push(matches[0][1]);
  }
  return sessions;
};

export const removalBlockedReason = async (
  itemPath: string,
): Promise<string | null> => {
  try {
    if (await isPrimaryWorktreeAsync(itemPath)) {
      return "This is the primary checkout, so twm won't remove it.";
    }

    const status = await runCommand([
      "git", "-C", itemPath, "status", "--porcelain",
      "--untracked-files=all", "--ignore-submodules=none",
    ]);
    if (!status.success) {
      return commandFailure("Couldn't check worktree changes; removal blocked", status.stderr);
    }
    if (status.stdout.trim()) {
      return "This worktree has uncommitted changes. Commit, stash, or discard them first, then try again.";
    }

    const session = await sessionForAsync(itemPath);
    if (process.env.TMUX) {
      if (session && (await protectedSessions()).includes(session.id)) {
        return "You're currently inside this worktree's tmux session, so twm won't remove it.";
      }
    }

    return null;
  } catch (error) {
    return commandFailure("Removal blocked", error instanceof Error ? error.message : String(error));
  }
};

export const performAction = async (
  mode: ActionMode,
  itemPath: string,
): Promise<string> => {
  if (mode === "kill") {
    let session;
    try { session = await sessionForAsync(itemPath); }
    catch (error) { return commandFailure("Closing blocked", error instanceof Error ? error.message : String(error)); }
    if (!session) {
      return `No tmux session for ${path.basename(itemPath)}`;
    }

    if (process.env.TMUX) {
      try {
        if ((await protectedSessions()).includes(session.id)) {
          return "Won't close the current tmux session";
        }
      } catch (error) {
        return commandFailure("Closing blocked", error instanceof Error ? error.message : String(error));
      }
    }

    const killed = await runCommand(["tmux", "kill-session", "-t", session.id]);
    return killed.success
      ? `Closed tmux session for ${path.basename(itemPath)}`
      : `Failed to close tmux session for ${path.basename(itemPath)}`;
  }

  // Repeat the checks at execution time, even if the UI checked before confirming.
  const blockedReason = await removalBlockedReason(itemPath);
  if (blockedReason) {
    return blockedReason;
  }

  let session;
  try {
    session = await sessionForAsync(itemPath);
    if (session && process.env.TMUX && (await protectedSessions()).includes(session.id)) {
      return "You're currently inside this worktree's tmux session, so twm won't remove it.";
    }
    const removed = await runCommand([
      "git", "-C", itemPath, "worktree", "remove", itemPath,
    ]);
    if (!removed.success) {
      return commandFailure(`Failed to remove worktree ${path.basename(itemPath)}`, removed.stderr);
    }
  } catch (error) {
    return commandFailure("Failed to remove worktree", error instanceof Error ? error.message : String(error));
  }

  const message = `Removed worktree ${path.basename(itemPath)}`;
  // Preserve the session when Git refuses removal (including changes made after checking).
  try {
    if (session) {
      const killed = await runCommand(["tmux", "kill-session", "-t", session.id]);
      if (!killed.success) {
        return commandFailure(`${message}; failed to close tmux session`, killed.stderr);
      }
    }
  } catch (error) {
    return commandFailure(`${message}; couldn't check tmux session`, error instanceof Error ? error.message : String(error));
  }
  return message;
};

export const openItem = (itemPath: string) => enterSession(ensureSessionFor(itemPath));

export const createItemResult = async (
  itemPath: string,
  worktreeName: string,
  branchName: string,
  baseRef?: string,
  targetRoot?: string,
  sessionMode: CreateSessionMode = "none",
): Promise<{ message: string; sessionReady: boolean }> => {
  const failure = (message: string) => ({ message, sessionReady: false });
  try {
    if (!(await isValidBranchName(branchName))) {
      return failure("Invalid branch name. Use a literal Git branch name.");
    }

    // Git worktree/ref commands share repository state from any linked checkout,
    // including bare-backed or separate-Git-directory repositories.
    const mainRepo = itemPath;
    const root = targetRoot ?? ((await isPrimaryWorktreeAsync(itemPath))
      ? defaultWorktreeRootForRepo(path.dirname(await gitPathForDirAsync(itemPath, "--git-common-dir")))
      : path.dirname(itemPath));
    const targetDir = createTargetDir(root, worktreeName);
    if (fs.existsSync(targetDir)) {
      return failure(`Target already exists: ${path.basename(targetDir)}`);
    }

    const branch = await runCommand([
      "git", "-C", mainRepo, "show-ref", "--verify", "--quiet",
      `refs/heads/${branchName}`,
    ]);
    if (!branch.success && branch.exitCode !== 1) {
      return failure(commandFailure("Couldn't check existing branch", branch.stderr));
    }
    if (branch.success && baseRef !== undefined) {
      return failure("Branch already exists; a starting ref can only be used with a new branch.");
    }

    const args = ["git", "-C", mainRepo, "worktree", "add"];
    if (branch.success) {
      args.push(targetDir, branchName);
    } else {
      // Resolve from the selected worktree, not the primary checkout's HEAD.
      const base = await runCommand([
        "git", "-C", itemPath, "rev-parse", "--verify", "--end-of-options",
        `${baseRef ?? "HEAD"}^{commit}`,
      ]);
      const commit = base.stdout.trim();
      if (!base.success || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(commit)) {
        return failure(commandFailure("Couldn't resolve starting commit", base.stderr));
      }
      args.push("-b", branchName, targetDir, commit);
    }

    fs.mkdirSync(path.dirname(targetDir), { recursive: true });
    const created = await runCommand(args);
    if (!created.success) return failure(commandFailure(`Failed to create worktree ${errorDetail(branchName)}`, created.stderr));
    const message = `Created worktree ${path.basename(targetDir)}`;
    if (sessionMode !== "none") {
      try {
        ensureSessionFor(targetDir);
      } catch (error) {
        return failure(commandFailure(`${message}; could not create tmux session`, error instanceof Error ? error.message : String(error)));
      }
    }
    return { message, sessionReady: sessionMode !== "none" };
  } catch (error) {
    return failure(commandFailure("Failed to create worktree", error instanceof Error ? error.message : String(error)));
  }
};

export const createItem = async (...args: Parameters<typeof createItemResult>): Promise<string> =>
  (await createItemResult(...args)).message;
