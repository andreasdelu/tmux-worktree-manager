import React from "react";
import { render, Box, useApp } from "ink";
import { ensureConfigDefaults } from "./config";
import {
  DetailsPane,
  DialogOverlay,
  HelpLine,
  SidebarPane,
  StatusLine,
} from "./ui";
import { formatPath } from "./lib/sources";
import { useTwmController } from "./useTwmController";
import { useTwmInput } from "./useTwmInput";

ensureConfigDefaults();

const App = () => {
  const { exit } = useApp();

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

  const controller = useTwmController(listRowsTarget);

  useTwmInput({ exit, controller });

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
          view={controller.view}
          loading={controller.state.loading}
          loadingGlyph={controller.loadingGlyph}
          visibleRows={controller.visible.rows}
          visibleStart={controller.visible.start}
          selected={controller.state.selected}
          sources={controller.sources}
          selectedSource={controller.selectedSource}
          isSplit={isSplit}
          mainPanelsHeight={mainPanelsHeight}
        />
        <DetailsPane
          view={controller.view}
          current={controller.current}
          currentSource={controller.currentSource}
          isSplit={isSplit}
          mainPanelsHeight={mainPanelsHeight}
          previewPath={controller.previewPath}
          showPreviewLoading={controller.showPreviewLoading}
          loadingGlyph={controller.loadingGlyph}
          previewMetaRows={controller.previewMetaRows}
          previewChanges={controller.previewChanges}
          hiddenPreviewChanges={controller.hiddenPreviewChanges}
          formatPath={formatPath}
          createTargetPath={controller.createTargetPath}
        />
      </Box>

      <StatusLine
        message={controller.state.message}
        dialog={controller.state.dialog}
        view={controller.view}
        statusBoxHeight={statusBoxHeight}
      />

      <HelpLine
        view={controller.view}
        keybindLegendHeight={keybindLegendHeight}
        current={controller.current}
      />

      <DialogOverlay
        dialog={controller.state.dialog}
        rootHeight={rootHeight}
        isSplit={isSplit}
        current={controller.current}
        createTargetPath={controller.createTargetPath}
        loadingGlyph={controller.loadingGlyph}
      />
    </Box>
  );
};

if (process.stdout.isTTY) {
  process.stdout.write("\u001b[H");
}

render(<App />, { alternateScreen: true, incrementalRendering: true });
