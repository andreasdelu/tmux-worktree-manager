import fs from "node:fs";
import path from "node:path";
import { layoutHookFile } from "../config";
import { runCommand, runCommandSync } from "./commands";
import { associatedSessionName, parseSessionRecords, sessionListFormat, worktreeKey } from "./sessionAssociations";

const safeSessionToken = (value: string, fallback: string) =>
  value.replace(/[ /.]/g, "-").replace(/[^A-Za-z0-9_-]/g, "") || fallback;

const sessionNameCache = new Map<string, string>();
const checksumCache = new Map<string, string>();

const shortChecksumFor = (value: string) => {
  const cached = checksumCache.get(value);
  if (cached) {
    return cached;
  }

  // POSIX cksum includes the byte length in its CRC. Keep existing session names.
  let crc = 0;
  const update = (byte: number) => {
    crc = (crc ^ (byte << 24)) >>> 0;
    for (let bit = 0; bit < 8; bit++) {
      crc = ((crc << 1) ^ (crc & 0x80000000 ? 0x04c11db7 : 0)) >>> 0;
    }
  };
  const bytes = new TextEncoder().encode(value);
  for (const byte of bytes) update(byte);
  for (let length = bytes.length; length > 0; length = Math.floor(length / 256)) {
    update(length & 255);
  }
  const checksum = (~crc) >>> 0;
  const shortChecksum = checksum.toString(16).padStart(4, "0").slice(-4);
  checksumCache.set(value, shortChecksum);
  return shortChecksum;
};

export const rememberSessionName = (worktreeRoot: string, repoRoot: string, isPrimary: boolean): string => {
  const safeRepo = safeSessionToken(path.basename(repoRoot), "repo");
  const name = isPrimary
    ? safeRepo
    : `${safeRepo}__${safeSessionToken(path.basename(worktreeRoot), "worktree")}--${shortChecksumFor(worktreeRoot)}`;
  sessionNameCache.set(path.resolve(worktreeRoot), name);
  return name;
};

export const defaultSessionNameFor = (dir: string): string => {
  const cacheKey = path.resolve(dir);
  const cached = sessionNameCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const worktreeRoot = repoRootFor(dir);
  const repoRoot = mainRepoRootFor(dir);
  const safeRepo = safeSessionToken(path.basename(repoRoot), "repo");

  if (path.resolve(worktreeRoot) === path.resolve(repoRoot)) {
    sessionNameCache.set(cacheKey, safeRepo);
    return safeRepo;
  }

  const safeWorktree = safeSessionToken(path.basename(worktreeRoot), "worktree");
  const sessionName = `${safeRepo}__${safeWorktree}--${shortChecksumFor(worktreeRoot)}`;
  sessionNameCache.set(cacheKey, sessionName);
  return sessionName;
};

const checkedSessions = (result: ReturnType<typeof runCommandSync>, allowNoServer = false) => {
  if (!result.success) {
    if (allowNoServer && /no server running|No such file or directory/.test(result.stderr)) return [];
    throw new Error(result.stderr.trim() || "Could not list tmux sessions");
  }
  return parseSessionRecords(result.stdout);
};

export const sessionFor = (dir: string, allowNoServer = false) => {
  const sessions = checkedSessions(runCommandSync(["tmux", "list-sessions", "-F", sessionListFormat]), allowNoServer);
  const name = associatedSessionName(dir, defaultSessionNameFor(dir), sessions);
  return sessions.find(session => session.name === name);
};

export const sessionForAsync = async (dir: string) => {
  const sessions = checkedSessions(await runCommand(["tmux", "list-sessions", "-F", sessionListFormat]));
  const name = associatedSessionName(dir, defaultSessionNameFor(dir), sessions);
  return sessions.find(session => session.name === name);
};

export const sessionNameFor = (dir: string): string => sessionFor(dir)?.name ?? defaultSessionNameFor(dir);
export const sessionNameForAsync = async (dir: string): Promise<string> =>
  (await sessionForAsync(dir))?.name ?? defaultSessionNameFor(dir);

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

export type UnassignedSession = { id: string; name: string };

export const listUnassignedSessions = (assignedNames: string[]): UnassignedSession[] => {
  const result = runCommandSync(["tmux", "list-sessions", "-F", sessionListFormat]);
  if (!result.success) throw new Error(result.stderr.trim() || "Could not list tmux sessions");
  const assigned = new Set(assignedNames);
  return parseSessionRecords(result.stdout).filter(session => !session.worktree && !assigned.has(session.name));
};

// Adopt the existing session by identity, never by an ambiguous name prefix.
// Session-owned metadata preserves the name, panes and processes. No layout hook.
export const assignSession = (dir: string, session: UnassignedSession, assignedNames: string[]) => {
  if (!fs.statSync(dir).isDirectory()) throw new Error("Worktree directory is unavailable");
  const target = defaultSessionNameFor(dir);
  if (sessionFor(dir)) throw new Error("This checkout already has a tmux session");
  const candidate = listUnassignedSessions([...assignedNames, target]).find(item => item.id === session.id && item.name === session.name);
  if (!candidate) throw new Error("Session changed or is already assigned. Reopen the picker.");
  const result = runCommandSync(["tmux", "set-option", "-o", "-t", candidate.id, "@twm_worktree", worktreeKey(dir)]);
  if (!result.success) throw new Error(result.stderr.trim() || "Could not assign tmux session");
};

export const hasTmuxSession = (sessionName: string) =>
  checkedSessions(runCommandSync(["tmux", "list-sessions", "-F", sessionListFormat])).some(session => session.name === sessionName);

export const hasTmuxSessionAsync = async (sessionName: string) =>
  checkedSessions(await runCommand(["tmux", "list-sessions", "-F", sessionListFormat])).some(session => session.name === sessionName);

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
  return runCommandSync([
    "tmux",
    "new-session",
    "-d",
    "-P",
    "-F",
    "#{session_id}",
    "-s",
    sessionName,
    "-c",
    dir,
  ]);
};

export const createSession = (sessionName: string, dir: string) => {
  const created = applyDefaultLayout(sessionName, dir);
  if (!created.success) throw new Error(created.stderr.trim() || "Could not create tmux session");
  const sessionId = created.stdout.trim();
  if (!/^\$\d+$/.test(sessionId)) throw new Error("Could not identify new tmux session");
  const tagged = runCommandSync(["tmux", "set-option", "-t", sessionId, "@twm_worktree", worktreeKey(dir)]);
  if (!tagged.success) throw new Error(tagged.stderr.trim() || "Could not associate new tmux session");

  if (!fs.existsSync(layoutHookFile)) {
    return sessionId;
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
      TWM_SESSION_ID: sessionId,
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
  return sessionId;
};

export const ensureSessionFor = (dir: string): string =>
  sessionFor(dir, true)?.id ?? createSession(defaultSessionNameFor(dir), dir);

export const enterSession = (sessionId: string) => {
  if (!/^\$\d+$/.test(sessionId)) throw new Error("Invalid tmux session identity");
  if (process.env.TWM_NO_ENTER === "1") {
    return;
  }

  if (process.env.TMUX) {
    const result = runCommandSync(["tmux", "switch-client",
      ...(process.env.TWM_ORIGIN_CLIENT ? ["-c", process.env.TWM_ORIGIN_CLIENT] : []), "-t", sessionId]);
    if (!result.success) throw new Error("Could not switch tmux client");
  } else {
    const result = runCommandSync(["tmux", "attach-session", "-t", sessionId]);
    if (!result.success) throw new Error("Could not attach tmux session");
  }
};
