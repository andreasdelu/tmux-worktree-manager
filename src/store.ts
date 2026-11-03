import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type { PullRequestsState } from "./lib/pullRequests";
import type { DialogState, Item, PreviewData, SourceEntry, ViewMode } from "./types";
import { readStartupCache } from "./lib/startupCache";
import { readCloseOnOpen } from "./lib/preferences";

export const initialStartupCache = readStartupCache();

type StateUpdater<T> = T | ((current: T) => T);

type TwmState = {
  view: ViewMode;
  removingPaths: string[];
  closeOnOpen: boolean;
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
  syncing: boolean;
  cachedList: boolean;
  cachedPreviewPaths: string[];
  cachedPrRoots: string[];
  previewReloadNonce: number;
  detailsScroll: number;
  updateAvailableVersion: string | null;
  pullRequests: Record<string, PullRequestsState>;
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
  setDetailsScroll: (next: StateUpdater<number>) => void;
  bumpPreviewReloadNonce: () => void;
  setUpdateAvailableVersion: (version: string | null) => void;
  setPullRequests: (repoRoot: string, state: PullRequestsState) => void;
};

export type TwmStore = TwmState & TwmActions;

const resolveNext = <T>(next: StateUpdater<T>, current: T): T =>
  typeof next === "function" ? (next as (current: T) => T)(current) : next;

const initialAppState = {
  items: initialStartupCache?.items ?? [],
  selected: 0,
  message: "",
  dialog: { kind: "none" } as DialogState,
  preview: initialStartupCache?.previews[initialStartupCache.items[0]?.path ?? ""] ?? null,
  previewPath: initialStartupCache?.items[0]?.path ?? "",
  previewLoading: false,
  loading: !initialStartupCache?.items.length,
};

export const useTwmStore = create<TwmStore>()(
  subscribeWithSelector((set, get) => ({
    view: "worktrees",
    removingPaths: [],
    closeOnOpen: readCloseOnOpen(),
    sources: [],
    selectedSource: 0,
    ...initialAppState,
    previewReloadNonce: 0,
    detailsScroll: 0,
    updateAvailableVersion: null,
    syncing: true,
    cachedList: !!initialStartupCache?.items.length,
    cachedPreviewPaths: Object.keys(initialStartupCache?.previews ?? {}),
    cachedPrRoots: Object.keys(initialStartupCache?.pullRequests ?? {}),
    pullRequests: initialStartupCache?.pullRequests ?? {},
    setPullRequests: (repoRoot, result) => set(state => ({ pullRequests: { ...state.pullRequests, [repoRoot]: result } })),
    setView: (next) => set((state) => ({ view: resolveNext(next, state.view) })),
    setSources: (next) => set((state) => ({ sources: resolveNext(next, state.sources) })),
    setSelectedSource: (next) => set((state) => ({ selectedSource: resolveNext(next, state.selectedSource) })),
    setSelected: (next) => set((state) => ({ selected: resolveNext(next, state.selected) })),
    setDetailsScroll: (next) => set(state => ({ detailsScroll: Math.max(0, resolveNext(next, state.detailsScroll)) })),
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
