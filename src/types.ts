export type ItemKind = "worktree" | "source-empty";

export type OverwatchStatus =
  | "idle"
  | "working"
  | "done"
  | "error"
  | "offline"
  | "stale";

export type OverwatchAgentState = {
  agentId: string;
  cwd: string;
  sessionName?: string;
  status: OverwatchStatus;
  phase: string;
  toolName?: string;
  summary?: string;
  startedAt?: string;
  finishedAt?: string;
  updatedAt?: string;
  lastHeartbeatAt?: string;
  heartbeatAgeMs: number;
  runtimeMs?: number;
  queue: {
    steering: number;
    followUp: number;
  };
  tmux?: {
    sessionName?: string;
    windowIndex?: string;
    paneIndex?: string;
    paneId?: string;
  };
  identity: string;
};

export type OverwatchMatch =
  | {
      kind: "single";
      matchedBy: "cwd" | "tmux";
      agent: OverwatchAgentState;
    }
  | {
      kind: "multi";
      matchedBy: "cwd" | "tmux";
      agents: OverwatchAgentState[];
    };

export type Item = {
  kind: ItemKind;
  group: string;
  path: string;
  name: string;
  isPrimary: boolean;
  hasSession: boolean;
  overwatch?: OverwatchMatch;
};

export type ActionMode = "kill" | "remove";
export type ViewMode = "worktrees" | "sources";

export type DialogState =
  | { kind: "none" }
  | { kind: "add-source"; value: string }
  | { kind: "create"; value: string }
  | { kind: "confirm"; mode: ActionMode }
  | { kind: "notice"; title: string; message: string }
  | { kind: "running"; label: string };

export type SourceEntry = {
  raw: string;
  path: string;
  resolvedPath: string;
  exists: boolean;
  valid: boolean;
  issue: string;
};

export type PreviewData = {
  path: string;
  branch: string;
  base: string;
  track: string;
  status: string;
  tmux: string;
  last: string;
  changes: string[];
};

export type AppState = {
  items: Item[];
  selected: number;
  message: string;
  dialog: DialogState;
  preview: PreviewData | null;
  previewPath: string;
  previewLoading: boolean;
  loading: boolean;
};
