import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Box, measureElement, useStdout, type DOMElement } from "ink";
import { useTwmStore } from "../store";

// Measure rendered lines rather than guessing how paths/metadata wrap. Only the
// details viewport scrolls; worktree selection and dialogs retain their keys.
export const DetailsViewport = ({ height, children }: { height: number; children: React.ReactNode }) => {
  const content = useRef<DOMElement>(null);
  const [contentHeight, setContentHeight] = useState(0);
  const { stdout } = useStdout();
  const requestedScroll = useTwmStore(state => state.detailsScroll);
  const scroll = Math.min(requestedScroll, Math.max(0, contentHeight - height));
  useLayoutEffect(() => {
    if (content.current) setContentHeight(measureElement(content.current).height);
  }, [children, height]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const resize = () => {
      clearTimeout(timer);
      // Ink recalculates Yoga layout on resize even without a React rerender.
      timer = setTimeout(() => {
        if (content.current) setContentHeight(measureElement(content.current).height);
      }, 0);
    };
    stdout.on("resize", resize);
    return () => { stdout.off("resize", resize); clearTimeout(timer); };
  }, [stdout]);
  // Clamp the store too, so an overshoot cannot make scrolling back feel stuck.
  useLayoutEffect(() => {
    if (requestedScroll !== scroll) useTwmStore.getState().setDetailsScroll(scroll);
  }, [requestedScroll, scroll]);
  return <Box height={height} flexShrink={0} flexDirection="column" overflow="hidden">
    <Box ref={content} flexDirection="column" flexShrink={0} marginTop={-scroll}>{children}</Box>
  </Box>;
};
