import { useEffect, useMemo, useRef } from "react";
import { Box, Text } from "ink";
import type { DOMElement } from "ink";
import { loadingFrameIntervalMs, loadingFrames } from "../config";

type SpinnerColor = "cyan" | "green" | "yellow" | "red" | "gray" | "white";

type SpinnerProps = {
  active?: boolean;
  color?: SpinnerColor;
};

type SpinnerRegistration = {
  node: { current: DOMElement | null };
  color: SpinnerColor;
};

const foregroundAnsi: Record<SpinnerColor, string> = {
  cyan: "\u001b[36m",
  green: "\u001b[32m",
  yellow: "\u001b[33m",
  red: "\u001b[31m",
  gray: "\u001b[90m",
  white: "\u001b[37m",
};

let currentFrame = 0;
let interval: Timer | null = null;
const spinners = new Set<SpinnerRegistration>();

const absolutePosition = (node: DOMElement | null) => {
  if (!node) {
    return null;
  }

  let left = 0;
  let top = 0;
  let current: DOMElement | undefined = node;

  while (current) {
    left += current.yogaNode?.getComputedLeft() ?? 0;
    top += current.yogaNode?.getComputedTop() ?? 0;
    current = current.parentNode;
  }

  return { left, top };
};

const paintAt = (node: DOMElement | null, frame: string, color: SpinnerColor) => {
  if (!process.stdout.isTTY) {
    return;
  }

  const position = absolutePosition(node);
  if (!position) {
    return;
  }

  process.stdout.write(
    `\u001b7\u001b[${position.top + 1};${position.left + 1}H${foregroundAnsi[color]}${frame}\u001b[39m\u001b8`,
  );
};

const paintSpinner = (spinner: SpinnerRegistration) => {
  paintAt(spinner.node.current, loadingFrames[currentFrame], spinner.color);
};

const tick = () => {
  currentFrame = (currentFrame + 1) % loadingFrames.length;
  for (const spinner of spinners) {
    paintSpinner(spinner);
  }
};

const startTicker = () => {
  if (!interval) {
    interval = setInterval(tick, loadingFrameIntervalMs);
  }
};

const stopTickerIfIdle = () => {
  if (spinners.size === 0 && interval) {
    clearInterval(interval);
    interval = null;
  }
};

// Ink's built-in animation hooks and ink-spinner still schedule React renders.
// This component keeps the layout in React, but paints the changing glyph directly
// into that reserved cell so a spinner tick doesn't reconcile/render the app.
export const Spinner = ({ active = true, color = "cyan" }: SpinnerProps) => {
  const ref = useRef<DOMElement>(null);
  const registration = useMemo<SpinnerRegistration>(
    () => ({ node: ref, color }),
    [],
  );

  useEffect(() => {
    registration.color = color;
  }, [color, registration]);

  useEffect(() => {
    if (!active || !process.stdout.isTTY) {
      return;
    }

    spinners.add(registration);
    startTicker();
    paintSpinner(registration);

    return () => {
      spinners.delete(registration);
      stopTickerIfIdle();
    };
  }, [active, registration]);

  return (
    <Box ref={ref} width={1} height={1} overflow="hidden">
      <Text color={color}>{loadingFrames[currentFrame]}</Text>
    </Box>
  );
};
