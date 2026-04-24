import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  loadingFrames,
  overwatchEnabled,
  overwatchRefreshMs,
  previewDebounceMs,
} from "./config";
import type { AppState, PreviewData, SourceEntry, ViewMode } from "./types";
import { loadSources, formatPath } from "./lib/sources";
import { annotateItemsWithLiveState, loadItems } from "./lib/discovery";
import { startPreviewLoad } from "./lib/preview";
import { suggestedCreateTargetDir } from "./lib/actions";

export type PreviewMetaRow = { label: string; value: string };

export type TwmController = {
  view: ViewMode;
  setView: Dispatch<SetStateAction<ViewMode>>;
  sources: SourceEntry[];
  setSources: Dispatch<SetStateAction<SourceEntry[]>>;
  selectedSource: number;
  setSelectedSource: Dispatch<SetStateAction<number>>;
  state: AppState;
  setState: Dispatch<SetStateAction<AppState>>;
  refreshItems: (message?: string, sourceEntries?: SourceEntry[]) => void;
  refreshLiveState: () => void;
  refreshPreview: (itemPath: string) => void;
  visible: { start: number; end: number; rows: AppState["items"] };
  currentSource?: SourceEntry;
  current?: AppState["items"][number];
  createTargetPath: string;
  loadingGlyph: string;
  previewPath: string;
  showPreviewLoading: boolean;
  previewMetaRows: PreviewMetaRow[];
  previewChanges: string[];
  hiddenPreviewChanges: number;
};

