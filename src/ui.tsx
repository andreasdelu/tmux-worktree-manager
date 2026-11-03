import React, { useEffect, useMemo } from "react";
import path from "node:path";
import { Box, Text } from "ink";
import { theme } from "./theme";
import { currentVersion } from "./version";
import type { Item, SourceEntry, ViewMode } from "./types";
import { formatPath } from "./lib/sources";
import { freshChildState } from "./lib/agents";
import { useTwmStore } from "./store";
import { AddSourceOverlay } from "./components/AddSourceOverlay";
import { AssignSessionOverlay } from "./components/AssignSessionOverlay";
import { ConfirmOverlay } from "./components/ConfirmOverlay";
import { CreateWorktreeOverlay } from "./components/CreateWorktreeOverlay";
import { NoticeOverlay } from "./components/NoticeOverlay";
import { RunningOverlay } from "./components/RunningOverlay";
import { SidebarTabs } from "./components/SidebarTabs";
import { SourceDetails } from "./components/SourceDetails";
import { SourceSidebar } from "./components/SourceSidebar";
import { PiDetails } from "./components/PiDetails";
import { KeyHint, type KeyHintItem } from "./components/KeyHint";
import { PullRequestDetails } from "./components/PullRequestDetails";
import { DetailsViewport } from "./components/DetailsViewport";
import { WorktreeDetails } from "./components/WorktreeDetails";
import { WorktreeEmptyState } from "./components/WorktreeEmptyState";
import { WorktreeSidebar } from "./components/WorktreeSidebar";

type PreviewMetaRow = { label: string; value: string };

const visibleWorktreeRows = (
  items: Item[],
  selectedIndex: number,
  listRowsTarget: number,
) => {
  if (items.length === 0) {
    return { start: 0, end: 0, rows: [] };
  }

  const selected = Math.min(selectedIndex, items.length - 1);
  const sliceHeight = (start: number, end: number) => {
    let height = 0;
    let lastGroup = "";

    for (let index = start; index < end; index++) {
      const item = items[index];
      const showGroup = item.group !== lastGroup;

      if (showGroup) {
        if (index !== start) {
          height += 1;
        }

        height += 1;
        lastGroup = item.group;
      }

      height += 1;
    }

    return height;
  };

  let start = selected;
  let end = selected + 1;

  while (start > 0 || end < items.length) {
    const previousStart = start - 1;
    const nextEnd = end + 1;
    const canAddPrevious =
      start > 0 && sliceHeight(previousStart, end) <= listRowsTarget;
    const canAddNext =
      end < items.length && sliceHeight(start, nextEnd) <= listRowsTarget;

    if (!canAddPrevious && !canAddNext) {
      break;
    }

    const linesBefore = selected - start;
    const linesAfter = end - selected - 1;

    if (canAddPrevious && (!canAddNext || linesBefore <= linesAfter)) {
      start = previousStart;
    } else {
      end = nextEnd;
    }
  }

  return {
    start,
    end,
    rows: items.slice(start, end),
  };
};

const useCurrentItem = () =>
  useTwmStore((state) => state.items[state.selected]);

const useCreateTargetPath = (current?: Item) => {
  const dialog = useTwmStore((state) => state.dialog);

  return useMemo(() => {
    if (!current) {
      return "";
    }

    if (!(current.kind === "source-empty" || dialog.kind === "create")) {
      return "";
    }

    return path.join(current.createRoot,
      dialog.kind === "create" ? dialog.worktreeName || "<worktree>" : "<worktree>");
  }, [current?.path, current?.kind, dialog.kind, dialog.kind === "create" ? dialog.worktreeName : ""]);
};

type SidebarPaneProps = {
  isSplit: boolean;
  mainPanelsHeight: number;
  sourceRowsTarget: number;
};

