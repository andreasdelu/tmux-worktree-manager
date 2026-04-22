import React, { useEffect, useMemo, useRef, useState } from "react";
import { render, Box, useApp } from "ink";
import { ensureConfigDefaults, loadingFrames, previewDebounceMs } from "./config";
import type { AppState, SourceEntry, ViewMode } from "./types";
import { loadSources, formatPath } from "./lib/sources";
import { loadItems } from "./lib/discovery";
import { startPreviewLoad } from "./lib/preview";
import { suggestedCreateTargetDir } from "./lib/actions";
import {
  DetailsPane,
  DialogOverlay,
  HelpLine,
  SidebarPane,
  StatusLine,
} from "./ui";
import { useTwmInput } from "./useTwmInput";

ensureConfigDefaults();

const App = () => {
  const { exit } = useApp();
  const previewCacheRef = useRef(new Map<string, string>());
  const [view, setView] = useState<ViewMode>("worktrees");
  const [sources, setSources] = useState<SourceEntry[]>(() => loadSources());
  const [selectedSource, setSelectedSource] = useState(0);
  const [previewReloadNonce, setPreviewReloadNonce] = useState(0);
  const [state, setState] = useState<AppState>({
    items: [],
    selected: 0,
    message: "",
    dialog: { kind: "none" },
    preview: "",
    previewPath: "",
    previewLoading: false,
    loading: true,
  });
  const [loadingFrame, setLoadingFrame] = useState(0);

  const refreshItems = (message = "", sourceEntries = sources) => {
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
        preview: "",
        previewPath: items[nextSelected]?.path ?? "",
        previewLoading: items[nextSelected]?.kind === "worktree",
      };
    });
  };

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

  useEffect(() => {
    if (!(state.loading || state.previewLoading || state.dialog.kind === "running")) {
      return;
    }

    const interval = setInterval(() => {
      setLoadingFrame((current) => (current + 1) % loadingFrames.length);
    }, 90);

    return () => {
      clearInterval(interval);
    };
  }, [state.loading, state.previewLoading, state.dialog.kind]);

  useEffect(() => {
    if (view !== "worktrees") {
      return;
    }

    const current = state.items[state.selected];

    if (!current) {
      setState((existing) => ({
        ...existing,
        preview: "",
        previewPath: "",
        previewLoading: false,
      }));
      return;
    }

    if (current.kind === "source-empty") {
      setState((existing) => ({
        ...existing,
        preview: "",
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
          preview: "",
          previewPath: current.path,
          previewLoading: true,
        };
      });

      const previewLoad = startPreviewLoad(current.path);
      cancelPreviewLoad = previewLoad.cancel;

      void (async () => {
        const preview = await previewLoad.promise;

        if (cancelled) {
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

  useTwmInput({
    exit,
    view,
    setView,
    sources,
    setSources,
    selectedSource,
    setSelectedSource,
    state,
    setState,
    refreshItems,
    previewCacheRef,
    setPreviewReloadNonce,
  });

  const terminalColumns = process.stdout.columns ?? 80;
  const terminalRows = process.stdout.rows ?? 24;
  const isSplit = terminalColumns >= 110;
  const rootHeight = Math.max(terminalRows, 18);
  const statusBoxHeight = 2;
  const keybindLegendHeight = 1;
  const mainPanelsHeight = Math.max(
    rootHeight - statusBoxHeight - keybindLegendHeight - 2,
    10,
  );
  const listRowsTarget = Math.max(
    6,
    isSplit ? mainPanelsHeight - 4 : Math.floor(mainPanelsHeight / 2),
  );
  const loadingGlyph = loadingFrames[loadingFrame];

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
  const createTargetPath = current
    ? suggestedCreateTargetDir(
        current.path,
        state.dialog.kind === "create" ? state.dialog.value || "<branch>" : "<branch>",
      )
    : "";
  const previewMatchesCurrent = current?.kind === "worktree"
    ? state.previewPath === current.path && !state.previewLoading
    : false;
  const cachedPreview = current?.kind === "worktree"
    ? (previewCacheRef.current.get(current.path) ?? "")
    : "";
  const effectivePreview = previewMatchesCurrent
    ? state.preview
    : cachedPreview;
  const showPreviewLoading = current?.kind === "worktree" ? !effectivePreview : false;
  const previewLines = effectivePreview ? effectivePreview.split("\n") : [];
  const previewPath = previewLines[1] ?? formatPath(current?.path ?? "");
  const previewBody = previewLines
    .slice(2)
    .filter((line) => line.trim().length > 0);
  const previewMetaRows = previewBody
    .map((line) => {
      const match = line.match(
        /^\s*(Branch|Base|Track|Status|Tmux|Last)\s+(.*)$/,
      );
      return match ? { label: match[1], value: match[2] } : null;
    })
    .filter((row): row is { label: string; value: string } => row !== null);
  const allPreviewChanges = previewBody.filter(
    (line) => !/^\s*(Branch|Base|Track|Status|Tmux|Last)\s+/.test(line),
  );
  const previewChanges = allPreviewChanges.slice(0, 5);
  const hiddenPreviewChanges = Math.max(
    0,
    allPreviewChanges.length - previewChanges.length,
  );

  return (
    <Box
      flexDirection="column"
      paddingX={1}
      justifyContent="flex-start"
      height={rootHeight}
    >
      <Box
        flexDirection={isSplit ? "row" : "column"}
        gap={1}
        minHeight={mainPanelsHeight}
      >
        <SidebarPane
          view={view}
          loading={state.loading}
          loadingGlyph={loadingGlyph}
          visibleRows={visible.rows}
          visibleStart={visible.start}
          selected={state.selected}
          sources={sources}
          selectedSource={selectedSource}
          isSplit={isSplit}
          mainPanelsHeight={mainPanelsHeight}
        />
        <DetailsPane
          view={view}
          current={current}
          currentSource={currentSource}
          isSplit={isSplit}
          mainPanelsHeight={mainPanelsHeight}
          previewPath={previewPath}
          showPreviewLoading={showPreviewLoading}
          loadingGlyph={loadingGlyph}
          previewMetaRows={previewMetaRows}
          previewChanges={previewChanges}
          hiddenPreviewChanges={hiddenPreviewChanges}
          formatPath={formatPath}
          createTargetPath={createTargetPath}
        />
      </Box>

      <StatusLine
        message={state.message}
        dialog={state.dialog}
        view={view}
        statusBoxHeight={statusBoxHeight}
      />

      <HelpLine
        view={view}
        keybindLegendHeight={keybindLegendHeight}
        current={current}
      />

      <DialogOverlay
        dialog={state.dialog}
        rootHeight={rootHeight}
        isSplit={isSplit}
        current={current}
        createTargetPath={createTargetPath}
        loadingGlyph={loadingGlyph}
      />
    </Box>
  );
};

if (process.stdout.isTTY) {
  process.stdout.write("\u001b[H");
}

render(<App />, { alternateScreen: true, incrementalRendering: true });
