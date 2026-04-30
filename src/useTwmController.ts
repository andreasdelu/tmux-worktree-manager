import { useCallback, useEffect, useRef } from "react";
import { shallow } from "zustand/shallow";
import {
  overwatchEnabled,
  overwatchRefreshMs,
  previewDebounceMs,
} from "./config";
import type { PreviewData, SourceEntry } from "./types";
import { loadSources } from "./lib/sources";
import { annotateItemsWithLiveState, loadItems } from "./lib/discovery";
import { startPreviewLoad } from "./lib/preview";
import { checkForUpdate } from "./lib/update";
import { useTwmStore } from "./store";

export type PreviewMetaRow = { label: string; value: string };

export type TwmController = {
  refreshItems: (message?: string, sourceEntries?: SourceEntry[]) => void;
  refreshLiveState: () => void;
  refreshPreview: (itemPath: string) => void;
};

export const useTwmController = (): TwmController => {
  const previewCacheRef = useRef(new Map<string, PreviewData>());

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const latestVersion = await checkForUpdate();

      if (!cancelled) {
        useTwmStore.getState().setUpdateAvailableVersion(latestVersion);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const refreshItems = useCallback((message = "", sourceEntries?: SourceEntry[]) => {
    const store = useTwmStore.getState();
    const items = loadItems(sourceEntries ?? store.sources);
    const nextSelected = Math.min(
      store.selected,
      Math.max(items.length - 1, 0),
    );

    store.setState((current) => ({
      ...current,
      items,
      selected: nextSelected,
      loading: false,
      message,
      preview: null,
      previewPath: items[nextSelected]?.path ?? "",
      previewLoading: items[nextSelected]?.kind === "worktree",
    }));
  }, []);

  const refreshLiveState = useCallback(() => {
    const store = useTwmStore.getState();
    store.setState((current) => ({
      ...current,
      items: annotateItemsWithLiveState(current.items),
    }));
  }, []);

  const refreshPreview = useCallback((itemPath: string) => {
    previewCacheRef.current.delete(itemPath);
    const store = useTwmStore.getState();
    store.setState((currentState) => ({
      ...currentState,
      message: "",
      preview: null,
      previewPath: itemPath,
      previewLoading: true,
    }));
    store.bumpPreviewReloadNonce();
  }, []);

  useEffect(() => {
    const nextSources = loadSources();
    const store = useTwmStore.getState();
    store.setSources(nextSources);

    if (nextSources.length === 0) {
      store.setView("sources");
      store.setState((current) => ({
        ...current,
        loading: false,
        dialog: { kind: "add-source", value: "" },
        message: "Add a repo root to get started.",
      }));
      return;
    }

    refreshItems("", nextSources);
  }, [refreshItems]);

  useEffect(() => {
    if (!overwatchEnabled) {
      return;
    }

    const interval = setInterval(() => {
      const { view, dialog } = useTwmStore.getState();
      if (view === "worktrees" && dialog.kind === "none") {
        refreshLiveState();
      }
    }, overwatchRefreshMs);

    return () => {
      clearInterval(interval);
    };
  }, [refreshLiveState]);

  useEffect(() => {
    let cancelled = false;
    let timer: Timer | null = null;
    let cancelPreviewLoad: (() => void) | null = null;

    const cleanupPreviewLoad = () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      cancelPreviewLoad?.();
      cancelPreviewLoad = null;
    };

    const runPreviewLoad = () => {
      cleanupPreviewLoad();
      cancelled = false;

      const store = useTwmStore.getState();
      if (store.view !== "worktrees") {
        return;
      }

      const current = store.items[store.selected];

      if (!current) {
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

      timer = setTimeout(() => {
        store.setState((existing) => {
          if (existing.previewPath === current.path && existing.previewLoading) {
            return existing;
          }

          return {
            ...existing,
            preview: null,
            previewPath: current.path,
            previewLoading: true,
          };
        });

        const previewLoad = startPreviewLoad(current.path);
        cancelPreviewLoad = previewLoad.cancel;

        void (async () => {
          const preview = await previewLoad.promise;

          if (cancelled || !preview) {
            return;
          }

          previewCacheRef.current.set(current.path, preview);

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
      (state) => [state.view, state.items, state.selected, state.previewReloadNonce] as const,
      runPreviewLoad,
      { equalityFn: shallow },
    );

    runPreviewLoad();

    return () => {
      unsubscribe();
      cleanupPreviewLoad();
    };
  }, []);

  return {
    refreshItems,
    refreshLiveState,
    refreshPreview,
  };
};