export const SidebarPane = ({
  isSplit,
  mainPanelsHeight,
  sourceRowsTarget,
}: SidebarPaneProps) => {
  const view = useTwmStore((state) => state.view);
  const loading = useTwmStore((state) => state.loading);
  const items = useTwmStore((state) => state.items);
  const selected = useTwmStore((state) => state.selected);
  const sources = useTwmStore((state) => state.sources);
  const selectedSource = useTwmStore((state) => state.selectedSource);
  const visible = useMemo(
    () => visibleWorktreeRows(items, selected, sourceRowsTarget),
    [items, selected, sourceRowsTarget],
  );

  return (
    <Box
      flexDirection="column"
      width={isSplit ? "38%" : undefined}
      flexGrow={isSplit ? 0 : 1}
      height={mainPanelsHeight}
      overflow="hidden"
      borderStyle="round"
      borderColor={theme.colors.border}
      paddingX={1}
    >
      <SidebarTabs view={view} />
      {view === "worktrees" ? (
        <WorktreeSidebar
          loading={loading}
          visibleRows={visible.rows}
          visibleStart={visible.start}
          selected={selected}
        />
      ) : (
        <SourceSidebar
          sources={sources}
          selectedSource={selectedSource}
          maxRows={sourceRowsTarget}
        />
      )}
    </Box>
  );
};

type DetailsPaneProps = {
  isSplit: boolean;
  mainPanelsHeight: number;
};

export const DetailsPane = ({
  isSplit,
  mainPanelsHeight,
}: DetailsPaneProps) => {
  const view = useTwmStore((state) => state.view);
  const current = useCurrentItem();
  const currentSource = useTwmStore((state) => state.sources[state.selectedSource]);
  const dialog = useTwmStore((state) => state.dialog);
  const preview = useTwmStore((state) => state.preview);
  const pullRequests = useTwmStore(state => current ? state.pullRequests[current.repoRoot] : undefined);
  const previewPathRaw = useTwmStore((state) => state.previewPath);
  const previewLoading = useTwmStore((state) => state.previewLoading);
  const createTargetPath = useCreateTargetPath(current);
  const cachedPreview = useTwmStore(state => state.cachedPreviewPaths.includes(current?.path ?? ""));
  const cachedPrs = useTwmStore(state => state.cachedPrRoots.includes(current?.repoRoot ?? ""));
  const showPiPane =
    view === "worktrees" && current?.kind === "worktree" && Boolean(current.agentPanes?.length || current.agentUnavailable);
  // Independent grid panel: compact for one pane, bounded on short terminals
  // so PR/Git details retain usable space. Details scrolling never moves it.
  // Reserve status/prompt/reply slots even before messages arrive, avoiding
  // a collapsed box that makes missing reporter data look like a layout bug.
  const paneCount = current?.agentPanes?.length ?? 0;
  const agentRows = (current?.agentUnavailable ? 1 : 0) + paneCount * 3 + (current?.agentPanes?.filter(pane => freshChildState(pane) === "active").length ?? 0) + Math.max(0, paneCount - 1);
  const compactPanels = mainPanelsHeight < 8;
  const minimumPanelHeight = compactPanels ? 3 : 4;
  const agentHeight = showPiPane ? Math.min((compactPanels ? 2 : 3) + agentRows,
    Math.max(0, mainPanelsHeight - minimumPanelHeight)) : 0;
  const detailsHeight = mainPanelsHeight - agentHeight;
  useEffect(() => { useTwmStore.getState().setDetailsScroll(0); }, [current?.path, view]);
  const previewMatchesCurrent = current?.kind === "worktree"
    ? previewPathRaw === current.path && !previewLoading
    : false;
  const effectivePreview = previewMatchesCurrent ? preview : null;
  const showPreviewLoading = current?.kind === "worktree" && current.available ? !effectivePreview : false;
  const previewPath = effectivePreview?.path
    ? formatPath(effectivePreview.path)
    : formatPath(current?.path ?? "");
  const previewMetaRows = [
    current?.kind === "worktree" && !current.available
      ? { label: "Status", value: "directory unavailable" } : null,
    current?.locked ? { label: "Lock", value: "worktree locked" } : null,
    current?.kind === "worktree" && current.isPrimary
      ? { label: "Role", value: "primary checkout" }
      : null,
    effectivePreview?.branch
      ? { label: "Branch", value: effectivePreview.branch }
      : null,
    effectivePreview?.base
      ? { label: "Upstream", value: effectivePreview.base }
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
    current?.kind === "worktree" && current.hasSession
      ? { label: "Session", value: current.sessionName } : null,
    effectivePreview?.last
      ? { label: "Last", value: effectivePreview.last }
      : null,
  ].filter((row): row is PreviewMetaRow => row !== null);
  const previewChanges = effectivePreview?.changes.slice(0, 5) ?? [];
  const hiddenPreviewChanges = Math.max(
    0,
    (effectivePreview?.changes.length ?? 0) - previewChanges.length,
  );

  return (
    <Box
      flexDirection="column"
      width={isSplit ? "62%" : undefined}
      flexGrow={1}
      height={mainPanelsHeight}
      overflow="hidden"
    >
      <Box
        flexDirection="column"
        height={detailsHeight}
        flexShrink={0}
        overflow="hidden"
        borderStyle="round"
        borderColor={theme.colors.border}
        paddingX={1}
      >
        {!compactPanels ? <Box>
          <Text color={theme.colors.primary}>
            {view === "worktrees" ? "Details" : "Source details"}
          </Text>
        </Box> : null}
        <DetailsViewport height={Math.max(1, detailsHeight - 4)}>
        {view === "worktrees" && (cachedPreview || cachedPrs) ? (
          <Text color={theme.colors.muted}>Cached {cachedPreview && cachedPrs ? "Git/PR" : cachedPreview ? "Git" : "PR"} state · syncing…</Text>
        ) : null}
        {view === "worktrees" ? (
          current ? (
            current.kind === "source-empty" ? (
              <WorktreeEmptyState
                current={current}
                createTargetPath={createTargetPath}
                formatPath={formatPath}
              />
            ) : (
              <WorktreeDetails
                current={current}
                previewPath={previewPath}
                showPreviewLoading={showPreviewLoading}
                previewMetaRows={previewMetaRows}
                previewChanges={previewChanges}
                hiddenPreviewChanges={hiddenPreviewChanges}
                pullRequestDetails={<PullRequestDetails branch={effectivePreview?.branch || current.branch} data={pullRequests} />}
              />
            )
          ) : (
            <Text>No worktrees found.</Text>
          )
        ) : (
          <SourceDetails
            currentSource={currentSource}
            formatPath={formatPath}
          />
        )}
        </DetailsViewport>
      </Box>
      {showPiPane && current ? <Box flexDirection="column" height={agentHeight} flexShrink={0}
        overflow="hidden" borderStyle="round" borderColor={theme.colors.border} paddingX={1}>
        {!compactPanels ? <Text color={theme.colors.primary}>Agent status</Text> : null}
        <Box flexDirection="column" height={Math.max(1, agentHeight - (compactPanels ? 2 : 3))} flexShrink={0} overflow="hidden">
          <PiDetails current={current} rows={Math.max(1, agentHeight - (compactPanels ? 2 : 3))} />
        </Box>
      </Box> : null}
    </Box>
  );
};

