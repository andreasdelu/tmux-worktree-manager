import { expect, test } from "bun:test";
import React from "react";
import { PassThrough } from "node:stream";
import { render, Box, Text } from "ink";
import { CreateWorktreeOverlay } from "./CreateWorktreeOverlay";
import { DetailsPane, SidebarPane, HelpLine } from "../ui";
import { DetailsViewport } from "./DetailsViewport";
import { TextInput, editInput } from "./TextInput";
import { Spinner } from "./Spinner";
import { AgentStatus } from "./AgentStatus";
import { PiDetails } from "./PiDetails";
import { WorktreeDetails } from "./WorktreeDetails";
import { PullRequestDetails } from "./PullRequestDetails";
import { useTwmStore } from "../store";
import type { Item } from "../types";
import type { PullRequest } from "../lib/pullRequests";
const current: Item = { kind: "worktree", path: "/repo", repoRoot: "/repo", createRoot: "/worktrees", name: "repo", group: "repo",
  branch: "topic0", sessionName: "repo", available: true, locked: false, isPrimary: true, hasSession: false };
const snapshot = async (height: number, child: React.ReactNode, update?: () => void | Promise<void>) => {
  let text = "";
  const stdout = Object.assign(new PassThrough(), { columns: 110, rows: height, isTTY: false });
  stdout.on("data", chunk => { text += chunk.toString(); });
  const app = render(<Box height={height} overflow="hidden">{child}</Box>, { stdout, patchConsole: false });
  await Bun.sleep(50);
  if (update) { text = ""; await update(); await Bun.sleep(50); }
  app.unmount(); stdout.destroy();
  return text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
};
test("compact agent status sits directly beside the pi icon", async () => {
  const now = Date.now();
  for (const [state, symbol] of [["done", "✓"], ["needs-input", "?"]] as const) {
    const text = await snapshot(3, <AgentStatus compact panes={[{
      sessionId: "$1", paneId: "%1", windowIndex: "0", paneIndex: "0", dead: false, cwd: "/repo",
      report: { pid: 42, heartbeat: now, state, toolCount: 0, startedAt: now - 1000, finishedAt: state === "done" ? now : undefined },
    }]} />);
    expect(text).toContain(`π${symbol}`);
    expect(text).not.toContain(`π ${symbol}`);
  }
});

test("create session and open choices show their distinct values", async () => {
  for (const [mode, create, open] of [["none", " ", " "], ["create", "x", " "], ["open", "x", "x"]] as const) {
    const text = await snapshot(24, <CreateWorktreeOverlay rootHeight={24} isSplit current={current}
      worktreeName="topic" branchName="topic" baseRef="" activeField="openSession" sessionMode={mode} createTargetPath="/worktrees/topic" />);
    expect(text).toContain(`[${create}] Create tmux session`);
    expect(text).toContain(`› [${open}] Open after creation`);
    expect(text).toContain("space toggle");
  }
});

for (const height of [18, 24]) test(`create's active base and footer are visible at height ${height}`, async () => {
  const text = await snapshot(height, <CreateWorktreeOverlay current={current} rootHeight={height} isSplit={true}
    worktreeName="calendar" branchName="alice/lf-123-calendar" baseRef="feature/parent" activeField="baseRef" createTargetPath="/worktrees/calendar" />);
  expect(text).toContain("feature/parent");
  expect(text).toContain("enter create");
});

