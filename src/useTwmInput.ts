import { useInput } from "ink";
import { parseSourceEntry, writeSources } from "./lib/sources";
import { loadItems } from "./lib/discovery";
import { waitForPaint } from "./lib/commands";
import {
  createItem,
  openItem,
  performAction,
  removalBlockedReason,
  suggestedCreateTargetDir,
} from "./lib/actions";
import type { TwmController } from "./useTwmController";

type UseTwmInputArgs = {
  exit: () => void;
  controller: Pick<
    TwmController,
    | "view"
    | "setView"
    | "sources"
    | "setSources"
    | "selectedSource"
    | "setSelectedSource"
    | "state"
    | "setState"
    | "refreshItems"
    | "refreshPreview"
  >;
};

export const useTwmInput = ({ exit, controller }: UseTwmInputArgs) => {
  const {
    view,
    setView,
    sources,
    setSources,
    selectedSource,
    setSelectedSource,
    state,
    setState,
    refreshItems,
    refreshPreview,
  } = controller;

  const sanitizeSourceInput = (input: string) => input.replace(/[^ -~]/g, "");

  const sanitizeWorktreeInput = (input: string) =>
    Array.from(input)
      .filter((char) => /^[A-Za-z0-9._-]$/.test(char))
      .join("");

  const sanitizeBranchInput = (input: string) =>
    Array.from(input)
      .filter((char) => /^[A-Za-z0-9._/-]$/.test(char))
      .join("");

  const cancelDialog = () => {
    setState((current) => ({
      ...current,
      dialog: { kind: "none" },
      message: "Cancelled",
    }));
  };

  const handleAddSourceDialogInput = (input: string, key: any) => {
    if (state.dialog.kind !== "add-source") {
      return false;
    }

    if (key.escape) {
      cancelDialog();
      return true;
    }

    if (key.return) {
      const nextPath = state.dialog.value.trim();
      if (!nextPath) {
        setState((current) => ({ ...current, message: "Enter a repo path" }));
        return true;
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
        return true;
      }

      if (!nextEntry.exists) {
        setState((current) => ({
          ...current,
          message: `Repo root not found: ${nextEntry.path}`,
        }));
        return true;
      }

      if (!nextEntry.valid) {
        setState((current) => ({
          ...current,
          message: `Not a git repo root: ${nextEntry.path}`,
        }));
        return true;
      }

      const nextSources = [...sources, nextEntry];
      writeSources(nextSources);
      setSources(nextSources);
      setSelectedSource(Math.max(nextSources.length - 1, 0));
      setState((current) => ({ ...current, dialog: { kind: "none" } }));
      refreshItems(`Added source ${nextEntry.path}`, nextSources);
      return true;
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
      return true;
    }

    const sourceInput = sanitizeSourceInput(input);
    if (sourceInput) {
      setState((current) =>
        current.dialog.kind === "add-source"
          ? {
              ...current,
              dialog: {
                kind: "add-source",
                value: `${current.dialog.value}${sourceInput}`,
              },
            }
          : current,
      );
      return true;
    }

    return true;
  };

  const handleCreateDialogInput = (input: string, key: any) => {
    if (state.dialog.kind !== "create") {
      return false;
    }

    if (key.escape) {
      cancelDialog();
      return true;
    }

    if (key.tab) {
      setState((current) =>
        current.dialog.kind === "create"
          ? {
              ...current,
              dialog: {
                ...current.dialog,
                field: current.dialog.field === "worktreeName"
                  ? "branchName"
                  : "worktreeName",
              },
            }
          : current,
      );
      return true;
    }

    if (key.return) {
      const current = state.items[state.selected];
      const worktreeName = state.dialog.worktreeName.trim();
      const branchName = state.dialog.branchName.trim() || worktreeName;

      if (!current) {
        return true;
      }

      const createdTargetDir = suggestedCreateTargetDir(current.path, worktreeName);

      if (!worktreeName) {
        setState((currentState) => ({
          ...currentState,
          message: "Enter a worktree name",
        }));
        return true;
      }

      setState((currentState) => ({
        ...currentState,
        dialog: { kind: "running", label: `Creating worktree ${worktreeName}…` },
        message: "",
      }));

      void (async () => {
        await waitForPaint();
        const message = await createItem(current.path, worktreeName, branchName);
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
            preview: null,
            previewPath: items[nextSelected]?.path ?? "",
            previewLoading: items[nextSelected]?.kind === "worktree",
          };
        });
      })();
      return true;
    }

    if (key.backspace || key.delete) {
      setState((current) =>
        current.dialog.kind === "create"
          ? {
              ...current,
              dialog: {
                ...current.dialog,
                [current.dialog.field]: current.dialog[current.dialog.field].slice(0, -1),
              },
            }
          : current,
      );
      return true;
    }

    const dialogInput = state.dialog.field === "worktreeName"
      ? sanitizeWorktreeInput(input)
      : sanitizeBranchInput(input);
    if (dialogInput) {
      setState((current) =>
        current.dialog.kind === "create"
          ? {
              ...current,
              dialog: {
                ...current.dialog,
                [current.dialog.field]: `${current.dialog[current.dialog.field]}${dialogInput}`,
              },
            }
          : current,
      );
      return true;
    }

    return true;
  };

  const handleNoticeDialogInput = (input: string, key: any) => {
    if (state.dialog.kind !== "notice") {
      return false;
    }

    if (key.escape || key.return || input === "q" || input === "\r") {
      setState((current) => ({
        ...current,
        dialog: { kind: "none" },
        message: "",
      }));
      return true;
    }

    return true;
  };

  const handleConfirmDialogInput = (input: string, key: any) => {
    if (state.dialog.kind !== "confirm") {
      return false;
    }

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
              preview: null,
              previewPath: items[nextSelected]?.path ?? "",
              previewLoading: items[nextSelected]?.kind === "worktree",
            };
          });
        })();
      }
      return true;
    }

    if (key.escape || input === "n" || input === "q" || input === "\r") {
      cancelDialog();
      return true;
    }

    return true;
  };

  const handleSourcesViewInput = (input: string, key: any) => {
    if (view !== "sources") {
      return false;
    }

    if (input === "q" || key.escape) {
      exit();
      return true;
    }

    if (input === "j" || key.downArrow) {
      setSelectedSource((current) =>
        Math.min(current + 1, Math.max(sources.length - 1, 0)),
      );
      return true;
    }

    if (input === "k" || key.upArrow) {
      setSelectedSource((current) => Math.max(current - 1, 0));
      return true;
    }

    if (input === "a") {
      setState((current) => ({
        ...current,
        dialog: { kind: "add-source", value: "" },
        message: "",
      }));
      return true;
    }

    if (input === "x") {
      const source = sources[selectedSource];
      if (!source) {
        return true;
      }

      const nextSources = sources.filter((_, index) => index !== selectedSource);
      writeSources(nextSources);
      setSources(nextSources);
      setSelectedSource((current) =>
        Math.min(current, Math.max(nextSources.length - 1, 0)),
      );
      refreshItems(`Removed source ${source.path}`, nextSources);
      return true;
    }

    return true;
  };

  const handleWorktreesViewInput = (input: string, key: any) => {
    if (input === "q" || key.escape) {
      exit();
      return true;
    }

    if (input === "j" || key.downArrow) {
      setState((current) => ({
        ...current,
        selected: Math.min(current.selected + 1, current.items.length - 1),
      }));
      return true;
    }

    if (input === "k" || key.upArrow) {
      setState((current) => ({
        ...current,
        selected: Math.max(current.selected - 1, 0),
      }));
      return true;
    }

    if (key.return) {
      const current = state.items[state.selected];
      if (current?.kind === "worktree") {
        openItem(current.path);
        exit();
      }
      return true;
    }

    if (input === "r") {
      const current = state.items[state.selected];
      if (current?.kind === "worktree") {
        refreshItems(`Refreshed ${current.name}`);
        refreshPreview(current.path);
      }
      return true;
    }

    if (input === "d") {
      if (state.items[state.selected]?.kind === "worktree") {
        setState((current) => ({
          ...current,
          dialog: { kind: "confirm", mode: "kill" },
        }));
      }
      return true;
    }

    if (input === "x") {
      const current = state.items[state.selected];
      if (current?.kind === "worktree") {
        if (current.isPrimary) {
          setState((currentState) => ({
            ...currentState,
            dialog: {
              kind: "notice",
              title: "Can't remove the primary checkout",
              message: "The main repo checkout is shown in the list, but twm won't remove it.",
            },
          }));
          return true;
        }

        void (async () => {
          const blockedReason = await removalBlockedReason(current.path);
          setState((currentState) => {
            if (currentState.items[currentState.selected]?.path !== current.path) {
              return currentState;
            }

            return {
              ...currentState,
              dialog: blockedReason
                ? {
                    kind: "notice",
                    title: "Can't remove this worktree",
                    message: blockedReason,
                  }
                : { kind: "confirm", mode: "remove" },
            };
          });
        })();
      }
      return true;
    }

    if (input === "c") {
      setState((current) => ({
        ...current,
        dialog: {
          kind: "create",
          worktreeName: "",
          branchName: "",
          field: "worktreeName",
        },
        message: "",
      }));
      return true;
    }

    return false;
  };

  useInput((input, key) => {
    if (state.loading || state.dialog.kind === "running") {
      return;
    }

    if (handleAddSourceDialogInput(input, key)) {
      return;
    }

    if (handleCreateDialogInput(input, key)) {
      return;
    }

    if (handleNoticeDialogInput(input, key)) {
      return;
    }

    if (handleConfirmDialogInput(input, key)) {
      return;
    }

    if (key.tab) {
      setView((current) => (current === "worktrees" ? "sources" : "worktrees"));
      setState((current) => ({ ...current, message: "" }));
      return;
    }

    if (handleSourcesViewInput(input, key)) {
      return;
    }

    handleWorktreesViewInput(input, key);
  });
};
