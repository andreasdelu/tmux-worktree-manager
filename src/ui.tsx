import React from "react";
import { Box, Text } from "ink";
import type { DialogState, Item, SourceEntry, ViewMode } from "./types";
import { AddSourceOverlay } from "./components/AddSourceOverlay";
import { ConfirmOverlay } from "./components/ConfirmOverlay";
import { CreateWorktreeOverlay } from "./components/CreateWorktreeOverlay";
import { NoticeOverlay } from "./components/NoticeOverlay";
import { RunningOverlay } from "./components/RunningOverlay";
import { SidebarTabs } from "./components/SidebarTabs";
import { SourceDetails } from "./components/SourceDetails";
import { SourceSidebar } from "./components/SourceSidebar";
import { WorktreeDetails } from "./components/WorktreeDetails";
import { WorktreeEmptyState } from "./components/WorktreeEmptyState";
import { WorktreeSidebar } from "./components/WorktreeSidebar";

type PreviewMetaRow = { label: string; value: string };

type SidebarPaneProps = {
  view: ViewMode;
  loading: boolean;
  loadingGlyph: string;
  visibleRows: Item[];
  visibleStart: number;
  selected: number;
  sources: SourceEntry[];
  selectedSource: number;
  isSplit: boolean;
  mainPanelsHeight: number;
};

export const SidebarPane = ({
  view,
  loading,
  loadingGlyph,
  visibleRows,
  visibleStart,
  selected,
  sources,
  selectedSource,
  isSplit,
  mainPanelsHeight,
}: SidebarPaneProps) => (
  <Box
    flexDirection="column"
    width={isSplit ? "33%" : undefined}
    flexGrow={isSplit ? 0 : 1}
    minHeight={isSplit ? mainPanelsHeight : undefined}
    borderStyle="round"
    borderColor="gray"
    paddingX={1}
  >
    <SidebarTabs view={view} />
    {view === "worktrees" ? (
      <WorktreeSidebar
        loading={loading}
        loadingGlyph={loadingGlyph}
        visibleRows={visibleRows}
        visibleStart={visibleStart}
        selected={selected}
      />
    ) : (
      <SourceSidebar
        sources={sources}
        selectedSource={selectedSource}
      />
    )}
  </Box>
);

type DetailsPaneProps = {
  view: ViewMode;
  current?: Item;
  currentSource?: SourceEntry;
  isSplit: boolean;
  mainPanelsHeight: number;
  previewPath: string;
  showPreviewLoading: boolean;
  loadingGlyph: string;
  previewMetaRows: PreviewMetaRow[];
  previewChanges: string[];
  hiddenPreviewChanges: number;
  formatPath: (itemPath: string) => string;
  createTargetPath: string;
};

export const DetailsPane = ({
  view,
  current,
  currentSource,
  isSplit,
  mainPanelsHeight,
  previewPath,
  showPreviewLoading,
  loadingGlyph,
  previewMetaRows,
  previewChanges,
  hiddenPreviewChanges,
  formatPath,
  createTargetPath,
}: DetailsPaneProps) => (
  <Box
    flexDirection="column"
    width={isSplit ? "67%" : undefined}
    flexGrow={1}
    minHeight={isSplit ? mainPanelsHeight : undefined}
    borderStyle="round"
    borderColor="gray"
    paddingX={1}
  >
    <Box marginBottom={1}>
      <Text color="blue">
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
            loadingGlyph={loadingGlyph}
            previewMetaRows={previewMetaRows}
            previewChanges={previewChanges}
            hiddenPreviewChanges={hiddenPreviewChanges}
          />
        )
      ) : (
        <Text>No worktrees found.</Text>
      )
    ) : (
      <SourceDetails currentSource={currentSource} formatPath={formatPath} />
    )}
  </Box>
);

type StatusLineProps = {
  message: string;
  dialog: DialogState;
  view: ViewMode;
  statusBoxHeight: number;
};

export const StatusLine = ({
  message,
  dialog,
  view,
  statusBoxHeight,
}: StatusLineProps) => (
  <Box
    minHeight={statusBoxHeight}
    borderStyle="round"
    borderColor="gray"
    paddingX={1}
  >
    <Text color={message || dialog.kind === "running" ? "cyan" : "gray"}>
      {message
        ? message
        : dialog.kind === "running"
          ? dialog.label || "Working…"
          : dialog.kind !== "none"
            ? "Dialog open. Press esc to cancel."
            : view === "worktrees"
              ? "Ready."
              : "Sources mode."}
    </Text>
  </Box>
);

type HelpLineProps = {
  view: ViewMode;
  keybindLegendHeight: number;
  current?: Item;
};

export const HelpLine = ({ view, keybindLegendHeight, current }: HelpLineProps) => {
  const worktreeLegend = current?.kind === "source-empty"
    ? "tab sources • j/k move • c create first worktree • q quit"
    : current?.kind === "worktree"
      ? [
          "tab sources",
          "j/k move",
          "enter open",
          "r refresh",
          "c create worktree",
          current.hasSession ? "d close tmux" : null,
          "x remove worktree",
          "q quit",
        ]
          .filter((part): part is string => part !== null)
          .join(" • ")
      : "tab sources • j/k move • q quit";

  return (
    <Box paddingX={1} flexDirection="column" minHeight={keybindLegendHeight}>
      <Text color="cyanBright">
        {view === "worktrees"
          ? worktreeLegend
          : "tab worktrees • j/k move • a add source • x remove source • q quit"}
      </Text>
    </Box>
  );
};

type DialogOverlayProps = {
  dialog: DialogState;
  rootHeight: number;
  isSplit: boolean;
  current?: Item;
  createTargetPath: string;
  loadingGlyph: string;
};

export const DialogOverlay = ({
  dialog,
  rootHeight,
  isSplit,
  current,
  createTargetPath,
  loadingGlyph,
}: DialogOverlayProps) => {
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
          value={dialog.value}
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
          loadingGlyph={loadingGlyph}
          label={dialog.label}
        />
      );
  }
};
