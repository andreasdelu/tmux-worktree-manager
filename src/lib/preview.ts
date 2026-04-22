import path from "node:path";
import { formatPath } from "./sources";
import { runCommand, startTextCommand } from "./commands";
import { sessionNameFor } from "./session";

const parseBranchInfoLine = (line: string) => {
  if (!line) {
    return { branch: "", base: "", divergence: "" };
  }

  if (line === "HEAD (no branch)") {
    return { branch: "detached", base: "", divergence: "" };
  }

  const divergenceMatch = line.match(/^(.*)\s(\[[^\]]+\])$/);
  const head = divergenceMatch?.[1] ?? line;
  const divergence = divergenceMatch?.[2] ?? "";

  if (head.includes("...")) {
    const [branch, base] = head.split("...", 2);
    return { branch, base: base ?? "", divergence };
  }

  return { branch: head, base: "", divergence };
};

const repoNameForDir = async (dir: string, processes?: Subprocess[]) => {
  const command = startTextCommand(
    ["git", "-C", dir, "rev-parse", "--git-common-dir"],
    processes,
  );
  const { stdout, exitCode } = await command.promise;

  if (exitCode !== 0) {
    return path.basename(dir);
  }

  const raw = stdout.trim() || ".git";
  const commonDir = path.isAbsolute(raw) ? raw : path.resolve(dir, raw);
  const normalized = path.resolve(commonDir);

  if (path.basename(normalized) === ".git") {
    return path.basename(path.dirname(normalized));
  }

  return path.basename(normalized);
};

const sessionStateForDir = async (dir: string, processes?: Subprocess[]) => {
  const sessionName = sessionNameFor(dir);
  const hasSession = startTextCommand(
    ["tmux", "has-session", "-t", sessionName],
    processes,
  );
  const hasSessionResult = await hasSession.promise;

  if (hasSessionResult.exitCode !== 0) {
    return "";
  }

  const listClients = startTextCommand(
    ["tmux", "list-clients", "-F", "#{session_name}"],
    processes,
  );
  const listClientsResult = await listClients.promise;

  if (
    listClientsResult.exitCode === 0 &&
    listClientsResult.stdout
      .split("\n")
      .map((line) => line.trim())
      .includes(sessionName)
  ) {
    return "attached";
  }

  return "existing session";
};

const buildPreviewText = async (dir: string, processes?: Subprocess[]) => {
  const statusCommand = startTextCommand(
    ["git", "-C", dir, "status", "--short", "--branch"],
    processes,
  );
  const lastCommitCommand = startTextCommand(
    ["git", "-C", dir, "log", "-1", "--pretty=format:%h %s"],
    processes,
  );
  const [repoName, sessionState, statusResult, lastCommitResult] =
    await Promise.all([
      repoNameForDir(dir, processes),
      sessionStateForDir(dir, processes),
      statusCommand.promise,
      lastCommitCommand.promise,
    ]);

  const statusLines = statusResult.exitCode === 0
    ? statusResult.stdout.split("\n").filter((line) => line.length > 0)
    : [];
  const header = statusLines[0]?.startsWith("## ")
    ? statusLines[0].slice(3)
    : "";
  const changeLines = header ? statusLines.slice(1) : statusLines;
  const { branch, base, divergence } = parseBranchInfoLine(header);
  const worktreeName = path.basename(dir);
  const lastCommit =
    lastCommitResult.exitCode === 0 ? lastCommitResult.stdout.trim() : "";
  const dirtySummary =
    changeLines.length === 0 ? "clean" : `${changeLines.length} changes`;
  const lines = [`${repoName}  ${worktreeName}`, formatPath(dir), ""];

  if (branch) {
    lines.push(`  Branch  ${branch}`);
  }

  if (base) {
    lines.push(`  Base    ${base}`);
  }

  if (divergence) {
    lines.push(`  Track   ${divergence}`);
  }

  lines.push(`  Status  ${dirtySummary}`);

  if (sessionState) {
    lines.push(`  Tmux    ${sessionState}`);
  }

  if (lastCommit) {
    lines.push(`  Last    ${lastCommit}`);
  }

  if (changeLines.length > 0) {
    lines.push("", ...changeLines);
  }

  return lines.join("\n").trimEnd();
};

export const startPreviewLoad = (itemPath: string) => {
  let cancelled = false;
  const processes: Subprocess[] = [];

  return {
    promise: (async () => {
      const preview = await buildPreviewText(itemPath, processes);
      return cancelled ? "" : preview;
    })(),
    cancel: () => {
      cancelled = true;
      for (const proc of processes) {
        try {
          proc.kill();
        } catch {
          // ignore race with already-exited preview process
        }
      }
    },
  };
};
