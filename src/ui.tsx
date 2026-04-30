import React, { useMemo } from "react";
import { Box, Text } from "ink";
import { overwatchEnabled } from "./config";
import { theme } from "./theme";
import { currentVersion } from "./version";
import type { Item, SourceEntry, ViewMode } from "./types";
import { formatPath } from "./lib/sources";
import { suggestedCreateTargetDir } from "./lib/actions";
import { useTwmStore } from "./store";
import { AddSourceOverlay } from "./components/AddSourceOverlay";
import { ConfirmOverlay } from "./components/ConfirmOverlay";
import { CreateWorktreeOverlay } from "./components/CreateWorktreeOverlay";
import { NoticeOverlay } from "./components/NoticeOverlay";
import { RunningOverlay } from "./components/RunningOverlay";
import { SidebarTabs } from "./components/SidebarTabs";
import { SourceDetails } from "./components/SourceDetails";
import { SourceSidebar } from "./components/SourceSidebar";
import { PiDetails } from "./components/PiDetails";
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

    return suggestedCreateTargetDir(
      current.path,
      dialog.kind === "create"
        ? dialog.worktreeName || "<worktree>"
        : "<worktree>",
    );
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
      width={isSplit ? "33%" : undefined}
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
  const previewPathRaw = useTwmStore((state) => state.previewPath);
  const previewLoading = useTwmStore((state) => state.previewLoading);
  const createTargetPath = useCreateTargetPath(current);
  const showPiPane =
    overwatchEnabled && view === "worktrees" && current?.kind === "worktree";
  const piHeight = showPiPane
    ? Math.max(4, Math.floor(mainPanelsHeight * 0.35))
    : 0;
  const detailsHeight = showPiPane
    ? Math.max(3, mainPanelsHeight - piHeight)
    : mainPanelsHeight;
  const previewMatchesCurrent = current?.kind === "worktree"
    ? previewPathRaw === current.path && !previewLoading
    : false;
  const effectivePreview = previewMatchesCurrent ? preview : null;
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

  return (
    <Box
      flexDirection="column"
      width={isSplit ? "67%" : undefined}
      flexGrow={1}
      height={mainPanelsHeight}
      overflow="hidden"
    >
      <Box
        flexDirection="column"
        height={detailsHeight}
        overflow="hidden"
        borderStyle="round"
        borderColor={theme.colors.border}
        paddingX={1}
      >
        <Box marginBottom={1}>
          <Text color={theme.colors.primary}>
            {view === "worktrees" ? "Details" : "Source details"}
          </Text>
        </Box>
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
      </Box>

      {showPiPane ? (
        <Box
          flexDirection="column"
          height={piHeight}
          overflow="hidden"
          borderStyle="round"
          borderColor={theme.colors.border}
          paddingX={1}
        >
          <Box marginBottom={1}>
            <Text color={theme.colors.primary}>Pi Overwatch</Text>
          </Box>
          {current ? (
            <PiDetails current={current} />
          ) : null}
        </Box>
      ) : null}
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
  const baseStatus = message
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
  const worktreeLegend =
    current?.kind === "source-empty"
      ? "tab sources • j/k move • c create first worktree • q quit"
      : current?.kind === "worktree"
        ? [
            "tab sources",
            "j/k move",
            "enter open",
            "r refresh",
            "c create worktree",
            current.hasSession ? "d close tmux" : null,
            current.isPrimary ? null : "x remove worktree",
            "q quit",
          ]
            .filter((part): part is string => part !== null)
            .join(" • ")
        : "tab sources • j/k move • q quit";

  return (
    <Box paddingX={1} flexDirection="column" minHeight={keybindLegendHeight}>
      <Text color={theme.colors.secondary}>
        {view === "worktrees"
          ? worktreeLegend
          : "tab worktrees • j/k move • a add source • x remove source • q quit"}
      </Text>
    </Box>
  );
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
  const current = useCurrentItem();
  const createTargetPath = useCreateTargetPath(current);

  switch (dialog.kind) {
    case "none":
      return null;
    case "add-source":
      return (
        <AddSourceOverlay
          rootHeight={rootHeight}
          isSplit={isSplit}
          value={dialog.value}
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
          activeField={dialog.field}
          createTargetPath={createTargetPath}
        />
      );
    case "confirm":
      return (
        <ConfirmOverlay
          rootHeight={rootHeight}
          isSplit={isSplit}
          mode={dialog.mode}
          currentName={current?.name}
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
