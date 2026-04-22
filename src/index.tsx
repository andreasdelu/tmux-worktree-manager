import React, { useEffect, useMemo, useRef, useState } from "react";
import { render, Box, useApp, useInput } from "ink";
import { ensureConfigDefaults, loadingFrames, previewDebounceMs } from "./config";
import type { AppState, SourceEntry, ViewMode } from "./types";
import {
  loadSources,
  parseSourceEntry,
  writeSources,
  formatPath,
} from "./lib/sources";
import { loadItems } from "./lib/discovery";
import { startPreviewLoad } from "./lib/preview";
import { waitForPaint } from "./lib/commands";
import {
  createItem,
  openItem,
  performAction,
  suggestedCreateTargetDir,
} from "./lib/actions";
import {
  DetailsPane,
  DialogOverlay,
  HelpLine,
  SidebarPane,
  StatusLine,
} from "./ui";

ensureConfigDefaults();

const App = () => {
  const { exit } = useApp();
  const previewCacheRef = useRef(new Map<string, string>());
  const [view, setView] = useState<ViewMode>("worktrees");
  const [sources, setSources] = useState<SourceEntry[]>(() => loadSources());
  const [selectedSource, setSelectedSource] = useState(0);
  const [addingSource, setAddingSource] = useState(false);
  const [sourceInput, setSourceInput] = useState("");
  const [previewReloadNonce, setPreviewReloadNonce] = useState(0);
  const [state, setState] = useState<AppState>({
    items: [],
    selected: 0,
    message: "",
    confirming: "none",
    creating: false,
    createName: "",
    actionLoading: false,
    actionLabel: "",
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
      setAddingSource(true);
      setState((current) => ({
        ...current,
        loading: false,
        message: "Add a repo root to get started.",
      }));
      return;
    }

    refreshItems("", nextSources);
  }, []);

  useEffect(() => {
    if (!(state.loading || state.previewLoading || state.actionLoading)) {
      return;
    }

    const interval = setInterval(() => {
      setLoadingFrame((current) => (current + 1) % loadingFrames.length);
    }, 90);

    return () => {
      clearInterval(interval);
    };
  }, [state.loading, state.previewLoading, state.actionLoading]);

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

  useInput((input, key) => {
    if (state.loading || state.actionLoading) {
      return;
    }

    if (addingSource) {
      if (key.escape) {
        setAddingSource(false);
        setSourceInput("");
        setState((current) => ({ ...current, message: "Cancelled" }));
        return;
      }

      if (key.return) {
        const nextPath = sourceInput.trim();
        if (!nextPath) {
          setState((current) => ({ ...current, message: "Enter a repo path" }));
          return;
        }

        const nextEntry = parseSourceEntry(nextPath);
        const duplicate = sources.find(
          (source) => source.resolvedPath === nextEntry.resolvedPath,
        );

        if (duplicate) {
          setState((current) => ({
            ...current,
            message: `Repo root already added: ${duplicate.path}`,
          }));
          return;
        }

        if (!nextEntry.exists) {
          setState((current) => ({
            ...current,
            message: `Repo root not found: ${nextEntry.path}`,
          }));
          return;
        }

        if (!nextEntry.valid) {
          setState((current) => ({
            ...current,
            message: `Not a git repo root: ${nextEntry.path}`,
          }));
          return;
        }

        const nextSources = [...sources, nextEntry];
        writeSources(nextSources);
        setAddingSource(false);
        setSourceInput("");
        setSources(nextSources);
        setSelectedSource(Math.max(nextSources.length - 1, 0));
        refreshItems(`Added source ${nextEntry.path}`, nextSources);
        return;
      }

      if (key.backspace || key.delete) {
        setSourceInput((current) => current.slice(0, -1));
        return;
      }

      if (/^[ -~]$/.test(input)) {
        setSourceInput((current) => `${current}${input}`);
      }
      return;
    }

    if (key.tab) {
      setView((current) => (current === "worktrees" ? "sources" : "worktrees"));
      setState((current) => ({ ...current, message: "" }));
      return;
    }

    if (view === "sources") {
      if (input === "q" || key.escape) {
        exit();
        return;
      }

      if (input === "j" || key.downArrow) {
        setSelectedSource((current) =>
          Math.min(current + 1, Math.max(sources.length - 1, 0)),
        );
        return;
      }

      if (input === "k" || key.upArrow) {
        setSelectedSource((current) => Math.max(current - 1, 0));
        return;
      }

      if (input === "a") {
        setAddingSource(true);
        setSourceInput("");
        setState((current) => ({ ...current, message: "" }));
        return;
      }

      if (input === "x") {
        const source = sources[selectedSource];
        if (!source) {
          return;
        }

        const nextSources = sources.filter(
          (_, index) => index !== selectedSource,
        );
        writeSources(nextSources);
        setSources(nextSources);
        setSelectedSource((current) =>
          Math.min(current, Math.max(nextSources.length - 1, 0)),
        );
        refreshItems(`Removed source ${source.path}`, nextSources);
      }
      return;
    }

    if (state.creating) {
      if (key.escape) {
        setState((current) => ({
          ...current,
          creating: false,
          createName: "",
          message: "Cancelled",
        }));
        return;
      }

      if (key.return) {
        const current = state.items[state.selected];
        const branchName = state.createName.trim();

        if (!current) {
          return;
        }

        const createdTargetDir = suggestedCreateTargetDir(current.path, branchName);

        if (!branchName) {
          setState((currentState) => ({
            ...currentState,
            message: "Enter a branch name",
          }));
          return;
        }

        setState((currentState) => ({
          ...currentState,
          creating: false,
          actionLoading: true,
          actionLabel: `Creating worktree ${branchName}…`,
          message: "",
        }));

        void (async () => {
          await waitForPaint();
          const message = await createItem(current.path, branchName);
          const items = loadItems(sources);

          setState((currentState) => {
            const createdIndex = items.findIndex(
              (item) => item.path === createdTargetDir,
            );
            const nextSelected =
              createdIndex >= 0
                ? createdIndex
                : Math.min(
                    currentState.selected,
                    Math.max(items.length - 1, 0),
                  );

            return {
              ...currentState,
              items,
              selected: nextSelected,
              createName: "",
              actionLoading: false,
              actionLabel: "",
              message,
              preview: "",
              previewPath: items[nextSelected]?.path ?? "",
              previewLoading: items[nextSelected]?.kind === "worktree",
            };
          });
        })();
        return;
      }

      if (key.backspace || key.delete) {
        setState((current) => ({
          ...current,
          createName: current.createName.slice(0, -1),
        }));
        return;
      }

      if (/^[A-Za-z0-9._/-]$/.test(input)) {
        setState((current) => ({
          ...current,
          createName: `${current.createName}${input}`,
        }));
      }
      return;
    }

    if (state.confirming !== "none") {
      if (input === "y") {
        const current = state.items[state.selected];
        const actionMode = state.confirming;
        if (current && current.kind === "worktree") {
          const actionLabel =
            actionMode === "kill"
              ? `Closing tmux session for ${current.name}…`
              : `Removing worktree ${current.name}…`;

          setState((currentState) => ({
            ...currentState,
            confirming: "none",
            creating: false,
            createName: "",
            actionLoading: true,
            actionLabel,
            message: "",
          }));

          void (async () => {
            await waitForPaint();
            const message = await performAction(actionMode, current.path);
            const items = loadItems(sources);

            setState((currentState) => {
              const nextSelected = Math.min(
                currentState.selected,
                Math.max(items.length - 1, 0),
              );

              return {
                ...currentState,
                items,
                selected: nextSelected,
                actionLoading: false,
                actionLabel: "",
                message,
                preview: "",
                previewPath: items[nextSelected]?.path ?? "",
                previewLoading: items[nextSelected]?.kind === "worktree",
              };
            });
          })();
        }
      } else if (
        key.escape ||
        input === "n" ||
        input === "q" ||
        input === "\r"
      ) {
        setState((current) => ({
          ...current,
          confirming: "none",
          message: "Cancelled",
        }));
      }
      return;
    }

    if (input === "q" || key.escape) {
      exit();
      return;
    }

    if (input === "j" || key.downArrow) {
      setState((current) => ({
        ...current,
        selected: Math.min(current.selected + 1, current.items.length - 1),
      }));
      return;
    }

    if (input === "k" || key.upArrow) {
      setState((current) => ({
        ...current,
        selected: Math.max(current.selected - 1, 0),
      }));
      return;
    }

    if (key.return) {
      const current = state.items[state.selected];
      if (current?.kind === "worktree") {
        openItem(current.path);
        exit();
      }
      return;
    }

    if (input === "r") {
      const current = state.items[state.selected];
      if (current?.kind === "worktree") {
        previewCacheRef.current.delete(current.path);
        setState((currentState) => ({
          ...currentState,
          message: "",
          preview: "",
          previewPath: current.path,
          previewLoading: true,
        }));
        setPreviewReloadNonce((currentNonce) => currentNonce + 1);
      }
      return;
    }

    if (input === "d") {
      if (state.items[state.selected]?.kind === "worktree") {
        setState((current) => ({ ...current, confirming: "kill" }));
      }
      return;
    }

    if (input === "x") {
      if (state.items[state.selected]?.kind === "worktree") {
        setState((current) => ({ ...current, confirming: "remove" }));
      }
      return;
    }

    if (input === "c") {
      setState((current) => ({
        ...current,
        creating: true,
        createName: "",
        message: "",
      }));
    }
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
    ? suggestedCreateTargetDir(current.path, state.createName || "<branch>")
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
  const dialogOpen =
    addingSource ||
    state.creating ||
    state.confirming !== "none" ||
    state.actionLoading;

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
        actionLoading={state.actionLoading}
        actionLabel={state.actionLabel}
        dialogOpen={dialogOpen}
        view={view}
        statusBoxHeight={statusBoxHeight}
      />

      <HelpLine
        view={view}
        keybindLegendHeight={keybindLegendHeight}
        current={current}
      />

      <DialogOverlay
        dialogOpen={dialogOpen}
        rootHeight={rootHeight}
        isSplit={isSplit}
        addingSource={addingSource}
        creating={state.creating}
        confirming={state.confirming}
        actionLoading={state.actionLoading}
        current={current}
        sourceInput={sourceInput}
        createName={state.createName}
        createTargetPath={createTargetPath}
        actionLabel={state.actionLabel}
        loadingGlyph={loadingGlyph}
      />
    </Box>
  );
};

if (process.stdout.isTTY) {
  process.stdout.write("\u001b[H");
}

render(<App />, { alternateScreen: true, incrementalRendering: true });
