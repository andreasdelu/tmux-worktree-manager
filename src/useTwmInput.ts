import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { useInput } from "ink";
import type { AppState, SourceEntry, ViewMode } from "./types";
import { parseSourceEntry, writeSources } from "./lib/sources";
import { loadItems } from "./lib/discovery";
import { waitForPaint } from "./lib/commands";
import {
  createItem,
  openItem,
  performAction,
  suggestedCreateTargetDir,
} from "./lib/actions";

type UseTwmInputArgs = {
  exit: () => void;
  view: ViewMode;
  setView: Dispatch<SetStateAction<ViewMode>>;
  sources: SourceEntry[];
  setSources: Dispatch<SetStateAction<SourceEntry[]>>;
  selectedSource: number;
  setSelectedSource: Dispatch<SetStateAction<number>>;
  state: AppState;
  setState: Dispatch<SetStateAction<AppState>>;
  refreshItems: (message?: string, sourceEntries?: SourceEntry[]) => void;
  previewCacheRef: MutableRefObject<Map<string, string>>;
  setPreviewReloadNonce: Dispatch<SetStateAction<number>>;
};

export const useTwmInput = ({
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
}: UseTwmInputArgs) => {
  useInput((input, key) => {
    if (state.loading || state.dialog.kind === "running") {
      return;
    }

    if (state.dialog.kind === "add-source") {
      if (key.escape) {
        setState((current) => ({
          ...current,
          dialog: { kind: "none" },
          message: "Cancelled",
        }));
        return;
      }

      if (key.return) {
        const nextPath = state.dialog.value.trim();
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
        setSources(nextSources);
        setSelectedSource(Math.max(nextSources.length - 1, 0));
        setState((current) => ({ ...current, dialog: { kind: "none" } }));
        refreshItems(`Added source ${nextEntry.path}`, nextSources);
        return;
      }

      if (key.backspace || key.delete) {
        setState((current) =>
          current.dialog.kind === "add-source"
            ? {
                ...current,
                dialog: {
                  kind: "add-source",
                  value: current.dialog.value.slice(0, -1),
                },
              }
            : current,
        );
        return;
      }

      if (/^[ -~]$/.test(input)) {
        setState((current) =>
          current.dialog.kind === "add-source"
            ? {
                ...current,
                dialog: {
                  kind: "add-source",
                  value: `${current.dialog.value}${input}`,
                },
              }
            : current,
        );
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
        setState((current) => ({
          ...current,
          dialog: { kind: "add-source", value: "" },
          message: "",
        }));
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

    if (state.dialog.kind === "create") {
      if (key.escape) {
        setState((current) => ({
          ...current,
          dialog: { kind: "none" },
          message: "Cancelled",
        }));
        return;
      }

      if (key.return) {
        const current = state.items[state.selected];
        const branchName = state.dialog.value.trim();

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
          dialog: { kind: "running", label: `Creating worktree ${branchName}…` },
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
              dialog: { kind: "none" },
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
        setState((current) =>
          current.dialog.kind === "create"
            ? {
                ...current,
                dialog: {
                  kind: "create",
                  value: current.dialog.value.slice(0, -1),
                },
              }
            : current,
        );
        return;
      }

      if (/^[A-Za-z0-9._/-]$/.test(input)) {
        setState((current) =>
          current.dialog.kind === "create"
            ? {
                ...current,
                dialog: {
                  kind: "create",
                  value: `${current.dialog.value}${input}`,
                },
              }
            : current,
        );
      }
      return;
    }

    if (state.dialog.kind === "confirm") {
      if (input === "y") {
        const current = state.items[state.selected];
        const actionMode = state.dialog.mode;
        if (current && current.kind === "worktree") {
          const actionLabel =
            actionMode === "kill"
              ? `Closing tmux session for ${current.name}…`
              : `Removing worktree ${current.name}…`;

          setState((currentState) => ({
            ...currentState,
            dialog: { kind: "running", label: actionLabel },
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
                dialog: { kind: "none" },
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
          dialog: { kind: "none" },
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
        setState((current) => ({
          ...current,
          dialog: { kind: "confirm", mode: "kill" },
        }));
      }
      return;
    }

    if (input === "x") {
      if (state.items[state.selected]?.kind === "worktree") {
        setState((current) => ({
          ...current,
          dialog: { kind: "confirm", mode: "remove" },
        }));
      }
      return;
    }

    if (input === "c") {
      setState((current) => ({
        ...current,
        dialog: { kind: "create", value: "" },
        message: "",
      }));
    }
  });
};