for (const height of [14, 20]) test(`details scroll while the separate agent panel stays visible at height ${height}`, async () => {
  const prs: PullRequest[] = Array.from({ length: 40 }, (_, i) => ({ number: i + 1,
    url: `https://github.com/owner/repo/pull/${i + 1}`, state: "open", draft: false,
    headRef: `topic${i}`, baseRef: i ? `topic${i - 1}` : "main", headRepo: "owner/repo", baseRepo: "owner/repo", mergedAt: null }));
  const selected: Item = { ...current, agentPanes: [{ sessionId: "$1", paneId: "%1", windowIndex: "1", paneIndex: "1",
    dead: false, cwd: "/repo" }] };
  useTwmStore.setState({ view: "worktrees", items: [selected], selected: 0, loading: false, detailsScroll: 0,
    previewPath: selected.path, previewLoading: false,
    preview: { path: selected.path, branch: selected.branch, base: "", track: "", status: "clean", ancestry: "", tmux: "", last: "", changes: [] } });
  useTwmStore.getState().setPullRequests("/repo", { status: "ready", repository: "owner/repo", coverage: "recent", pullRequests: prs });
  const before = await snapshot(height, <DetailsPane mainPanelsHeight={height} isSplit={true} />);
  expect(before).toContain("PR stack");
  expect(before).toContain("partial history");
  expect(before).toContain("Detected; status unavailable");
  const scrolled = await snapshot(height, <DetailsPane mainPanelsHeight={height} isSplit={true} />, () => useTwmStore.getState().setDetailsScroll(40));
  expect(scrolled).toContain("#40 topic39");
  const bottom = await snapshot(height, <DetailsPane mainPanelsHeight={height} isSplit={true} />, () => useTwmStore.getState().setDetailsScroll(999));
  expect(bottom).toContain("Status    clean");
  expect(scrolled).toContain("Agent status"); expect(scrolled).toContain("Detected; status unavailable");
  expect(bottom).toContain("Agent status"); expect(bottom).toContain("Detected; status unavailable");
  expect(useTwmStore.getState().detailsScroll).toBeLessThan(75);
  const returned = await snapshot(height, <DetailsPane mainPanelsHeight={height} isSplit={true} />, () => useTwmStore.getState().setDetailsScroll(0));
  expect(returned).toContain("PR stack");
});