type StatusLineProps = {
  statusBoxHeight: number;
};

export const StatusLine = ({ statusBoxHeight }: StatusLineProps) => {
  const message = useTwmStore((state) => state.message);
  const dialog = useTwmStore((state) => state.dialog);
  const view = useTwmStore((state) => state.view);
  const updateAvailableVersion = useTwmStore((state) => state.updateAvailableVersion);
  const loading = useTwmStore(state => state.loading);
  const syncing = useTwmStore(state => state.syncing);
  const cachedList = useTwmStore(state => state.cachedList);
  const baseStatus = loading ? "Loading repositories…" : syncing ? cachedList ? "Syncing… cached list is navigable; actions wait for fresh state." : "Syncing repositories…" : message
    ? message
    : dialog.kind === "running"
      ? dialog.label || "Working…"
      : dialog.kind !== "none"
        ? "Dialog open. Press esc to cancel."
        : view === "worktrees"
          ? "Ready."
          : "Sources mode.";
  return (
    <Box
      width="100%"
      minHeight={statusBoxHeight}
      overflow="hidden"
      borderStyle="round"
      borderColor={theme.colors.border}
      paddingX={1}
      justifyContent="space-between"
    >
      <Box flexGrow={1} flexShrink={1} minWidth={0}>
        <Text
          color={
            message || dialog.kind === "running"
              ? theme.colors.accent
              : theme.colors.muted
          }
          wrap="truncate-end"
        >
          {baseStatus}
        </Text>
      </Box>
      <Box
        marginLeft={1}
        flexShrink={1}
        minWidth={0}
        height={1}
        overflow="hidden"
      >
        <Text color={theme.colors.muted} wrap="truncate-end">
          twm v{currentVersion}
        </Text>
        {updateAvailableVersion ? (
          <>
            <Text color={theme.colors.muted} wrap="truncate-end">{` | `}</Text>
            <Text color={theme.colors.accent} wrap="truncate-end">
              {`v${updateAvailableVersion} available!`}
            </Text>
          </>
        ) : null}
      </Box>
    </Box>
  );
};

