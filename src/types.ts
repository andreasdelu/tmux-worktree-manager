export type Item = {
  group: string;
  path: string;
  name: string;
  hasSession: boolean;
};

export type ActionMode = "none" | "kill" | "remove";
export type ViewMode = "worktrees" | "sources";

export type SourceEntry = {
  raw: string;
  path: string;
  resolvedPath: string;
  exists: boolean;
  valid: boolean;
  issue: string;
};

export type AppState = {
  items: Item[];
  selected: number;
  message: string;
  confirming: ActionMode;
  creating: boolean;
  createName: string;
  actionLoading: boolean;
  actionLabel: string;
  preview: string;
  previewPath: string;
  previewLoading: boolean;
  loading: boolean;
};
