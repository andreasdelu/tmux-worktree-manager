// Adapted from InkUI's Spinner (MIT). See vendor/inkui/LICENSE.
import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import { loadingFrameIntervalMs, loadingFrames } from "../config";

export const Spinner = ({ active = true, color = "cyan" }: { active?: boolean; color?: string }) => {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setFrame(value => (value + 1) % loadingFrames.length), loadingFrameIntervalMs);
    return () => clearInterval(timer);
  }, [active]);
  // React owns animation, so Ink clips it and no timer writes over other cells.
  return <Box width={1} height={1} flexShrink={0} overflow="hidden"><Text color={color}>{loadingFrames[frame]}</Text></Box>;
};
