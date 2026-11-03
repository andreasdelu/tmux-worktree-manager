import { useInput } from "ink";
import { useRef } from "react";
import path from "node:path";
import { parseBranchInput } from "./lib/branchInput";
import { cleanInput, editInput } from "./components/TextInput";
import { parseSourceEntry, writeSources } from "./lib/sources";
import { reloadRepositoryItems } from "./lib/discovery";
import { waitForPaint } from "./lib/commands";
import { assignSession, listUnassignedSessions } from "./lib/session";
import {
  createItemResult,
  openItem,
  performAction,
  removalBlockedReason,
} from "./lib/actions";
import { useTwmStore } from "./store";
import type { TwmController } from "./useTwmController";
import type { CreateField } from "./types";
import { enterSession, sessionFor } from "./lib/session";

type UseTwmInputArgs = {
  exit: () => void;
  controller: TwmController;
};

export const useTwmInput = ({ exit, controller }: UseTwmInputArgs) => {
  const inputGeneration = useRef(0);
  const removalQueue = useRef<Promise<void>>(Promise.resolve());
  const view = useTwmStore((state) => state.view);
  const sources = useTwmStore((state) => state.sources);
  const selectedSource = useTwmStore((state) => state.selectedSource);
  const items = useTwmStore((state) => state.items);
  const selected = useTwmStore((state) => state.selected);
  const dialog = useTwmStore((state) => state.dialog);
  const loading = useTwmStore((state) => state.loading);
  const setView = useTwmStore((state) => state.setView);
  const setSources = useTwmStore((state) => state.setSources);
  const setSelectedSource = useTwmStore((state) => state.setSelectedSource);
  const setState = useTwmStore((state) => state.setState);
  const { refreshItems, refreshPreview } = controller;

  const cancelDialog = () => {
    setState((current) => ({
      ...current,
      dialog: { kind: "none" },
      message: "Cancelled",
    }));
  };

  const handleAddSourceDialogInput = (input: string, key: any) => {
    if (dialog.kind !== "add-source") {
      return false;
    }

    if (key.escape) {
      cancelDialog();
      return true;
    }

    if (key.return) {
      const nextPath = dialog.value.trim();
      if (!nextPath) {
        setState((current) => ({ ...current, message: "Enter a repo path" }));
        return true;
      }

      setState(current => ({ ...current, dialog: { kind: "running", label: "Checking repository…" } }));
      void (async () => {
      const nextEntry = await parseSourceEntry(nextPath);
      setState(current => ({ ...current, dialog: { kind: "add-source", value: nextPath } }));
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
      await refreshItems(`Added source ${nextEntry.path}`, nextSources);
      })();
      return true;
    }

    setState(current => current.dialog.kind === "add-source" ? { ...current, dialog: {
      ...current.dialog, ...editInput(current.dialog.value, current.dialog.cursor, cleanInput(input), key),
    } } : current);
    return true;
  };

  const handleCreateDialogInput = (input: string, key: any) => {
    if (dialog.kind !== "create") {
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
                cursor: undefined,
                field: (() => {
                  const fields: CreateField[] = ["worktreeName", "branchName", "baseRef", "createSession", "openSession"];
                  const index = fields.indexOf(current.dialog.field);
                  return fields[(index + (key.shift ? fields.length - 1 : 1)) % fields.length]!;
                })(),
              },
            }
          : current,
      );
      return true;
    }

    if ((dialog.field === "createSession" || dialog.field === "openSession") && input === " ") {
      setState(state => {
        if (state.dialog.kind !== "create") return state;
        const mode = state.dialog.sessionMode;
        const sessionMode = state.dialog.field === "createSession"
          ? mode === "none" ? "create" : "none"
          : mode === "open" ? "create" : "open";
        return { ...state, dialog: { ...state.dialog, sessionMode } };
      });
      return true;
    }

    if (key.return) {
      const current = items.find(item => item.path === dialog.sourcePath);
      const worktreeName = dialog.worktreeName.trim();
      const branchName = dialog.branchName.trim() || worktreeName;

      if (!current) {
        return true;
      }

      const createdTargetDir = path.join(current.createRoot, worktreeName);

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
        const result = await createItemResult(current.path, worktreeName, branchName, dialog.baseRef.trim() || undefined, current.createRoot, dialog.sessionMode);
        let message = result.message;
        const latestSources = useTwmStore.getState().sources;
        let nextItems;
        try { nextItems = await reloadRepositoryItems(useTwmStore.getState().items, latestSources, current.repoRoot); }
        catch {
          useTwmStore.setState({ cachedList: true });
          setState(state => ({ ...state, dialog: { kind: "none" }, message: `${message}; could not refresh worktrees. Press r to reconcile before changing anything.` }));
          useTwmStore.getState().bumpPreviewReloadNonce();
          return;
        }

        setState((currentState) => {
          const createdIndex = nextItems.findIndex(
            (item) => item.path === createdTargetDir,
          );
          const nextSelected =
            createdIndex >= 0
              ? createdIndex
              : Math.min(
                  currentState.selected,
                  Math.max(nextItems.length - 1, 0),
                );

          return {
            ...currentState,
            items: nextItems,
            selected: nextSelected,
            dialog: { kind: "none" },
            message,
            preview: null,
            previewPath: nextItems[nextSelected]?.path ?? "",
            previewLoading: nextItems[nextSelected]?.kind === "worktree" && nextItems[nextSelected]?.available,
          };
        });
        useTwmStore.getState().bumpPreviewReloadNonce();
        if (dialog.sessionMode === "open" && result.sessionReady) {
          try {
            const session = sessionFor(createdTargetDir);
            if (!session) throw new Error("Created tmux session is no longer available");
            enterSession(session.id);
            if (useTwmStore.getState().closeOnOpen) exit();
            else void controller.refreshLiveState();
          } catch (error) {
            message += `; could not open tmux session: ${error instanceof Error ? error.message : String(error)}`;
            setState(state => ({ ...state, message }));
          }
        }
      })();
      return true;
    }

    if (dialog.field === "createSession" || dialog.field === "openSession") return true;
    const dialogInput = cleanInput(input);
    if (dialogInput && !key.ctrl && !key.meta) {
      if (dialogInput.length > 1 && dialogInput.includes("/") &&
          ((dialog.field === "worktreeName" && !dialog.worktreeName && !dialog.branchName) ||
            (dialog.field === "branchName" && !dialog.worktreeName && !dialog.branchName))) {
        const suggestion = parseBranchInput(dialogInput.trim());
        setState(state => state.dialog.kind === "create" ? { ...state, dialog: {
          ...state.dialog, ...suggestion, cursor: undefined,
        } } : state);
        return true;
      }
    }
    setState(current => {
      if (current.dialog.kind !== "create" || current.dialog.field === "createSession" || current.dialog.field === "openSession") return current;
      const edited = editInput(current.dialog[current.dialog.field], current.dialog.cursor, dialogInput, key);
      return { ...current, dialog: { ...current.dialog, [current.dialog.field]: edited.value, cursor: edited.cursor } };
    });
    return true;
  };

  const handleNoticeDialogInput = (input: string, key: any) => {
    if (dialog.kind !== "notice") {
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
    if (dialog.kind !== "confirm") {
      return false;
    }

    if (input === "y") {
      const current = items.find(item => item.path === dialog.targetPath);
      const actionMode = dialog.mode;
      if (current && current.kind === "worktree") {
        if (actionMode === "remove") {
          const latest = useTwmStore.getState();
          if (latest.cachedList || latest.removingPaths.includes(current.path)) {
            cancelDialog();
            return true;
          }
          // Reserve immediately, then serialize Git writes and reconciliation.
          // The queue also fences actions on rows that haven't started yet.
          useTwmStore.setState({ removingPaths: [...latest.removingPaths, current.path], syncing: false });
          useTwmStore.getState().bumpPreviewReloadNonce();
          setState(state => ({ ...state, dialog: { kind: "none" }, message: "" }));
          removalQueue.current = removalQueue.current.then(async () => {
            let message = "";
            try {
              if (useTwmStore.getState().cachedList) {
                setState(state => ({ ...state, message: `Skipped removal of ${current.name}; press r to reconcile first.` }));
                return;
              }
              await waitForPaint();
              // performAction repeats safety checks when this queued job starts.
              message = await performAction("remove", current.path);
              const latest = useTwmStore.getState();
              const refreshed = await reloadRepositoryItems(latest.items, latest.sources, current.repoRoot);
              setState(state => {
                const selectedPath = state.items[state.selected]?.path;
                // Keep live updates to other sources made while Git was busy.
                const repoItems = refreshed.filter(item => item.repoRoot === current.repoRoot);
                const firstIndex = state.items.findIndex(item => item.repoRoot === current.repoRoot);
                const nextItems = state.items.filter(item => item.repoRoot !== current.repoRoot);
                nextItems.splice(firstIndex < 0 ? nextItems.length : firstIndex, 0, ...repoItems);
                const byPath = nextItems.findIndex(item => item.path === selectedPath);
                const selected = byPath >= 0 ? byPath : Math.min(state.selected, Math.max(0, nextItems.length - 1));
                return { ...state, items: nextItems, selected, message, preview: null,
                  previewPath: nextItems[selected]?.path ?? "", previewLoading: !!nextItems[selected]?.available };
              });
            } catch {
              // A failed reconciliation leaves display rows unverified even if
              // Git succeeded. Reuse startup's mutation fence until r succeeds.
              useTwmStore.setState({ cachedList: true });
              setState(state => ({ ...state, message: `${message ? `${message}; ` : ""}could not refresh worktrees. Press r to reconcile before changing anything.` }));
            } finally {
              useTwmStore.setState(state => ({ removingPaths: state.removingPaths.filter(itemPath => itemPath !== current.path) }));
              useTwmStore.getState().bumpPreviewReloadNonce();
            }
          });
          return true;
        }
        const actionLabel = `Closing tmux session for ${current.name}…`;

        setState((currentState) => ({
          ...currentState,
          dialog: { kind: "running", label: actionLabel },
          message: "",
        }));

        void (async () => {
          await waitForPaint();
          const message = await performAction(actionMode, current.path);
          const latestSources = useTwmStore.getState().sources;
          let nextItems;
          try { nextItems = await reloadRepositoryItems(useTwmStore.getState().items, latestSources, current.repoRoot); }
          catch {
            useTwmStore.setState({ cachedList: true });
            setState(state => ({ ...state, dialog: { kind: "none" }, message: `${message}; could not refresh worktrees. Press r to reconcile before changing anything.` }));
            useTwmStore.getState().bumpPreviewReloadNonce();
            return;
          }

          setState((currentState) => {
            const nextSelected = Math.min(
              currentState.selected,
              Math.max(nextItems.length - 1, 0),
            );

            return {
              ...currentState,
              items: nextItems,
              selected: nextSelected,
              dialog: { kind: "none" },
              message,
              preview: null,
              previewPath: nextItems[nextSelected]?.path ?? "",
              previewLoading: nextItems[nextSelected]?.kind === "worktree" && nextItems[nextSelected]?.available,
            };
          });
          useTwmStore.getState().bumpPreviewReloadNonce();
        })();
      }
      return true;
    }

    if (key.escape || key.return || input === "n" || input === "q" || input === "\r") {
      cancelDialog();
      return true;
    }

    return true;
  };

  const blockCachedAction = () => {
    if (!useTwmStore.getState().cachedList) return false;
    setState(state => ({ ...state, message: "Syncing… wait for fresh repository state before changing anything." }));
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
      if (blockCachedAction()) return true;
      setState((current) => ({
        ...current,
        dialog: { kind: "add-source", value: "" },
        message: "",
      }));
      return true;
    }

    if (input === "x") {
      if (blockCachedAction()) return true;
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
    if (key.pageUp || key.pageDown) {
      useTwmStore.getState().setDetailsScroll(scroll => scroll + (key.pageDown ? 5 : -5));
      return true;
    }
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

    if (input === "h" || input === "l") {
      const starts = items.flatMap((item, index) => index === 0 || item.repoRoot !== items[index - 1]?.repoRoot ? [index] : []);
      const group = starts.findLastIndex(index => index <= selected);
      const target = starts[group + (input === "l" ? 1 : -1)];
      if (target !== undefined) useTwmStore.getState().setSelected(target);
      return true;
    }

    if (key.return) {
      if (blockCachedAction()) return true;
      const current = items[selected];
      if (current?.kind === "worktree" && current.available) {
        try {
          openItem(current.path);
          const pending = useTwmStore.getState().removingPaths.length;
          if (useTwmStore.getState().closeOnOpen && !pending) exit();
          else {
            void controller.refreshLiveState();
            setState(state => ({ ...state, message: `Opened ${current.name}.${pending ? " Keeping twm open until queued removals finish." : ""}` }));
          }
        } catch {
          setState(state => ({ ...state, message: "Could not open tmux session. Check tmux and layout.sh." }));
        }
      }
      return true;
    }

    if (input === "r") {
      const current = items[selected];
      void refreshItems(current ? `Refreshed ${current.name}` : "Refreshed sources").then(applied => {
        if (applied && current?.kind === "worktree") refreshPreview(current.path);
      });
      return true;
    }

    if (input === "a") {
      if (blockCachedAction()) return true;
      const current = items[selected];
      if (current?.kind !== "worktree" || !current.available) return true;
      try {
        if (current.hasSession) throw new Error("This checkout already has a tmux session");
        const sessions = listUnassignedSessions(items.filter(item => item.kind === "worktree").map(item => item.sessionName));
        if (!sessions.length) throw new Error("No unassigned tmux sessions available");
        setState(state => ({ ...state, message: "", dialog: { kind: "assign", targetPath: current.path, sessions, selected: 0 } }));
      } catch (error) {
        setState(state => ({ ...state, message: error instanceof Error ? error.message : String(error) }));
      }
      return true;
    }

    if (input === "d") {
      if (blockCachedAction()) return true;
      if (items[selected]?.kind === "worktree") {
        setState((current) => ({
          ...current,
          dialog: { kind: "confirm", mode: "kill", targetPath: items[selected]!.path, targetName: items[selected]!.name },
        }));
      }
      return true;
    }

    if (input === "x") {
      if (blockCachedAction()) return true;
      const current = items[selected];
      if (current?.kind === "worktree") {
        if (!current.available) {
          setState(state => ({ ...state, message: "Worktree directory is unavailable. Restore it before removing." }));
          return true;
        }
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

        const requestGeneration = inputGeneration.current;
        void (async () => {
          const blockedReason = await removalBlockedReason(current.path);
          setState((currentState) => {
            if (inputGeneration.current !== requestGeneration || currentState.dialog.kind !== "none" ||
                currentState.items[currentState.selected]?.path !== current.path) {
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
                : { kind: "confirm", mode: "remove", targetPath: current.path, targetName: current.name },
            };
          });
        })();
      }
      return true;
    }

    if (input === "c") {
      if (blockCachedAction()) return true;
      if (!items[selected]?.available) return true;
      setState((current) => ({
        ...current,
        dialog: {
          kind: "create",
          sourcePath: items[selected]!.path,
          worktreeName: "",
          branchName: "",
          baseRef: "",
          field: "worktreeName",
          sessionMode: "none",
        },
        message: "",
      }));
      return true;
    }

    return false;
  };

  useInput((input, key) => {
    inputGeneration.current++;
    if (key.ctrl && input === "c") {
      if (useTwmStore.getState().removingPaths.length) setState(state => ({ ...state, message: "Removals pending; wait before closing." }));
      else exit();
      return;
    }
    if (loading) {
      if (input === "q" || key.escape) exit();
      return;
    }
    if (dialog.kind === "running") return;
    const pending = useTwmStore.getState().removingPaths;
    if (pending.length && dialog.kind === "none") {
      if (key.escape || input === "q") {
        setState(state => ({ ...state, message: "Removals pending; wait before closing." }));
        return;
      }
      if (["c", "d", "a", "r"].includes(input) || view === "sources" && input === "x") {
        setState(state => ({ ...state, message: "Removals pending; opening other worktrees and queueing removals is available. Other changes wait." }));
        return;
      }
      if (view === "worktrees" && (key.return || input === "x") && pending.includes(items[selected]?.path ?? "")) {
        setState(state => ({ ...state, message: "This worktree is already queued for removal." }));
        return;
      }
    }

    if (dialog.kind === "assign") {
      if (key.escape || input === "q") cancelDialog();
      else if (key.downArrow || input === "j" || key.upArrow || input === "k") {
        const delta = key.downArrow || input === "j" ? 1 : -1;
        setState(state => state.dialog.kind === "assign" ? { ...state, dialog: { ...state.dialog,
          selected: Math.max(0, Math.min(state.dialog.sessions.length - 1, state.dialog.selected + delta)) } } : state);
      } else if (key.return) {
        try {
          const session = dialog.sessions[dialog.selected];
          if (!session) return;
          const latest = useTwmStore.getState();
          if (latest.cachedList) throw new Error("Wait for fresh repository state before assigning");
          const target = latest.items.find(item => item.path === dialog.targetPath && item.kind === "worktree" && item.available);
          if (!target) throw new Error("Checkout is no longer available");
          assignSession(target.path, session, latest.items.filter(item => item.kind === "worktree").map(item => item.sessionName));
          refreshPreview(target.path);
          setState(state => ({ ...state, dialog: { kind: "none" }, message: `Assigned ${session.name} to ${target.name}.` }));
          void controller.refreshLiveState();
        } catch (error) {
          setState(state => ({ ...state, dialog: { kind: "none" }, message: error instanceof Error ? error.message : String(error) }));
        }
      }
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
