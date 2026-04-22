import { startTextCommand } from "./commands";
import { sessionNameFor } from "./session";
import type { PreviewData } from "../types";

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

const buildPreviewData = async (
  dir: string,
  processes?: Subprocess[],
): Promise<PreviewData> => {
  const statusCommand = startTextCommand(
    ["git", "-C", dir, "status", "--short", "--branch"],
    processes,
  );
  const lastCommitCommand = startTextCommand(
    ["git", "-C", dir, "log", "-1", "--pretty=format:%h %s"],
    processes,
  );
  const [sessionState, statusResult, lastCommitResult] = await Promise.all([
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
  const changes = header ? statusLines.slice(1) : statusLines;
  const { branch, base, divergence } = parseBranchInfoLine(header);

  return {
    path: dir,
    branch,
    base,
    track: divergence,
    status: changes.length === 0 ? "clean" : `${changes.length} changes`,
    tmux: sessionState,
    last: lastCommitResult.exitCode === 0 ? lastCommitResult.stdout.trim() : "",
    changes,
  };
};

export const startPreviewLoad = (itemPath: string) => {
  let cancelled = false;
  const processes: Subprocess[] = [];

  return {
    promise: (async () => {
      const preview = await buildPreviewData(itemPath, processes);
      return cancelled ? null : preview;
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
