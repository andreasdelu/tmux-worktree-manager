import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { overwatchDir, overwatchEnabled, overwatchStaleMs } from "../config";
import type {
  OverwatchAgentState,
  OverwatchMatch,
  OverwatchStatus,
} from "../types";

const agentsDir = path.join(overwatchDir, "agents");

const normalizePath = (value: string): string => {
  if (!value) {
    return "";
  }

  const expanded = value === "~"
    ? os.homedir()
    : value.startsWith("~/")
      ? path.join(os.homedir(), value.slice(2))
      : value;

  try {
    return fs.realpathSync(expanded);
  } catch {
    return path.resolve(expanded);
  }
};

const toIso = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value : undefined;

const toNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  return undefined;
};

const computeStatus = (
  rawStatus: unknown,
  heartbeatAgeMs: number,
): OverwatchStatus => {
  const status = typeof rawStatus === "string" ? rawStatus : "offline";

  if (status === "working" && heartbeatAgeMs > overwatchStaleMs) {
    return "stale";
  }

  switch (status) {
    case "idle":
    case "working":
    case "done":
    case "error":
    case "offline":
      return status;
    default:
      return "offline";
  }
};

const runtimeMsFor = (
  status: OverwatchStatus,
  startedAt?: string,
  finishedAt?: string,
) => {
  if (!startedAt) {
    return undefined;
  }

  const started = new Date(startedAt).getTime();
  if (!Number.isFinite(started)) {
    return undefined;
  }

  if (status === "working" || status === "stale") {
    return Math.max(0, Date.now() - started);
  }

  if (!finishedAt) {
    return undefined;
  }

  const finished = new Date(finishedAt).getTime();
  if (!Number.isFinite(finished)) {
    return undefined;
  }

  return Math.max(0, finished - started);
};

const identityFor = (agent: {
  cwd: string;
  projectName?: string;
  sessionName?: string;
  tmux?: { sessionName?: string };
}) =>
  agent.tmux?.sessionName ||
  agent.sessionName ||
  agent.projectName ||
  path.basename(agent.cwd || "agent");

const parseAgentFile = (filePath: string): OverwatchAgentState | null => {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, unknown>;
    const cwd = normalizePath(typeof raw.cwd === "string" ? raw.cwd : "");
    const lastHeartbeatAt = toIso(raw.lastHeartbeatAt);
    const heartbeatTimestamp = lastHeartbeatAt
      ? new Date(lastHeartbeatAt).getTime()
      : Number.NaN;
    const heartbeatAgeMs = Number.isFinite(heartbeatTimestamp)
      ? Math.max(0, Date.now() - heartbeatTimestamp)
      : Number.POSITIVE_INFINITY;
    const status = computeStatus(raw.status, heartbeatAgeMs);

    return {
      agentId:
        typeof raw.agentId === "string" && raw.agentId.trim().length > 0
          ? raw.agentId
          : path.basename(filePath, ".json"),
      cwd,
      sessionName: typeof raw.sessionName === "string" ? raw.sessionName : undefined,
      status,
      phase: typeof raw.phase === "string" ? raw.phase : "waiting",
      toolName: typeof raw.toolName === "string" ? raw.toolName : undefined,
      summary: typeof raw.summary === "string" ? raw.summary : undefined,
      startedAt: toIso(raw.startedAt),
      finishedAt: toIso(raw.finishedAt),
      updatedAt: toIso(raw.updatedAt),
      lastHeartbeatAt,
      heartbeatAgeMs,
      runtimeMs: runtimeMsFor(
        status,
        toIso(raw.startedAt),
        toIso(raw.finishedAt),
      ),
      queue: {
        steering: toNumber((raw.queue as Record<string, unknown> | undefined)?.steering) ?? 0,
        followUp: toNumber((raw.queue as Record<string, unknown> | undefined)?.followUp) ?? 0,
      },
      tmux:
        raw.tmux && typeof raw.tmux === "object"
          ? {
              sessionName:
                typeof (raw.tmux as Record<string, unknown>).sessionName === "string"
                  ? (raw.tmux as Record<string, unknown>).sessionName as string
                  : undefined,
              windowIndex:
                typeof (raw.tmux as Record<string, unknown>).windowIndex === "string"
                  ? (raw.tmux as Record<string, unknown>).windowIndex as string
                  : undefined,
              paneIndex:
                typeof (raw.tmux as Record<string, unknown>).paneIndex === "string"
                  ? (raw.tmux as Record<string, unknown>).paneIndex as string
                  : undefined,
              paneId:
                typeof (raw.tmux as Record<string, unknown>).paneId === "string"
                  ? (raw.tmux as Record<string, unknown>).paneId as string
                  : undefined,
            }
          : undefined,
      identity: identityFor({
        cwd,
        projectName: typeof raw.projectName === "string" ? raw.projectName : undefined,
        sessionName: typeof raw.sessionName === "string" ? raw.sessionName : undefined,
        tmux:
          raw.tmux && typeof raw.tmux === "object"
            ? {
                sessionName:
                  typeof (raw.tmux as Record<string, unknown>).sessionName === "string"
                    ? (raw.tmux as Record<string, unknown>).sessionName as string
                    : undefined,
              }
            : undefined,
      }),
    };
  } catch {
    return null;
  }
};

