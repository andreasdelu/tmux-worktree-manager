import React from "react";
import { Box, Text } from "ink";
import type { DialogState, Item, SourceEntry, ViewMode } from "./types";
import { AddSourceDialog } from "./components/AddSourceDialog";
import {
  confirmDialogSubtitle,
  confirmDialogTitle,
} from "./components/ConfirmDialog";
import { CreateWorktreeDialog } from "./components/CreateWorktreeDialog";
import { runningDialogSubtitle } from "./components/RunningDialog";
import { SourceDetails } from "./components/SourceDetails";
import { WorktreeDetails } from "./components/WorktreeDetails";
import { WorktreeEmptyState } from "./components/WorktreeEmptyState";

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
}: SidebarPaneProps) => {
  let lastGroup = "";

  return (
    <Box
      flexDirection="column"
      width={isSplit ? "33%" : undefined}
      flexGrow={isSplit ? 0 : 1}
      minHeight={isSplit ? mainPanelsHeight : undefined}
      borderStyle="round"
      borderColor="gray"
      paddingX={1}
    >
      <Box marginBottom={1}>
        {view === "worktrees" ? (
          <Box flexDirection="row" gap={1}>
            <Text color="blue">Worktrees</Text>
            <Text color="gray">|</Text>
            <Text color="gray">Sources</Text>
          </Box>
        ) : (
          <Box flexDirection="row" gap={1}>
            <Text color="gray">Worktrees</Text>
            <Text color="gray">|</Text>
            <Text color="blue">Sources</Text>
          </Box>
        )}
      </Box>
      {view === "worktrees" ? (
        loading ? (
          <>
            <Text color="cyan">{loadingGlyph} Loading worktrees…</Text>
            <Text color="gray">
              Scanning configured repositories and linked worktrees.
            </Text>
          </>
        ) : (
          visibleRows.map((item, idx) => {
            const absoluteIndex = visibleStart + idx;
            const showGroup = item.group !== lastGroup;
            const isSelected = absoluteIndex === selected;
            lastGroup = item.group;

            return (
              <Box
                key={item.path}
                flexDirection="column"
                marginTop={showGroup && absoluteIndex !== 0 ? 1 : 0}
              >
                {showGroup ? (
                  <Box>
                    <Text bold color="gray">
                      {item.group}
                    </Text>
                  </Box>
                ) : null}
                <Box
                  paddingLeft={1}
                  paddingRight={1}
                  backgroundColor={isSelected ? "#12363a" : undefined}
                >
                  <Text color={isSelected ? "cyan" : "gray"}>
                    {isSelected ? "› " : "  "}
                  </Text>
                  <Text
                    bold={item.kind === "worktree"}
                    color={
                      isSelected
                        ? "white"
                        : item.kind === "source-empty"
                          ? "gray"
                          : undefined
                    }
                  >
                    {item.name}
                  </Text>
                  {item.hasSession ? (
                    <Text color={isSelected ? "cyan" : "gray"}> ●</Text>
                  ) : null}
                </Box>
              </Box>
            );
          })
        )
      ) : sources.length > 0 ? (
        sources.map((source, index) => {
          const isSelected = index === selectedSource;
          return (
            <Box key={`${source.resolvedPath}:${index}`}>
              <Text color={isSelected ? "cyan" : "gray"}>
                {isSelected ? "› " : "  "}
              </Text>
              <Text bold color={isSelected ? "white" : undefined}>
                {source.path}
              </Text>
            </Box>
          );
        })
      ) : (
        <Text color="gray">No repo roots configured yet.</Text>
      )}
    </Box>
  );
};

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

export const HelpLine = ({ view, keybindLegendHeight, current }: HelpLineProps) => (
  <Box paddingX={1} flexDirection="column" minHeight={keybindLegendHeight}>
    <Text color="gray">
      {view === "worktrees"
        ? current?.kind === "source-empty"
          ? "tab sources • j/k move • c create first worktree • q quit"
          : "tab sources • j/k move • enter open • r refresh • c create • d close tmux • x remove worktree • q quit"
        : "tab worktrees • j/k move • a add source • x remove source • q quit"}
    </Text>
  </Box>
);

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
  if (dialog.kind === "none") {
    return null;
  }

  const title = dialog.kind === "add-source"
    ? "Add repo root"
    : dialog.kind === "create"
      ? "Create worktree"
      : dialog.kind === "confirm"
        ? confirmDialogTitle({ mode: dialog.mode, currentName: current?.name })
        : dialog.label || "Working…";

  const subtitle = dialog.kind === "add-source"
    ? "Add a repository root so its linked worktrees can appear in the picker."
    : dialog.kind === "create" && current
      ? current.kind === "source-empty"
        ? `Create the first linked worktree from ${current.group}.`
        : `Create a new worktree from ${current.group}.`
      : dialog.kind === "confirm"
        ? confirmDialogSubtitle({ mode: dialog.mode })
        : runningDialogSubtitle();

  const footer = dialog.kind === "add-source"
    ? "enter save • esc cancel"
    : dialog.kind === "create"
      ? "enter create • esc cancel"
      : dialog.kind === "confirm"
        ? "y confirm • n cancel • esc cancel"
        : "";

  const borderColor = dialog.kind === "running"
    ? "cyan"
    : dialog.kind === "confirm"
      ? "yellow"
      : "gray";

  return (
    <Box
      position="absolute"
      top={Math.max(2, Math.floor(rootHeight / 5))}
      left={2}
      right={2}
      justifyContent="center"
    >
      <Box
        width={isSplit ? 75 : undefined}
        borderStyle="round"
        borderColor={borderColor}
        paddingX={2}
        paddingY={1}
        flexDirection="column"
        backgroundColor="#1D1D20"
      >
        <Text bold color={dialog.kind === "running" ? "cyan" : "white"}>
          {dialog.kind === "running" ? `${loadingGlyph} ${title}` : title}
        </Text>
        {subtitle ? (
          <Box marginTop={1}>
            <Text color="gray">{subtitle}</Text>
          </Box>
        ) : null}

        {dialog.kind === "add-source" ? (
          <AddSourceDialog value={dialog.value} />
        ) : dialog.kind === "create" ? (
          <CreateWorktreeDialog
            value={dialog.value}
            createTargetPath={createTargetPath}
          />
        ) : null}

        {footer ? (
          <Box marginTop={1}>
            <Text color="gray">{footer}</Text>
          </Box>
        ) : null}
      </Box>
    </Box>
  );
};
