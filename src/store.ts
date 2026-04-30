import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { loadSources } from "./lib/sources";
import type { DialogState, Item, PreviewData, SourceEntry, ViewMode } from "./types";

type StateUpdater<T> = T | ((current: T) => T);

type TwmState = {
  view: ViewMode;
  sources: SourceEntry[];
  selectedSource: number;
  items: Item[];
  selected: number;
  message: string;
  dialog: DialogState;
  preview: PreviewData | null;
  previewPath: string;
  previewLoading: boolean;
  loading: boolean;
  previewReloadNonce: number;
  updateAvailableVersion: string | null;
};

type TwmActions = {
  setView: (next: StateUpdater<ViewMode>) => void;
  setSources: (next: StateUpdater<SourceEntry[]>) => void;
  setSelectedSource: (next: StateUpdater<number>) => void;
  setState: (next: StateUpdater<Pick<TwmState,
    | "items"
    | "selected"
    | "message"
    | "dialog"
    | "preview"
    | "previewPath"
    | "previewLoading"
    | "loading"
  >>) => void;
  setSelected: (next: StateUpdater<number>) => void;
  bumpPreviewReloadNonce: () => void;
  setUpdateAvailableVersion: (version: string | null) => void;
};

export type TwmStore = TwmState & TwmActions;

const resolveNext = <T>(next: StateUpdater<T>, current: T): T =>
  typeof next === "function" ? (next as (current: T) => T)(current) : next;

const initialAppState = {
  items: [],
  selected: 0,
  message: "",
  dialog: { kind: "none" } as DialogState,
  preview: null,
  previewPath: "",
  previewLoading: false,
  loading: true,
};

export const useTwmStore = create<TwmStore>()(
  subscribeWithSelector((set, get) => ({
    view: "worktrees",
    sources: loadSources(),
    selectedSource: 0,
    ...initialAppState,
    previewReloadNonce: 0,
    updateAvailableVersion: null,
    setView: (next) => set((state) => ({ view: resolveNext(next, state.view) })),
    setSources: (next) => set((state) => ({ sources: resolveNext(next, state.sources) })),
    setSelectedSource: (next) => set((state) => ({ selectedSource: resolveNext(next, state.selectedSource) })),
    setSelected: (next) => set((state) => ({ selected: resolveNext(next, state.selected) })),
    setState: (next) => {
      const current = get();
      const currentAppState = {
        items: current.items,
        selected: current.selected,
        message: current.message,
        dialog: current.dialog,
        preview: current.preview,
        previewPath: current.previewPath,
        previewLoading: current.previewLoading,
        loading: current.loading,
      };
      set(resolveNext(next, currentAppState));
    },
    bumpPreviewReloadNonce: () => set((state) => ({ previewReloadNonce: state.previewReloadNonce + 1 })),
    setUpdateAvailableVersion: (version) => set({ updateAvailableVersion: version }),
  })),
);