export const useTwmController = (listRowsTarget: number): TwmController => {
  const previewCacheRef = useRef(new Map<string, PreviewData>());
  const [view, setView] = useState<ViewMode>("worktrees");
  const [sources, setSources] = useState<SourceEntry[]>(() => loadSources());
  const sourcesRef = useRef(sources);
  const [selectedSource, setSelectedSource] = useState(0);
  const [previewReloadNonce, setPreviewReloadNonce] = useState(0);
  const [state, setState] = useState<AppState>({
    items: [],
    selected: 0,
    message: "",
    dialog: { kind: "none" },
    preview: null,
    previewPath: "",
    previewLoading: false,
    loading: true,
  });
  const [loadingFrame, setLoadingFrame] = useState(0);

  useEffect(() => {
    sourcesRef.current = sources;
  }, [sources]);

  const refreshItems = useCallback((message = "", sourceEntries = sourcesRef.current) => {
    const items = loadItems(sourceEntries);

    setState((current) => {
      const nextSelected = Math.min(
        current.selected,
        Math.max(items.length - 1, 0),
      );

      return {
        ...current,
        items,
        selected: nextSelected,
        loading: false,
        message,
        preview: null,
        previewPath: items[nextSelected]?.path ?? "",
        previewLoading: items[nextSelected]?.kind === "worktree",
      };
    });
  }, []);

  const refreshLiveState = useCallback(() => {
    setState((current) => ({
      ...current,
      items: annotateItemsWithLiveState(current.items),
    }));
  }, []);

  const refreshPreview = useCallback((itemPath: string) => {
    previewCacheRef.current.delete(itemPath);
    setState((currentState) => ({
      ...currentState,
      message: "",
      preview: null,
      previewPath: itemPath,
      previewLoading: true,
    }));
    setPreviewReloadNonce((currentNonce) => currentNonce + 1);
  }, []);

  useEffect(() => {
    const nextSources = loadSources();
    setSources(nextSources);

    if (nextSources.length === 0) {
      setView("sources");
      setState((current) => ({
        ...current,
        loading: false,
        dialog: { kind: "add-source", value: "" },
        message: "Add a repo root to get started.",
      }));
      return;
    }

    refreshItems("", nextSources);
  }, []);

  const hasWorkingOverwatch = useMemo(
    () => state.items.some((item) => {
      if (item.kind !== "worktree" || !item.overwatch) {
        return false;
      }

      return item.overwatch.kind === "single"
        ? item.overwatch.agent.status === "working"
        : item.overwatch.agents.some((agent) => agent.status === "working");
    }),
    [state.items],
  );

  useEffect(() => {
    if (!(state.loading || state.previewLoading || state.dialog.kind === "running" || hasWorkingOverwatch)) {
      return;
    }

    const interval = setInterval(() => {
      setLoadingFrame((current) => (current + 1) % loadingFrames.length);
    }, 90);

    return () => {
      clearInterval(interval);
    };
  }, [state.loading, state.previewLoading, state.dialog.kind, hasWorkingOverwatch]);

  useEffect(() => {
    if (!overwatchEnabled || view !== "worktrees" || state.dialog.kind !== "none") {
      return;
    }

    const interval = setInterval(() => {
      refreshLiveState();
    }, overwatchRefreshMs);

    return () => {
      clearInterval(interval);
    };
  }, [view, state.dialog.kind, refreshLiveState]);

  useEffect(() => {
    if (view !== "worktrees") {
      return;
    }

    const current = state.items[state.selected];

    if (!current) {
      setState((existing) => ({
        ...existing,
        preview: null,
        previewPath: "",
        previewLoading: false,
      }));
      return;
    }

    if (current.kind === "source-empty") {
      setState((existing) => ({
        ...existing,
        preview: null,
        previewPath: current.path,
        previewLoading: false,
      }));
      return;
    }

    const cachedPreview = previewCacheRef.current.get(current.path);
    if (cachedPreview) {
      setState((existing) => ({
        ...existing,
        preview: cachedPreview,
        previewPath: current.path,
        previewLoading: false,
      }));
      return;
    }

    let cancelled = false;
    let cancelPreviewLoad: (() => void) | null = null;
    const timer = setTimeout(() => {
      setState((existing) => {
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

        setState((existing) => {
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

    return () => {
      cancelled = true;
      clearTimeout(timer);
      cancelPreviewLoad?.();
    };
  }, [view, state.items, state.selected, previewReloadNonce]);

  const visible = useMemo(() => {
    const start = Math.max(
      0,
      Math.min(
        state.selected - Math.floor(listRowsTarget / 2),
        Math.max(state.items.length - listRowsTarget, 0),
      ),
    );
    const end = Math.min(state.items.length, start + listRowsTarget);

    return {
      start,
      end,
      rows: state.items.slice(start, end),
    };
  }, [state.items, state.selected, listRowsTarget]);

  const currentSource = sources[selectedSource];
  const current = state.items[state.selected];
  const createTargetPath = useMemo(() => {
    if (!current) {
      return "";
    }

    if (!(current.kind === "source-empty" || state.dialog.kind === "create")) {
      return "";
    }

    return suggestedCreateTargetDir(
      current.path,
      state.dialog.kind === "create" ? state.dialog.value || "<branch>" : "<branch>",
    );
  }, [
    current?.path,
    current?.kind,
    state.dialog.kind,
    state.dialog.kind === "create" ? state.dialog.value : "",
  ]);
  const previewMatchesCurrent = current?.kind === "worktree"
    ? state.previewPath === current.path && !state.previewLoading
    : false;
  const cachedPreview = current?.kind === "worktree"
    ? (previewCacheRef.current.get(current.path) ?? null)
    : null;
  const effectivePreview = previewMatchesCurrent ? state.preview : cachedPreview;
  const showPreviewLoading = current?.kind === "worktree" ? !effectivePreview : false;
  const previewPath = effectivePreview?.path
    ? formatPath(effectivePreview.path)
    : formatPath(current?.path ?? "");
  const previewMetaRows = [
    current?.kind === "worktree" && current.isPrimary
      ? { label: "Role", value: "primary checkout" }
      : null,
    effectivePreview?.branch
      ? { label: "Branch", value: effectivePreview.branch }
      : null,
    effectivePreview?.base
      ? { label: "Base", value: effectivePreview.base }
      : null,
    effectivePreview?.track
      ? { label: "Track", value: effectivePreview.track }
      : null,
    effectivePreview
      ? { label: "Status", value: effectivePreview.status }
      : null,
    effectivePreview?.tmux
      ? { label: "Tmux", value: effectivePreview.tmux }
      : null,
    effectivePreview?.last
      ? { label: "Last", value: effectivePreview.last }
      : null,
  ].filter((row): row is PreviewMetaRow => row !== null);
  const previewChanges = effectivePreview?.changes.slice(0, 5) ?? [];
  const hiddenPreviewChanges = Math.max(
    0,
    (effectivePreview?.changes.length ?? 0) - previewChanges.length,
  );

  return {
    view,
    setView,
    sources,
    setSources,
    selectedSource,
    setSelectedSource,
    state,
    setState,
    refreshItems,
    refreshLiveState,
    refreshPreview,
    visible,
    currentSource,
    current,
    createTargetPath,
    loadingGlyph: loadingFrames[loadingFrame],
    previewPath,
    showPreviewLoading,
    previewMetaRows,
    previewChanges,
    hiddenPreviewChanges,
  };
};
