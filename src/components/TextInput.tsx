// Adapted from InkUI's TextInput display/editing model (MIT).
// https://github.com/kamlesh723/InkUI/blob/main/packages/text-input/src/TextInput.tsx
// See vendor/inkui/LICENSE. twm owns submission, focus and input dispatch.
import React, { useRef } from "react";
import { Box, Text, useBoxMetrics, type DOMElement } from "ink";
import { theme } from "../theme";

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
export const inputCharacters = (value: string) => Array.from(segmenter.segment(value), entry => entry.segment);
export const cleanInput = (value: string) => value.replace(/[\p{Cc}\p{Cf}]/gu, char => char === "\u200d" ? char : "");
export type EditKey = { leftArrow?: boolean; rightArrow?: boolean; home?: boolean; end?: boolean; backspace?: boolean; delete?: boolean; ctrl?: boolean; meta?: boolean; tab?: boolean; return?: boolean; escape?: boolean; upArrow?: boolean; downArrow?: boolean; pageUp?: boolean; pageDown?: boolean };
export function editInput(value: string, cursor: number | undefined, input: string, key: EditKey) {
  const chars = inputCharacters(value);
  let position = Math.max(0, Math.min(cursor ?? chars.length, chars.length));
  if (key.home || key.ctrl && input === "a") position = 0;
  else if (key.end || key.ctrl && input === "e") position = chars.length;
  else if (key.leftArrow) position = Math.max(0, position - 1);
  else if (key.rightArrow) position = Math.min(chars.length, position + 1);
  else if (key.backspace) { if (position) chars.splice(--position, 1); }
  else if (key.delete) chars.splice(position, 1);
  else if (key.ctrl || key.meta || key.tab || key.return || key.escape || key.upArrow || key.downArrow || key.pageUp || key.pageDown) return { value, cursor: position };
  else {
    const inserted = inputCharacters(input);
    chars.splice(position, 0, ...inserted); position += inserted.length;
  }
  return { value: chars.join(""), cursor: inputCharacters(chars.slice(0, position).join("")).length };
}

export const TextInput = ({ value, cursor, focus = true, placeholder = "" }: { value: string; cursor?: number; focus?: boolean; placeholder?: string }) => {
  // Ink's hook accepts an initially-null ref at runtime, but its declaration
  // omits null. The hook's hasMeasured flag gates access before attachment.
  const ref = useRef<DOMElement>(null!);
  const { width, hasMeasured } = useBoxMetrics(ref);
  const chars = inputCharacters(value);
  const placeholderChars = inputCharacters(placeholder);
  const position = Math.max(0, Math.min(cursor ?? chars.length, chars.length));
  const capacity = Math.max(1, hasMeasured ? width : 40);
  const at = chars[position] ?? " ";
  let start = position;
  let used = Bun.stringWidth(at);
  while (start > 0 && used + Bun.stringWidth(chars[start - 1]!) <= capacity) used += Bun.stringWidth(chars[--start]!);
  let end = position + 1;
  while (end < chars.length && used + Bun.stringWidth(chars[end]!) <= capacity) used += Bun.stringWidth(chars[end++]!);
  const before = chars.slice(start, position).join("");
  const after = chars.slice(position + 1, end).join("");
  return <Box ref={ref} flexGrow={1} flexShrink={1} minWidth={0} height={1} overflow="hidden">
    {!focus ? <Text color={value ? theme.colors.text : theme.colors.muted} wrap="truncate-end">{value || placeholder}</Text>
      : !value ? <Text><Text inverse color={theme.colors.accent}>{placeholderChars[0] || " "}</Text><Text color={theme.colors.muted}>{placeholderChars.slice(1).join("")}</Text></Text>
      : <Text wrap="truncate-end"><Text>{before}</Text><Text inverse color={theme.colors.accent}>{at}</Text><Text>{after}</Text></Text>}
  </Box>;
};