export const loadOverwatchAgents = (): OverwatchAgentState[] => {
  if (!overwatchEnabled || !fs.existsSync(agentsDir)) {
    return [];
  }

  try {
    return fs
      .readdirSync(agentsDir)
      .filter((file) => file.endsWith(".json"))
      .map((file) => parseAgentFile(path.join(agentsDir, file)))
      .filter((agent): agent is OverwatchAgentState => agent !== null);
  } catch {
    return [];
  }
};

const updatedAtValue = (agent: OverwatchAgentState) => {
  if (!agent.updatedAt) {
    return 0;
  }

  const value = new Date(agent.updatedAt).getTime();
  return Number.isFinite(value) ? value : 0;
};

export const sortOverwatchAgents = (
  agents: OverwatchAgentState[],
): OverwatchAgentState[] =>
  [...agents].sort((left, right) => {
    const leftOffline = left.status === "offline";
    const rightOffline = right.status === "offline";

    if (leftOffline !== rightOffline) {
      return leftOffline ? 1 : -1;
    }

    return updatedAtValue(right) - updatedAtValue(left);
  });

export const matchOverwatchAgent = (
  itemPath: string,
  sessionName: string,
  agents: OverwatchAgentState[],
): OverwatchMatch | undefined => {
  if (!overwatchEnabled || agents.length === 0) {
    return undefined;
  }

  const normalizedItemPath = normalizePath(itemPath);
  const cwdMatches = agents.filter((agent) => agent.cwd === normalizedItemPath);

  if (cwdMatches.length === 1) {
    return { kind: "single", matchedBy: "cwd", agent: cwdMatches[0] };
  }

  if (cwdMatches.length > 1) {
    return { kind: "multi", matchedBy: "cwd", agents: cwdMatches };
  }

  const tmuxMatches = agents.filter(
    (agent) => agent.tmux?.sessionName && agent.tmux.sessionName === sessionName,
  );

  if (tmuxMatches.length === 1) {
    return { kind: "single", matchedBy: "tmux", agent: tmuxMatches[0] };
  }

  if (tmuxMatches.length > 1) {
    return { kind: "multi", matchedBy: "tmux", agents: tmuxMatches };
  }

  return undefined;
};

export const formatOverwatchAge = (ms: number): string => {
  if (!Number.isFinite(ms)) {
    return "--";
  }

  const seconds = Math.max(0, Math.floor(ms / 1000));

  if (seconds < 60) {
    return `${seconds}s ago`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m ${String(remainder).padStart(2, "0")}s ago`;
};

export const formatOverwatchDuration = (ms?: number): string => {
  if (ms === undefined || !Number.isFinite(ms) || ms < 0) {
    return "--:--";
  }

  const total = Math.floor(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  return hours > 0
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};
