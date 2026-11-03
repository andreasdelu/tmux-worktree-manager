export type ItemKind = "worktree" | "source-empty";
export type AgentReport = {
  pid: number;
  heartbeat: number;
  state: "working" | "thinking" | "responding" | "tool" | "needs-input" | "idle" | "done" | "error" | "stopped";
  toolCount: number;
  tools?: string[];
  startedAt?: number;
  finishedAt?: number;
};
export type AgentPane = {
  sessionId: string;
  paneId: string;
  windowIndex: string;
  paneIndex: string;
  dead: boolean;
  report?: AgentReport;
  messages?: { human: string; agent: string; heartbeat: number };
  children?: { state: "unknown" | "active" | "inactive"; heartbeat: number };
  cwd: string;
};
export type Item = {
  kind: ItemKind;
  group: string;
  path: string;
  name: string;
  isPrimary: boolean;
  hasSession: boolean;
  isCurrentSession?: boolean;
  repoRoot: string;
  createRoot: string;
  branch: string;
  sessionName: string;
  available: boolean;
  locked: boolean;
  agentPanes?: AgentPane[];
  agentUnavailable?: boolean;
};
export type ActionMode = "kill" | "remove";
export type ViewMode = "worktrees" | "sources";
export type CreateSessionMode = "none" | "create" | "open";
export type CreateField = "worktreeName" | "branchName" | "baseRef" | "createSession" | "openSession";
export type DialogState =
  | { kind: "none" }
  | { kind: "add-source"; value: string; cursor?: number }
  | { kind: "assign"; targetPath: string; sessions: { id: string; name: string }[]; selected: number }
  | { kind: "create"; sourcePath: string; worktreeName: string; branchName: string; baseRef: string;
      field: CreateField; sessionMode: CreateSessionMode; cursor?: number }
  | { kind: "confirm"; mode: ActionMode; targetPath: string; targetName: string }
  | { kind: "notice"; title: string; message: string }
  | { kind: "running"; label: string };
export type SourceEntry = {
  raw: string;
  path: string;
  resolvedPath: string;
  exists: boolean;
  valid: boolean;
  issue: string;
  commonDir?: string;
  isPrimary?: boolean;
};
export type PreviewData = {
  path: string;
  branch: string;
  base: string;
  track: string;
  status: string;
  ancestry: string;
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
