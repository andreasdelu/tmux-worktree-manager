import { useCallback, useEffect, useRef } from "react";
import { shallow } from "zustand/shallow";
import {
  liveRefreshMs,
  previewDebounceMs,
} from "./config";
import type { PreviewData, SourceEntry } from "./types";
import { loadSources } from "./lib/sources";
import { annotateItemsWithLiveState, loadItems } from "./lib/discovery";
import { startPreviewLoad } from "./lib/preview";
import { checkForUpdate } from "./lib/update";
import { loadPullRequests, cancelPullRequestLoads } from "./lib/pullRequests";
import { initialStartupCache, useTwmStore } from "./store";
import { getSourcesKey, writeStartupCache } from "./lib/startupCache";

export type PreviewMetaRow = { label: string; value: string };

export type TwmController = {
  refreshItems: (message?: string, sourceEntries?: SourceEntry[]) => Promise<boolean>;
  refreshLiveState: () => Promise<void>;
  refreshPreview: (itemPath: string) => void;
};

export const useTwmController = (): TwmController => {
  const previewCacheRef = useRef(new Map<string, PreviewData>());
  const displayedPreviews = useRef(new Map<string, PreviewData>(Object.entries(initialStartupCache?.previews ?? {})));
  const snapshotKey = useRef(initialStartupCache?.sourcesKey ?? "");
  const mounted = useRef(true);
  const applyPullRequests = useCallback((repoRoot: string, result: Awaited<ReturnType<typeof loadPullRequests>>) => {
    const store = useTwmStore.getState();
    if (!mounted.current || !store.items.some(item => item.repoRoot === repoRoot)) return;
    store.setPullRequests(repoRoot, result);
    useTwmStore.setState(state => ({ cachedPrRoots: state.cachedPrRoots.filter(repo => repo !== repoRoot) }));
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const save = () => {
      const store = useTwmStore.getState();
      if (!store.loading && !store.syncing && snapshotKey.current === getSourcesKey()) {
        writeStartupCache(store.items, displayedPreviews.current, store.pullRequests, undefined, snapshotKey.current);
      }
    };
    const unsubscribe = useTwmStore.subscribe(state => [state.items, state.preview, state.pullRequests, state.syncing] as const,
      () => { clearTimeout(timer); timer = setTimeout(save, 200); }, { equalityFn: shallow });
    return () => { unsubscribe(); clearTimeout(timer); save(); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    mounted.current = true;

    void (async () => {
      const latestVersion = await checkForUpdate();

      if (!cancelled) {
        useTwmStore.getState().setUpdateAvailableVersion(latestVersion);
      }
    })();

    return () => {
      cancelled = true;
      mounted.current = false;
      cancelPullRequestLoads();
    };
  }, []);

  const refreshGeneration = useRef(0);
  const liveGeneration = useRef(0);
  const refreshItems = useCallback(async (message = "", sourceEntries?: SourceEntry[]) => {
    const generation = ++refreshGeneration.current;
    const expectedNonce = useTwmStore.getState().previewReloadNonce;
    const key = getSourcesKey();
    useTwmStore.setState({ syncing: true, cachedPreviewPaths: [...displayedPreviews.current.keys()] });
    const sources = sourceEntries ?? await loadSources();
    let items;
    try { items = await loadItems(sources, true); }
    catch {
      if (generation === refreshGeneration.current && useTwmStore.getState().previewReloadNonce === expectedNonce) {
        useTwmStore.setState({ syncing: false, loading: false, cachedList: true,
          message: "Could not discover Git worktrees. Press r to retry; actions wait for fresh state." });
      }
      return false;
    }
    if (generation !== refreshGeneration.current) return false;
    if (useTwmStore.getState().previewReloadNonce !== expectedNonce) { useTwmStore.setState({ syncing: false }); return false; }
    if (key !== getSourcesKey()) return refreshItems(message);
    snapshotKey.current = key;
    previewCacheRef.current.clear();
    const store = useTwmStore.getState();
    store.setSources(sources);
    const oldPath = store.items[store.selected]?.path;
    const selectedByPath = items.findIndex(item => item.path === oldPath);
    const nextSelected = selectedByPath >= 0 ? selectedByPath : Math.min(store.selected, Math.max(items.length - 1, 0));
    const noSources = !sources.some(source => source.valid);
    if (noSources) { store.setView("sources"); displayedPreviews.current.clear(); }

    const dialogTarget = store.dialog.kind === "confirm" ? store.dialog.targetPath
      : store.dialog.kind === "create" ? store.dialog.sourcePath : undefined;
    store.setState((current) => ({
      ...current,
      items,
      selected: nextSelected,
      loading: false,
      message: noSources ? "Add a repo root to get started." : message,
      dialog: noSources ? { kind: "add-source", value: "" }
        : dialogTarget && !items.some(item => item.path === dialogTarget) ? { kind: "none" } : current.dialog,
      preview: current.preview?.path === items[nextSelected]?.path ? current.preview : null,
      previewPath: items[nextSelected]?.path ?? "",
      previewLoading: !current.preview && items[nextSelected]?.kind === "worktree" && items[nextSelected]?.available,
    }));
    useTwmStore.setState(state => ({ syncing: false, cachedList: false,
      cachedPreviewPaths: state.cachedPreviewPaths.filter(itemPath => items.some(item => item.path === itemPath)),
      cachedPrRoots: state.cachedPrRoots.filter(repo => items.some(item => item.repoRoot === repo)),
      pullRequests: Object.fromEntries(Object.entries(state.pullRequests).filter(([repo]) => items.some(item => item.repoRoot === repo))) }));
    store.bumpPreviewReloadNonce();
    const messagePath = items[nextSelected]?.path;
    const liveRequest = ++liveGeneration.current;
    void annotateItemsWithLiveState(items, messagePath).then(liveItems => {
      if (mounted.current && liveRequest === liveGeneration.current && useTwmStore.getState().items === items && useTwmStore.getState().items[useTwmStore.getState().selected]?.path === messagePath) store.setState(current => ({ ...current, items: liveItems }));
    });
    return true;
  }, []);

  const refreshLiveState = useCallback(async () => {
    const request = ++liveGeneration.current;
    const snapshot = useTwmStore.getState().items;
    const messagePath = snapshot[useTwmStore.getState().selected]?.path;
    const items = await annotateItemsWithLiveState(snapshot, messagePath);
    const store = useTwmStore.getState();
    if (!mounted.current || request !== liveGeneration.current || store.items !== snapshot || store.items[store.selected]?.path !== messagePath) return;
    store.setState(current => ({ ...current, items }));
  }, []);

  useEffect(() => useTwmStore.subscribe(state => state.items[state.selected]?.path,
    () => { if (!useTwmStore.getState().syncing) void refreshLiveState(); }), [refreshLiveState]);

  const refreshPreview = useCallback((itemPath: string) => {
    previewCacheRef.current.delete(itemPath);
    const item = useTwmStore.getState().items.find(item => item.path === itemPath);
    if (item) {
      useTwmStore.getState().setPullRequests(item.repoRoot, { status: "loading" });
      void loadPullRequests(item.repoRoot, { refresh: true }).then(result => applyPullRequests(item.repoRoot, result));
    }
    const store = useTwmStore.getState();
    store.setState((currentState) => ({
      ...currentState,
      message: "",
      preview: null,
      previewPath: itemPath,
      previewLoading: true,
    }));
    store.bumpPreviewReloadNonce();
  }, [applyPullRequests]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const key = getSourcesKey();
      const nextSources = await loadSources();
      if (cancelled) return;
      if (key !== getSourcesKey()) { await refreshItems(); return; }
      const store = useTwmStore.getState();
      store.setSources(nextSources);
      if (!nextSources.some(source => source.valid)) {
        store.setView("sources");
        useTwmStore.setState({ syncing: false, cachedList: false, cachedPreviewPaths: [], cachedPrRoots: [], pullRequests: {} });
        displayedPreviews.current.clear();
        snapshotKey.current = getSourcesKey();
        store.setState(current => ({ ...current, items: [], preview: null, loading: false,
          dialog: { kind: "add-source", value: "" }, message: "Add a repo root to get started." }));
        return;
      }
      await refreshItems("", nextSources);
    })();
    return () => { cancelled = true; refreshGeneration.current++; };
  }, [refreshItems]);

  useEffect(() => {
    let polling = false;
    const interval = setInterval(() => {
      const { view, dialog } = useTwmStore.getState();
      if (!polling && view === "worktrees" && dialog.kind === "none") {
        polling = true;
        void refreshLiveState().finally(() => { polling = false; });
      }
    }, liveRefreshMs);

    return () => {
      clearInterval(interval);
    };
  }, [refreshLiveState]);

  useEffect(() => {
    let request: { cancelled: boolean } | null = null;
    let timer: Timer | null = null;
    let cancelPreviewLoad: (() => void) | null = null;
    let lastReloadNonce = useTwmStore.getState().previewReloadNonce;

    const cleanupPreviewLoad = () => {
      if (request) request.cancelled = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      cancelPreviewLoad?.();
      cancelPreviewLoad = null;
    };

    const runPreviewLoad = () => {
      cleanupPreviewLoad();
      const currentRequest = { cancelled: false };
      request = currentRequest;

      const store = useTwmStore.getState();
      if (store.previewReloadNonce !== lastReloadNonce) {
        previewCacheRef.current.clear();
        lastReloadNonce = store.previewReloadNonce;
      }
      if (store.view !== "worktrees") return;
      if (store.syncing) {
        const selected = store.items[store.selected];
        const cached = displayedPreviews.current.get(selected?.path ?? "");
        store.setState(state => ({ ...state, preview: cached ?? null,
          previewPath: selected?.path ?? "", previewLoading: !!selected && !cached }));
        return;
      }

      const current = store.items[store.selected];

      if (!current || !current.available) {
        store.setState((existing) => ({
          ...existing,
          preview: null,
          previewPath: "",
          previewLoading: false,
        }));
        return;
      }

      if (current.kind === "source-empty") {
        store.setState((existing) => ({
          ...existing,
          preview: null,
          previewPath: current.path,
          previewLoading: false,
        }));
        return;
      }

      if (!store.pullRequests[current.repoRoot]) store.setPullRequests(current.repoRoot, { status: "loading" });
      void loadPullRequests(current.repoRoot).then(result => applyPullRequests(current.repoRoot, result));

      const cachedPreview = previewCacheRef.current.get(current.path);
      if (cachedPreview) {
        store.setState((existing) => ({
          ...existing,
          preview: cachedPreview,
          previewPath: current.path,
          previewLoading: false,
        }));
        return;
      }

      const cached = displayedPreviews.current.get(current.path);
      if (cached) useTwmStore.setState(state => ({ cachedPreviewPaths: [...new Set([...state.cachedPreviewPaths, current.path])] }));
      store.setState(existing => ({ ...existing, preview: cached ?? null, previewPath: current.path, previewLoading: !cached }));
      timer = setTimeout(() => {
        const previewLoad = startPreviewLoad(current.path);
        cancelPreviewLoad = previewLoad.cancel;

        void (async () => {
          const preview = await previewLoad.promise;

          if (currentRequest.cancelled || !preview) {
            return;
          }

          previewCacheRef.current.set(current.path, preview);
          displayedPreviews.current.set(current.path, preview);
          useTwmStore.setState(state => ({ cachedPreviewPaths: state.cachedPreviewPaths.filter(itemPath => itemPath !== current.path) }));

          useTwmStore.getState().setState((existing) => {
            if (existing.previewPath !== current.path) {
              return existing;
            }

            return {
              ...existing,
              preview,
              previewLoading: false,
            };
          });
        })();
      }, previewDebounceMs);
    };

    const unsubscribe = useTwmStore.subscribe(
      (state) => [state.syncing, state.view, state.items[state.selected]?.path, state.items[state.selected]?.available, state.previewReloadNonce] as const,
      runPreviewLoad,
      { equalityFn: shallow },
    );

    runPreviewLoad();

    return () => {
      unsubscribe();
      cleanupPreviewLoad();
    };
  }, [applyPullRequests]);

  return {
    refreshItems,
    refreshLiveState,
    refreshPreview,
  };
};
