import React from "react";
import { Box, Text } from "ink";
import type { ActionMode, Item, SourceEntry, ViewMode } from "./types";

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
                  <Text bold color={isSelected ? "white" : undefined}>
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
        <>
          <Box flexDirection="row">
            <Text color="gray">{current.group}\</Text>
            <Text bold color="cyan">
              {current.name}
            </Text>
          </Box>
          {previewPath ? <Text color="gray">{previewPath}</Text> : null}
          <Text> </Text>
          {showPreviewLoading ? (
            <Box flexDirection="column">
              <Text color="cyan">{loadingGlyph} Loading details…</Text>
              <Text color="gray">
                Fetching branch, status, last commit, and changed files.
              </Text>
            </Box>
          ) : (
            <>
              <Text bold color="gray">
                Overview
              </Text>
              {previewMetaRows.map((row, index) => (
                <Box key={`${current.path}:meta:${index}`}>
                  <Text color="gray">{row.label.padEnd(8, " ")}</Text>
                  <Text>{row.value}</Text>
                </Box>
              ))}

              <Box flexDirection="column" marginTop={1}>
                <Text bold color="gray">
                  Changes
                </Text>
                {previewChanges.length > 0 ? (
                  <>
                    {previewChanges.map((line, index) => {
                      const match = line.match(/^\s*([A-Z\?]{1,2})\s+(.*)$/);
                      if (match) {
                        return (
                          <Box key={`${current.path}:change:${index}`}>
                            <Text color="gray">{match[1].padEnd(4, " ")}</Text>
                            <Text>{match[2]}</Text>
                          </Box>
                        );
                      }

                      return (
                        <Text key={`${current.path}:change:${index}`}>
                          {line}
                        </Text>
                      );
                    })}
                    {hiddenPreviewChanges > 0 ? (
                      <Text color="gray">
                        +{hiddenPreviewChanges} more changes
                      </Text>
                    ) : null}
                  </>
                ) : (
                  <Text color="gray">No uncommitted changes</Text>
                )}
              </Box>
            </>
          )}
        </>
      ) : (
        <Text>No worktrees found.</Text>
      )
    ) : currentSource ? (
      <>
        <Text bold color="cyan">
          {currentSource.path}
        </Text>
        <Text> </Text>
        <Box>
          <Text color="gray">Status </Text>
          <Text color={currentSource.valid ? "green" : "yellow"}>
            {currentSource.valid ? "ready" : currentSource.issue}
          </Text>
        </Box>
        {currentSource.resolvedPath !== currentSource.path ? (
          <Box>
            <Text color="gray">Resolved </Text>
            <Text>{formatPath(currentSource.resolvedPath)}</Text>
          </Box>
        ) : null}
        {!currentSource.valid ? (
          <Box marginTop={1}>
            <Text color="gray">
              Add the actual git repo root, not a child folder inside it.
            </Text>
          </Box>
        ) : null}
      </>
    ) : (
      <Text color="gray">Add a repo root to start browsing more repos.</Text>
    )}
  </Box>
);

type StatusLineProps = {
  message: string;
  actionLoading: boolean;
  actionLabel: string;
  dialogOpen: boolean;
  view: ViewMode;
  statusBoxHeight: number;
};

export const StatusLine = ({
  message,
  actionLoading,
  actionLabel,
  dialogOpen,
  view,
  statusBoxHeight,
}: StatusLineProps) => (
  <Box
    minHeight={statusBoxHeight}
    borderStyle="round"
    borderColor="gray"
    paddingX={1}
  >
    <Text color={message || actionLoading ? "cyan" : "gray"}>
      {message
        ? message
        : actionLoading
          ? actionLabel || "Working…"
          : dialogOpen
            ? "Dialog open. Press esc to cancel."
            : view === "worktrees"
              ? "Ready."
              : "Sources mode."}
    </Text>
  </Box>
);

type HelpLineProps = { view: ViewMode; keybindLegendHeight: number };

export const HelpLine = ({ view, keybindLegendHeight }: HelpLineProps) => (
  <Box paddingX={1} flexDirection="column" minHeight={keybindLegendHeight}>
    <Text color="gray">
      {view === "worktrees"
        ? "tab sources • j/k move • enter open • r refresh • c create • d close tmux • x remove worktree • q quit"
        : "tab worktrees • j/k move • a add source • x remove source • q quit"}
    </Text>
  </Box>
);

type DialogOverlayProps = {
  dialogOpen: boolean;
  rootHeight: number;
  isSplit: boolean;
  addingSource: boolean;
  creating: boolean;
  confirming: ActionMode;
  actionLoading: boolean;
  current?: Item;
  sourceInput: string;
  createName: string;
  actionLabel: string;
  loadingGlyph: string;
};

export const DialogOverlay = ({
  dialogOpen,
  rootHeight,
  isSplit,
  addingSource,
  creating,
  confirming,
  actionLoading,
  current,
  sourceInput,
  createName,
  actionLabel,
  loadingGlyph,
}: DialogOverlayProps) => {
  if (!dialogOpen) {
    return null;
  }

  const title = addingSource
    ? "Add repo root"
    : creating
      ? "Create worktree"
      : confirming === "kill"
        ? `Close tmux session for ${current?.name}?`
        : confirming === "remove"
          ? `Remove clean linked worktree ${current?.name}?`
          : actionLoading
            ? actionLabel || "Working…"
            : "";

  const subtitle = addingSource
    ? "Add a repository root so its linked worktrees can appear in the picker."
    : creating && current
      ? `Create a new worktree from ${current.group}.`
      : confirming === "kill"
        ? "This only closes the matching tmux session."
        : confirming === "remove"
          ? "This removes the linked worktree after the safety checks pass."
          : actionLoading
            ? "Please wait while the action completes."
            : "";

  const footer = addingSource
    ? "enter save • esc cancel"
    : creating
      ? "enter create • esc cancel"
      : confirming !== "none"
        ? "y confirm • n cancel • esc cancel"
        : "";

  const borderColor = actionLoading
    ? "cyan"
    : confirming !== "none"
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
        <Text bold color={actionLoading ? "cyan" : "white"}>
          {actionLoading ? `${loadingGlyph} ${title}` : title}
        </Text>
        {subtitle ? (
          <Box marginTop={1}>
            <Text color="gray">{subtitle}</Text>
          </Box>
        ) : null}

        {addingSource ? (
          <Box flexDirection="column" marginTop={1}>
            <Text color="gray">Repository path</Text>
            <Box borderStyle="round" borderColor="gray" paddingX={1}>
              <Text color="white">{sourceInput || "_"}</Text>
            </Box>
          </Box>
        ) : creating ? (
          <Box flexDirection="column" marginTop={1}>
            <Text color="gray">Branch name</Text>
            <Box borderStyle="round" borderColor="gray" paddingX={1}>
              <Text color="white">{createName || "_"}</Text>
            </Box>
          </Box>
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
