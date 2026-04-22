export type ItemKind = "worktree" | "source-empty";

export type Item = {
  kind: ItemKind;
  group: string;
  path: string;
  name: string;
  hasSession: boolean;
};

export type ActionMode = "kill" | "remove";
export type ViewMode = "worktrees" | "sources";

export type DialogState =
  | { kind: "none" }
  | { kind: "add-source"; value: string }
  | { kind: "create"; value: string }
  | { kind: "confirm"; mode: ActionMode }
  | { kind: "running"; label: string };

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
  dialog: DialogState;
  preview: string;
  previewPath: string;
  previewLoading: boolean;
  loading: boolean;
};