test("compact details omit ancestry and show clean/current PR once above a separate message panel", async () => {
  const now = Date.now();
  const selected: Item = { ...current, agentPanes: [{ sessionId: "$1", paneId: "%1", windowIndex: "1", paneIndex: "1",
    dead: false, cwd: current.path, report: { pid: 42, heartbeat: now, state: "idle", toolCount: 0 },
    messages: { human: "Human preview", agent: "Agent preview", heartbeat: now } }] };
  const pr: PullRequest = { number: 101, url: "https://github.com/owner/repo/pull/101", state: "open", draft: false,
    headRef: "topic0", baseRef: "main", headRepo: "owner/repo", baseRepo: "owner/repo", mergedAt: null };
  useTwmStore.setState({ view: "worktrees", items: [selected], selected: 0, loading: false, detailsScroll: 0,
    previewPath: selected.path, previewLoading: false, cachedPreviewPaths: [], cachedPrRoots: [],
    preview: { path: selected.path, branch: selected.branch, base: "", track: "", status: "clean", ancestry: "not contained", tmux: "", last: "", changes: [] } });
  useTwmStore.getState().setPullRequests("/repo", { status: "ready", repository: "owner/repo", coverage: "complete", pullRequests: [pr] });
  const text = await snapshot(26, <DetailsPane mainPanelsHeight={26} isSplit />);
  expect(text.indexOf("Human preview")).toBeGreaterThan(text.indexOf("Git"));
  expect(text.indexOf("Agent preview")).toBeGreaterThan(text.indexOf("Git"));
  expect(text).toMatch(/╰─+╯\n╭─+╮\n│ Agent status/);
  expect(text.indexOf("PR stack")).toBeLessThan(text.indexOf("Git"));
  expect(text).not.toContain("Ancestry");
  expect(text.match(/#101/g)).toHaveLength(1); expect(text.match(/clean/g)).toHaveLength(1);
  expect(text).not.toContain("No uncommitted changes");
});

test("agent panel reserves prompt/reply slots and explains legacy vs empty live reports", async () => {
  const pane = { sessionId: "$1", paneId: "%1", windowIndex: "1", paneIndex: "2", dead: false, cwd: current.path,
    report: { pid: 42, heartbeat: Date.now(), state: "needs-input" as const, toolCount: 0 } };
  const selected = { ...current, agentPanes: [pane] };
  useTwmStore.setState({ view: "worktrees", items: [selected], selected: 0, detailsScroll: 0 });
  const legacy = await snapshot(14, <DetailsPane mainPanelsHeight={14} isSplit />);
  expect(legacy).toContain("Needs input");
  expect(legacy).toContain("You    Not reported: update reporter and /reload");
  expect(legacy).toContain("Agent  ? Needs input");
  const rich = await snapshot(14, <PiDetails current={{ ...selected, agentPanes: [{ ...pane, report: { ...pane.report, tools: [], startedAt: 0, finishedAt: 0 } }] }} />);
  expect(rich).toContain("No prompt observed yet"); expect(rich).toContain("Needs input");
  expect(rich).not.toContain("update reporter");
});

test("multiple agents keep separate status/prompt/reply groups and disclose overflow", async () => {
  const now = Date.now();
  const panes = [1, 2, 3].map(n => ({ sessionId: "$1", paneId: `%${n}`, windowIndex: "1", paneIndex: String(n),
    dead: false, cwd: current.path, report: { pid: n, heartbeat: now, state: "idle" as const, toolCount: 0, tools: [], startedAt: 0, finishedAt: 0 },
    messages: { human: `Prompt ${n}`, agent: `Reply ${n}`, heartbeat: now } }));
  const selected = { ...current, agentPanes: panes };
  useTwmStore.setState({ view: "worktrees", items: [selected], selected: 0, detailsScroll: 0 });
  const text = await snapshot(18, <DetailsPane mainPanelsHeight={18} isSplit />);
  for (const n of [1, 2, 3]) {
    expect(text).toContain(`π 1.${n}`); expect(text).toContain(`Prompt ${n}`); expect(text).toContain(`Reply ${n}`);
    expect(text.indexOf(`Prompt ${n}`)).toBeLessThan(text.indexOf(`Reply ${n}`));
  }
  expect(text).toMatch(/Reply 1[^\n]*\n│ +│\n│ π 1\.2/);
  const short = await snapshot(8, <DetailsPane mainPanelsHeight={8} isSplit />);
  expect(short).toContain("3 more agents");
  expect(short).not.toContain("Prompt 1");
});

test("minimum-height stacked grid keeps an independent agent status row without overflow", async () => {
  const selected: Item = { ...current, agentPanes: [{ sessionId: "$1", paneId: "%1", windowIndex: "1", paneIndex: "1",
    dead: false, cwd: current.path }] };
  useTwmStore.setState({ view: "worktrees", items: [selected], selected: 0, detailsScroll: 0 });
  const text = await snapshot(6, <DetailsPane mainPanelsHeight={6} isSplit={false} />);
  expect(text).toContain("repo/repo · primary"); expect(text).toContain("Detected; status unavailable");
  expect(text.match(/╭/g)).toHaveLength(2); expect(text.match(/╰/g)).toHaveLength(2);
  expect(text.trimEnd().split("\n")).toHaveLength(6);
});

test("message text expires on its own while dialog polling is paused", async () => {
  let text = "";
  const stdout = Object.assign(new PassThrough(), { columns: 90, rows: 12, isTTY: true });
  stdout.on("data", chunk => { text += chunk.toString(); });
  const selected: Item = { ...current, agentPanes: [{ sessionId: "$1", paneId: "%1", windowIndex: "1", paneIndex: "1",
    dead: false, cwd: current.path, report: { pid: 42, heartbeat: Date.now(), state: "idle", toolCount: 0 },
    messages: { human: "Human preview", agent: "Agent preview", heartbeat: Date.now() - 14900 } }] };
  const app = render(<PiDetails current={selected} />, { stdout, interactive: true, patchConsole: false });
  try {
    await Bun.sleep(40); expect(text).toContain("Human preview"); expect(text).toContain("Agent preview");
    text = ""; await Bun.sleep(160);
    expect(text).not.toContain("Human preview"); expect(text).not.toContain("Agent preview"); expect(text).toContain("Not reported by this reporter");
  } finally { app.unmount(); stdout.destroy(); }
});

test("same mounted viewport remeasures wrapped lines after terminal resize", async () => {
  let text = "";
  const stdout = Object.assign(new PassThrough(), { columns: 160, rows: 20, isTTY: true });
  stdout.on("data", chunk => { text += chunk.toString(); });
  useTwmStore.getState().setDetailsScroll(0);
  const content = <Box flexDirection="column">
    {Array.from({ length: 20 }, (_, index) => <Text key={index}>{`Row ${index} ${"word ".repeat(20)}`}</Text>)}
    <Text>LAST-ROW</Text>
  </Box>;
  const app = render(<Box width="100%"><DetailsViewport height={10}>{content}</DetailsViewport></Box>, { stdout, interactive: true, patchConsole: false });
  try {
    await Bun.sleep(80); useTwmStore.getState().setDetailsScroll(999); await Bun.sleep(80);
    const wideLimit = useTwmStore.getState().detailsScroll;
    expect(text).toContain("LAST-ROW");
    text = ""; stdout.columns = 60; stdout.emit("resize"); await Bun.sleep(80);
    useTwmStore.getState().setDetailsScroll(999); await Bun.sleep(80);
    expect(useTwmStore.getState().detailsScroll).toBeGreaterThan(wideLimit);
    expect(text).toContain("LAST-ROW");
  } finally { app.unmount(); stdout.destroy(); }
});

test("PR numbers carry their state color without status words", async () => {
  // Color support is detected at module import. Isolate FORCE_COLOR so the
  // assertion checks actual rendered ANSI, not an internal color lookup table.
  const child = Bun.spawn(["bun", "-e", `
    import React from "react"; import {render, Box} from "ink";
    import {PassThrough} from "node:stream";
    import {PullRequestNumber} from "./src/components/PullRequestNumber.tsx";
    const stdout=Object.assign(new PassThrough(),{columns:80,rows:10,isTTY:false});
    stdout.on("data",chunk=>process.stdout.write(chunk));
    const rows=["merged","open","draft","closed"].map((state,n)=>React.createElement(PullRequestNumber,{state,number:101+n,key:n}));
    const app=render(React.createElement(Box,{},...rows),{stdout,patchConsole:false});
    await Bun.sleep(60); app.unmount(); stdout.destroy();
  `], { env: { ...process.env, FORCE_COLOR: "1" }, stdout: "pipe", stderr: "pipe" });
  const [text, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  expect({ code, stderr }).toEqual({ code: 0, stderr: "" });
  for (const [number, color] of [[101, 35], [102, 33], [103, 90], [104, 31]]) {
    expect(text).toContain(`\x1b[${color}m#${number}`);
  }
  const clean = text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
  expect(clean).not.toMatch(/merged|open|draft|closed/);
});

test("cached PR details paint independently while Git details are loading", async () => {
  const pr: PullRequest = { number: 101, url: "https://github.com/owner/repo/pull/101", state: "open", draft: false,
    headRef: "topic0", baseRef: "main", headRepo: "owner/repo", baseRepo: "owner/repo", mergedAt: null };
  const text = await snapshot(20, <WorktreeDetails current={current} previewPath={current.path} showPreviewLoading
    previewMetaRows={[]} previewChanges={[]} hiddenPreviewChanges={0}
    pullRequestDetails={<PullRequestDetails branch="topic0" data={{ status: "ready", repository: "owner/repo", coverage: "complete", pullRequests: [pr] }} />} />);
  expect(text).toContain("#101"); expect(text).toContain("PR stack"); expect(text).toContain("Loading Git details");
});

test("input edits graphemes, keeps long-field cursor visible and spinner obeys Ink clipping", async () => {
  expect(editInput("a🙂e\u0301z", 3, "", { backspace: true })).toEqual({ value: "a🙂z", cursor: 2 });
  expect(editInput("abc", 1, "", { delete: true })).toEqual({ value: "ac", cursor: 1 });
  expect(editInput("ez", 1, "\u0301", {})).toEqual({ value: "e\u0301z", cursor: 1 });
  expect(editInput("a👨‍👩‍👧‍👦", undefined, "", { backspace: true })).toEqual({ value: "a", cursor: 1 });
  const text = await snapshot(2, <Box width={20}><TextInput value={"long/".repeat(30) + "END"} /></Box>);
  expect(text).toContain("END");
  let output = "";
  const stdout = Object.assign(new PassThrough(), { columns: 30, rows: 5, isTTY: true });
  stdout.on("data", chunk => { output += chunk.toString(); });
  const app = render(<Box flexDirection="column"><Box height={0} overflow="hidden"><Spinner /></Box><Text>VISIBLE</Text></Box>, { stdout, interactive: true, patchConsole: false });
  try {
    await Bun.sleep(300); expect(output).toContain("VISIBLE"); expect(output).not.toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/);
  } finally { app.unmount(); stdout.destroy(); }
});

test("text input keeps its cursor visible after resize and spinner animates through React", async () => {
  let text = "";
  const stdout = Object.assign(new PassThrough(), { columns: 90, rows: 5, isTTY: true });
  stdout.on("data", chunk => { text += chunk.toString(); });
  const app = render(<Box flexDirection="column" width="100%"><TextInput value={"long/".repeat(25) + "END"} /><Spinner /></Box>, { stdout, interactive: true, patchConsole: false });
  try {
    await Bun.sleep(260); expect(new Set(text.match(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/g)).size).toBeGreaterThan(1);
    text = ""; stdout.columns = 20; stdout.emit("resize"); await Bun.sleep(100);
    expect(text).toContain("END");
  } finally { app.unmount(); stdout.destroy(); }
});

test("grouped shortcut hints wrap without losing available actions in a narrow terminal", async () => {
  const selected = { ...current, isPrimary: false, hasSession: true };
  useTwmStore.setState({ view: "worktrees", items: [selected], selected: 0, closeOnOpen: false });
  const text = await snapshot(3, <Box width={76}><HelpLine keybindLegendHeight={3} /></Box>);
  for (const hint of ["[h/l] source", "[pgup/pgdn] scroll", "[d] close tmux", "[x] remove", "[q] quit"]) expect(text).toContain(hint);
  expect(text).not.toContain("[o]");
  expect(text).not.toContain("close on open");
  expect(text.trimEnd().split("\n").length).toBeLessThanOrEqual(3);
  useTwmStore.setState({ view: "sources" });
  const sources = await snapshot(3, <Box width={76}><HelpLine keybindLegendHeight={3} /></Box>);
  expect(sources).toContain("[a] add source"); expect(sources).not.toContain("close on open");
});

test("shortcut footer reflows on terminal resize without splitting key/action pairs", async () => {
  const stdout = Object.assign(new PassThrough(), { columns: 120, rows: 12, isTTY: true });
  let text = "";
  stdout.on("data", chunk => { text += chunk.toString(); });
  useTwmStore.setState({ view: "worktrees", items: [{ ...current, isPrimary: false, hasSession: true }], selected: 0 });
  const app = render(<HelpLine keybindLegendHeight={3} />, { stdout, interactive: true, patchConsole: false });
  try {
    await Bun.sleep(60);
    text = ""; stdout.columns = 80; stdout.emit("resize"); await Bun.sleep(80);
    const clean = text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
    expect(clean).toContain("[pgup/pgdn] scroll"); expect(clean).toContain("[q] quit");
  } finally { app.unmount(); stdout.destroy(); }
});

test("parent settlement cannot paint a Finished checkmark while children are active or unknown", async () => {
  const heartbeat = Date.now();
  const pane = { sessionId: "$1", paneId: "%1", windowIndex: "1", paneIndex: "1", dead: false, cwd: "/repo",
    report: { pid: 42, heartbeat, state: "done" as const, toolCount: 0, tools: [], startedAt: heartbeat - 2000, finishedAt: heartbeat - 1000 } };
  for (const state of ["active", "unknown"] as const) {
    const text = await snapshot(5, <AgentStatus panes={[{ ...pane, children: { state, heartbeat } }]} />);
    expect(text).toContain(`Parent finished; children ${state}`);
    expect(text).not.toContain("✓");
  }
});

test("prompt-first agent row swaps old replies for live activity and preserves attention states", async () => {
  const heartbeat = Date.now();
  const pane = { sessionId: "$1", paneId: "%1", windowIndex: "1", paneIndex: "1", dead: false, cwd: "/repo",
    report: { pid: 42, heartbeat, state: "done" as const, toolCount: 0, tools: [] },
    messages: { human: "Latest prompt", agent: "Previous completed reply", heartbeat } };
  const settled = await snapshot(10, <PiDetails current={{ ...current, agentPanes: [pane] }} />);
  expect(settled.indexOf("You    Latest prompt")).toBeLessThan(settled.indexOf("Agent  Previous completed reply"));
  for (const [state, label] of [["working", "Working"], ["thinking", "Thinking"], ["needs-input", "Needs input"], ["error", "Run failed"], ["stopped", "Stopped"]] as const) {
    const text = await snapshot(10, <PiDetails current={{ ...current, agentPanes: [{ ...pane, report: { ...pane.report, state } }] }} />);
    expect(text).toContain("You    Latest prompt"); expect(text).toContain(label);
    expect(text).not.toContain("Previous completed reply");
  }
  const delegated = await snapshot(10, <PiDetails current={{ ...current, agentPanes: [{ ...pane, children: { state: "active", heartbeat } }] }} />);
  expect(delegated).not.toContain("Previous completed reply");
  expect(delegated.indexOf("Agent")).toBeLessThan(delegated.indexOf("Subagents working"));
  const unavailable = await snapshot(10, <PiDetails current={{ ...current, agentPanes: [{ ...pane, report: { ...pane.report, heartbeat: heartbeat - 16000 } }] }} />);
  expect(unavailable).toContain("status unavailable"); expect(unavailable).not.toContain("Previous completed reply");
  const uncertain = await snapshot(10, <PiDetails current={{ ...current, agentPanes: [{ ...pane, report: { ...pane.report, state: "working" }, children: { state: "unknown", heartbeat } }] }} />);
  expect(uncertain).toContain("Working"); expect(uncertain).toContain("Subagent status unknown");
  expect(uncertain).not.toContain("Subagents working");
  const settledUnknown = await snapshot(10, <PiDetails current={{ ...current, agentPanes: [{ ...pane, children: { state: "unknown", heartbeat } }] }} />);
  expect(settledUnknown).toContain("Subagent status unknown"); expect(settledUnknown).not.toContain("✓");
});

test("subagents have an independent animated row without claiming child success", async () => {
  const heartbeat = Date.now();
  const pane = { sessionId: "$1", paneId: "%1", windowIndex: "1", paneIndex: "1", dead: false, cwd: "/repo",
    report: { pid: 42, heartbeat, state: "done" as const, toolCount: 0, tools: [] } };
  for (const state of ["active", "inactive", "unknown"] as const) {
    const agent = { ...pane, children: { state, heartbeat } };
    const text = await snapshot(10, <PiDetails current={{ ...current, agentPanes: [agent] }} />);
    if (state === "active") {
      expect(text).toContain("Agent  ✓ Finished");
      expect(text).toContain("Subagents working");
    } else {
      expect(text).not.toContain("Subagents working");
      expect(text).not.toContain("Subagents inactive");
      expect(text).toContain(state === "unknown" ? "Subagent status unknown" : "No reply observed yet");
    }
    expect(text).not.toContain("children active");
    if (state === "active") expect(text).toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/);
    const sidebar = await snapshot(3, <AgentStatus panes={[agent]} compact />);
    expect(sidebar).not.toContain("Subagents");
    if (state !== "inactive") expect(sidebar).not.toContain("✓");
  }
  const stale = await snapshot(10, <PiDetails current={{ ...current, agentPanes: [{ ...pane, children: { state: "active", heartbeat: heartbeat - 16000 } }] }} />);
  expect(stale).toContain("Subagent status unknown"); expect(stale).not.toContain("Subagents working");
  const bounded = await snapshot(10, <PiDetails rows={5} current={{ ...current, agentPanes: ["%1", "%2"].map(paneId => ({ ...pane, paneId, children: { state: "active", heartbeat } })) }} />);
  expect(bounded).toContain("Subagents working"); expect(bounded).toContain("1 more agents");
});

test("child row expires without polling while the fresh parent remains visible", async () => {
  let text = "";
  const stdout = Object.assign(new PassThrough(), { columns: 100, rows: 20, isTTY: true });
  stdout.on("data", chunk => { text += chunk.toString(); });
  const heartbeat = Date.now();
  const pane = { sessionId: "$1", paneId: "%1", windowIndex: "1", paneIndex: "1", dead: false, cwd: "/repo",
    report: { pid: 42, heartbeat, state: "done" as const, toolCount: 0 }, children: { state: "active" as const, heartbeat: heartbeat - 14900 } };
  const app = render(<PiDetails current={{ ...current, agentPanes: [pane] }} />, { stdout, interactive: true, patchConsole: false });
  try {
    await Bun.sleep(50); expect(text).toContain("Subagents working");
    text = ""; await Bun.sleep(180); expect(text).toContain("Subagent status unknown");
    expect(text).not.toContain("Subagents working");
  } finally { app.unmount(); stdout.destroy(); }
});

test("non-busy status expires visually without polling, including during dialogs", async () => {
  let text = "";
  const stdout = Object.assign(new PassThrough(), { columns: 100, rows: 20, isTTY: true });
  stdout.on("data", chunk => { text += chunk.toString(); });
  const heartbeat = Date.now() - 14900;
  const pane = { sessionId: "$1", paneId: "%1", windowIndex: "1", paneIndex: "1", dead: false, cwd: "/repo",
    report: { pid: 42, heartbeat, state: "done" as const, toolCount: 0, startedAt: heartbeat - 2000, finishedAt: heartbeat - 1000 } };
  const app = render(<AgentStatus panes={[pane]} />, { stdout, interactive: true, patchConsole: false });
  try {
    await Bun.sleep(50); expect(text).toContain("Finished");
    text = ""; await Bun.sleep(150); expect(text).toContain("Detected; status unavailable");
  } finally { app.unmount(); stdout.destroy(); }
});

test("agent animation advances, elapsed time freezes after settlement, and clipped agents cannot paint visible rows", async () => {
  let text = "";
  const stdout = Object.assign(new PassThrough(), { columns: 100, rows: 20, isTTY: true });
  stdout.on("data", chunk => { text += chunk.toString(); });
  const startedAt = Date.now() - 1500;
  const pane = { sessionId: "$1", paneId: "%1", windowIndex: "1", paneIndex: "1", dead: false, cwd: "/repo",
    report: { pid: 42, heartbeat: Date.now(), state: "tool" as const, toolCount: 1, tools: ["read"], startedAt, finishedAt: 0 } };
  const content = (agent = pane) => <Box flexDirection="column"><AgentStatus panes={[agent]} />
    <Text>VISIBLE-A</Text><Text>VISIBLE-B</Text><Text>VISIBLE-C</Text><Text>VISIBLE-D</Text></Box>;
  useTwmStore.getState().setDetailsScroll(0);
  const app = render(<DetailsViewport height={3}>{content()}</DetailsViewport>, { stdout, interactive: true, patchConsole: false });
  try {
    await Bun.sleep(1050);
    expect(new Set(text.match(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/g)).size).toBeGreaterThan(1);
    expect(text).toContain("Reading files · 1s"); expect(text).toContain("Reading files · 2s");
    text = ""; useTwmStore.getState().setDetailsScroll(999); await Bun.sleep(300);
    expect(text).toContain("VISIBLE-D"); expect(text).not.toContain("Reading files");
    text = ""; useTwmStore.getState().setDetailsScroll(0);
    const done = { ...pane, report: { ...pane.report, heartbeat: Date.now(), state: "done" as any, toolCount: 0, tools: [], finishedAt: startedAt + 1000 } };
    app.rerender(<DetailsViewport height={3}>{content(done)}</DetailsViewport>); await Bun.sleep(100);
    expect(text).toContain("✓ 1.1 Finished · 1s");
    text = ""; await Bun.sleep(1050);
    app.rerender(<DetailsViewport height={3}>{content(done)}</DetailsViewport>); await Bun.sleep(60);
    expect(text).not.toContain("Finished · 2s");
    const error = { ...done, report: { ...done.report, state: "error" as any } };
    app.rerender(<DetailsViewport height={3}>{content(error)}</DetailsViewport>); await Bun.sleep(60); expect(text).toContain("Run failed · 1s");
    const stopped = { ...done, report: { ...done.report, state: "stopped" as any } };
    app.rerender(<DetailsViewport height={3}>{content(stopped)}</DetailsViewport>); await Bun.sleep(60); expect(text).toContain("Stopped · 1s");
  } finally { app.unmount(); stdout.destroy(); }
});

test("worktree sidebar fits the shortened issue folder with icon-only activity", async () => {
  const selected: Item = { ...current, isPrimary: false, name: "lan-18257-add-a-way-for", agentPanes: [{ sessionId: "$1", paneId: "%1", windowIndex: "1", paneIndex: "1",
    dead: false, cwd: "/repo", report: { pid: 42, heartbeat: Date.now(), state: "working", toolCount: 0 } }] };
  useTwmStore.setState({ items: [selected], selected: 0, view: "worktrees", loading: false, pullRequests: {} });
  const text = await snapshot(20, <SidebarPane mainPanelsHeight={20} isSplit={true} sourceRowsTarget={16} />);
  expect(text).toContain("lan-18257-add-a-way-for");
  expect(text).not.toContain("working");
  expect(text).toContain("π");
  expect(text).toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/);
  expect(text).not.toContain("π?");
});
