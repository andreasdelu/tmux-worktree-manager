import fs from "node:fs";
import path from "node:path";
import { layoutHookFile } from "../config";
import { runCommand, runCommandSync } from "./commands";

const safeSessionToken = (value: string, fallback: string) =>
  value.replace(/[ /.]/g, "-").replace(/[^A-Za-z0-9_-]/g, "") || fallback;

const shortChecksumFor = (value: string) => {
  const proc = Bun.spawnSync({
    cmd: [
      "bash",
      "-c",
      `printf '%s' "$1" | cksum | awk '{print $1}'`,
      "--",
      value,
    ],
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  });
  const checksum = Number.parseInt(proc.stdout.toString().trim() || "0", 10);
  return checksum.toString(16).padStart(4, "0").slice(-4);
};

export const sessionNameFor = (dir: string): string => {
  const worktreeRoot = repoRootFor(dir);
  const repoRoot = mainRepoRootFor(dir);
  const safeRepo = safeSessionToken(path.basename(repoRoot), "repo");

  if (path.resolve(worktreeRoot) === path.resolve(repoRoot)) {
    return safeRepo;
  }

  const safeWorktree = safeSessionToken(path.basename(worktreeRoot), "worktree");
  return `${safeRepo}__${safeWorktree}--${shortChecksumFor(worktreeRoot)}`;
};

export const loadTmuxSessionNames = (): Set<string> => {
  const proc = Bun.spawnSync({
    cmd: ["tmux", "list-sessions", "-F", "#{session_name}"],
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  });

  if (proc.exitCode !== 0) {
    return new Set();
  }

  return new Set(
    proc.stdout
      .toString()
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
  );
};

export const hasTmuxSession = (sessionName: string) =>
  runCommandSync(["tmux", "has-session", "-t", sessionName]).success;

export const hasTmuxSessionAsync = async (sessionName: string) =>
  (await runCommand(["tmux", "has-session", "-t", sessionName])).success;

const repoRootFor = (dir: string) => {
  const result = runCommandSync([
    "git",
    "-C",
    dir,
    "rev-parse",
    "--show-toplevel",
  ]);
  return result.success ? result.stdout.trim() : dir;
};

const mainRepoRootFor = (dir: string) => {
  const result = runCommandSync([
    "git",
    "-C",
    dir,
    "rev-parse",
    "--git-common-dir",
  ]);

  if (!result.success) {
    return repoRootFor(dir);
  }

  const raw = result.stdout.trim();
  const resolved = path.isAbsolute(raw) ? raw : path.resolve(repoRootFor(dir), raw);
  return path.dirname(path.resolve(resolved));
};

const branchFor = (dir: string) => {
  const result = runCommandSync(["git", "-C", dir, "branch", "--show-current"]);
  return result.success ? result.stdout.trim() : "";
};

const displayTmuxMessage = (message: string) => {
  runCommandSync(["tmux", "display-message", message]);
};

const applyDefaultLayout = (sessionName: string, dir: string) => {
  runCommandSync([
    "tmux",
    "new-session",
    "-d",
    "-s",
    sessionName,
    "-n",
    "code",
    "-c",
    dir,
  ]);
  runCommandSync([
    "tmux",
    "split-window",
    "-h",
    "-t",
    `${sessionName}:1`,
    "-c",
    dir,
  ]);
  runCommandSync([
    "tmux",
    "select-layout",
    "-t",
    `${sessionName}:1`,
    "main-vertical",
  ]);
  runCommandSync([
    "tmux",
    "new-window",
    "-t",
    `${sessionName}:2`,
    "-n",
    "shell",
    "-c",
    dir,
  ]);
  runCommandSync(["tmux", "select-window", "-t", `${sessionName}:1`]);
};

export const createSession = (sessionName: string, dir: string) => {
  applyDefaultLayout(sessionName, dir);

  if (!fs.existsSync(layoutHookFile)) {
    return;
  }

  const repoRoot = repoRootFor(dir);
  const branch = branchFor(dir);
  const hook = Bun.spawnSync({
    cmd: ["bash", layoutHookFile],
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      TWM_SESSION_NAME: sessionName,
      TWM_WORKTREE_PATH: dir,
      TWM_REPO_ROOT: repoRoot,
      TWM_REPO_NAME: path.basename(repoRoot),
      TWM_WORKTREE_NAME: path.basename(dir),
      TWM_BRANCH: branch,
      TWM_SESSION_IS_NEW: "1",
    },
  });

  if (hook.exitCode !== 0) {
    const error =
      hook.stderr.toString().trim() ||
      hook.stdout.toString().trim() ||
      "layout hook failed";
    displayTmuxMessage(`twm: ${error}`);
  }
};

export const enterSession = (sessionName: string) => {
  if (process.env.TWM_NO_ENTER === "1") {
    return;
  }

  if (process.env.TMUX) {
    runCommandSync(["tmux", "switch-client", "-t", sessionName]);
  } else {
    runCommandSync(["tmux", "attach-session", "-t", sessionName]);
  }
};
