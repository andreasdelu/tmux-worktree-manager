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
  const stackedPaneGap = 0;
  const sidebarPaneHeight = isSplit
    ? mainPanelsHeight
    : Math.max(7, Math.floor(mainPanelsHeight * 0.55));
  const detailsPaneHeight = isSplit
    ? mainPanelsHeight
    : Math.max(6, mainPanelsHeight - sidebarPaneHeight - stackedPaneGap);
  const sidebarRowsTarget = Math.max(3, sidebarPaneHeight - 4);

  const controller = useTwmController();

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
        gap={isSplit ? 1 : 0}
        height={mainPanelsHeight}
        overflow="hidden"
      >
        <SidebarPane
          isSplit={isSplit}
          mainPanelsHeight={sidebarPaneHeight}
          sourceRowsTarget={sidebarRowsTarget}
        />
        <DetailsPane
          isSplit={isSplit}
          mainPanelsHeight={detailsPaneHeight}
        />
      </Box>

      <StatusLine statusBoxHeight={statusBoxHeight} />

      <HelpLine keybindLegendHeight={keybindLegendHeight} />

      <DialogOverlay rootHeight={rootHeight} isSplit={isSplit} />
    </Box>
  );
};

if (process.stdout.isTTY) {
  process.stdout.write("\u001b[H");
}

render(<App />, { alternateScreen: true, incrementalRendering: true });