type HelpLineProps = {
  keybindLegendHeight: number;
};

export const HelpLine = ({ keybindLegendHeight }: HelpLineProps) => {
  const view = useTwmStore((state) => state.view);
  const current = useCurrentItem();
  const keys: KeyHintItem[] = view === "sources" ? [
    { key: "tab", label: "worktrees" }, { key: "j/k", label: "move" },
    { key: "a", label: "add source" }, { key: "x", label: "remove source" }, { key: "q", label: "quit" },
  ] : [
    { key: "tab", label: "sources" }, { key: "j/k", label: "move" },
    { key: "h/l", label: "source" },
    ...(current?.kind === "source-empty" ? [{ key: "c", label: "create first worktree" }]
      : current?.kind === "worktree" ? [
        { key: "enter", label: "open" },
        { key: "r", label: "refresh" }, { key: "c", label: "create" }, { key: "pgup/pgdn", label: "scroll" },
        ...(current.hasSession ? [{ key: "d", label: "close tmux" }] : current.available ? [{ key: "a", label: "assign tmux" }] : []),
        ...(current.isPrimary ? [] : [{ key: "x", label: "remove" }]),
      ] : []),
    { key: "q", label: "quit" },
  ];

  return <Box width="100%" paddingX={1} flexDirection="column" height={keybindLegendHeight} flexShrink={0} overflow="hidden">
    <KeyHint keys={keys} />
  </Box>;
};

type DialogOverlayProps = {
  rootHeight: number;
  isSplit: boolean;
};

export const DialogOverlay = ({
  rootHeight,
  isSplit,
}: DialogOverlayProps) => {
  const dialog = useTwmStore((state) => state.dialog);
  const selectedItem = useCurrentItem();
  const items = useTwmStore(state => state.items);
  const current = dialog.kind === "create" ? items.find(item => item.path === dialog.sourcePath) : selectedItem;
  const createTargetPath = useCreateTargetPath(current);

  switch (dialog.kind) {
    case "none":
      return null;
    case "assign":
      return <AssignSessionOverlay rootHeight={rootHeight} isSplit={isSplit} sessions={dialog.sessions} selected={dialog.selected} />;
    case "add-source":
      return (
        <AddSourceOverlay
          rootHeight={rootHeight}
          isSplit={isSplit}
          value={dialog.value}
          cursor={dialog.cursor}
        />
      );
    case "create":
      return (
        <CreateWorktreeOverlay
          rootHeight={rootHeight}
          isSplit={isSplit}
          current={current}
          worktreeName={dialog.worktreeName}
          branchName={dialog.branchName}
          baseRef={dialog.baseRef}
          activeField={dialog.field}
          sessionMode={dialog.sessionMode}
          cursor={dialog.cursor}
          createTargetPath={createTargetPath}
        />
      );
    case "confirm":
      return (
        <ConfirmOverlay
          rootHeight={rootHeight}
          isSplit={isSplit}
          mode={dialog.mode}
          currentName={dialog.targetName}
        />
      );
    case "notice":
      return (
        <NoticeOverlay
          rootHeight={rootHeight}
          isSplit={isSplit}
          title={dialog.title}
          message={dialog.message}
        />
      );
    case "running":
      return (
        <RunningOverlay
          rootHeight={rootHeight}
          isSplit={isSplit}
          label={dialog.label}
        />
      );
  }
};
