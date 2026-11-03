import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { annotateAgentPanes, parseAgentPanes, parseAgentReport, agentStateLabel, agentActivityBadge, agentPaneFormat, parseAgentMessages, loadLiveItems, parseChildActivity, agentIsBusy } from "./agents";
import type { AgentPane, Item } from "../types";
const item = (dir: string, session: string): Item => ({ kind: "worktree", group: "repo", path: dir,
  name: session, sessionName: session, repoRoot: dir, createRoot: dir, branch: "topic", available: true,
  locked: false, isPrimary: false, hasSession: false });
const pane: AgentPane = { sessionId: "$7", paneId: "%3", windowIndex: "1", paneIndex: "3", dead: false, cwd: "/repo/nested/src" };

test("child activity is owner-bound and fresh, without equating inactivity with success", () => {
  const report = { pid: 42, heartbeat: 99000, state: "done" as const, toolCount: 0, tools: [], startedAt: 97000, finishedAt: 98000 };
  const children = parseChildActivity("c1|42|99000|active", report, 100000);
  const active = { ...pane, report, children };
  expect(agentIsBusy(active, 100000)).toBe(true);
  expect(agentStateLabel(active, 100000)).toBe("Parent finished; children active");
  expect(agentActivityBadge([active], 100000)).toBe("π working");
  expect(agentStateLabel({ ...active, children: { state: "unknown", heartbeat: 99000 } }, 100000)).toContain("children unknown");
  expect(agentStateLabel({ ...active, children: { state: "inactive", heartbeat: 99000 } }, 100000)).toBe("Finished");
  expect(agentStateLabel({ ...active, report: { ...report, heartbeat: 110000 } }, 114000)).toContain("children unknown");
  for (const value of ["c1|41|99000|active", "c1|42|85000|active", "c1|42|100001|active", "c1|42|99000|done", "c1|42|99000|active\n"]) {
    expect(parseChildActivity(value, report, 100000)?.state).toBe("unknown");
  }
});

test("wire parsing preserves unavailable child support without stale active authority", () => {
  const now = Date.now();
  for (const children of [`c1|42|${now - 16000}|active`, `c1|43|${now}|active`, "c1|invalid"]) {
    const parsed = parseAgentPanes(`$1\t%1\t1\t1\t0\t0\t0\t1\tv2|42|${now}|done|0||${now - 2000}|${now - 1000}\t${children}`)[0]!;
    expect(agentStateLabel(parsed, now)).toBe("Parent finished; children unknown");
    expect(agentIsBusy(parsed, now)).toBe(false);
  }
});

test("generic node and stale shell titles do not become Pi/Pax agents", () => {
  const panes = parseAgentPanes("$1\t%1\t1\t1\t0\t0\t0\t1\t\n$1\t%2\t1\t2\t0\t1\t0\t0\t\n$1\t%3\t1\t3\t0\t1\t0\t1\t\n$2\t%4\t0\t0\t1\t0\t1\t0\t\nmalformed");
  expect(panes.map(pane => pane.paneId)).toEqual(["%3", "%4"]);
  expect(panes[1]!.report).toBeUndefined();
});
test("session ownership and longest containing cwd match each pane once", () => {
  const items = [item("/repo", "repo"), item("/repo/nested", "nested")];
  const cwdMatched = annotateAgentPanes(items, [pane], new Map(), true);
  expect(cwdMatched[0]!.agentPanes).toHaveLength(0);
  expect(cwdMatched[1]!.agentPanes).toHaveLength(1);
  const sessionMatched = annotateAgentPanes(items, [pane], new Map([["$7", "repo"]]), true);
  expect(sessionMatched[0]!.agentPanes).toHaveLength(1);
  expect(sessionMatched[1]!.agentPanes).toHaveLength(0);
  expect(annotateAgentPanes(items, [{ ...pane, cwd: "/repository" }], new Map(), true).every(item => !item.agentPanes?.length)).toBe(true);
});
test("cwd ownership observes symlink changes between scans and ignores unavailable worktrees", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "twm-agent-paths-"));
  try {
    const first = path.join(root, "first"), second = path.join(root, "second"), alias = path.join(root, "alias");
    fs.mkdirSync(first); fs.mkdirSync(second); fs.symlinkSync(first, alias);
    const items = [item(first, "first"), item(second, "second"), { ...item(root, "unavailable"), available: false }];
    const panes = [{ ...pane, cwd: alias }, { ...pane, paneId: "%4", cwd: alias }];
    const scan = () => annotateAgentPanes(items, panes, new Map(), true);
    expect(scan().map(row => row.agentPanes?.length)).toEqual([2, 0, 0]);
    fs.unlinkSync(alias); fs.symlinkSync(second, alias);
    expect(scan().map(row => row.agentPanes?.length)).toEqual([0, 2, 0]);
    expect(annotateAgentPanes(items, panes, new Map([[pane.sessionId, "first"]]), true).map(row => row.agentPanes?.length)).toEqual([2, 0, 0]);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("only fresh, valid reporter records become live status", () => {
  expect(parseAgentReport("v1|42|99000|tool|2", 100_000)).toEqual({ pid: 42, heartbeat: 99_000, state: "tool", toolCount: 2 });
  for (const value of ["", "v2|42|99000|idle|0", "v1|42|101000|working|0", "v1|42|85000|idle|0", "v1|42|99000|tool|0", "v1|42|99000|idle|1", "v1|0|99000|idle|0", "v1|42|99000|done|0", "v1|42|99000|idle|0\n", "v1|99999999999999999|99000|idle|0"]) {
    expect(parseAgentReport(value, 100_000)).toBeUndefined();
  }
});
test("rich reports retain safe activity metadata and reject invalid terminal states", () => {
  const value = "v2|42|99000|tool|2|codemode+read|97000|0";
  const report = parseAgentReport(value, 100000)!;
  expect(report.tools).toEqual(["codemode", "read"]);
  expect(agentStateLabel({ ...pane, report }, 100000)).toBe("Running code · Reading files (2 active)");
  const finished = parseAgentReport("v2|42|99000|done|0||97000|98000", 100000)!;
  expect(agentActivityBadge([{ ...pane, report: finished }], 100000)).toBe("π done");
  for (const invalid of ["v2|42|99000|done|0||0|0", "v2|42|99000|tool|1|read+edit|97000|0",
    "v2|42|99000|working|0||97000|98000", "v2|42|99000|idle|0||97000|0",
    "v2|42|99000|tool|1|read\n|97000|0", "v2|42|99000|tool|1|read;rm|97000|0",
    "v2|42|99000|done|0||98000|97000", "v2|42|99000|done|0||97000|101000"]) {
    expect(parseAgentReport(invalid, 100000)).toBeUndefined();
  }
});

test("message previews require fresh matching ownership, canonical safe bounded text and safe TSV framing", () => {
  const report = parseAgentReport("v2|42|99000|idle|0||0|0", 100000)!;
  const encoded = (text: string) => Buffer.from(text).toString("base64url");
  const record = (text: string, pid = 42, time = 99000) => `m1|${pid}|${time}|${encoded(text)}|${encoded("Agent reply")}`;
  expect(parseAgentMessages(record("Human says '#{pane_title}'"), report, 100000)).toEqual({ human: "Human says '#{pane_title}'", agent: "Agent reply", heartbeat: 99000 });
  for (const value of [record("bad\ntext"), record("bad\x1btext"), record("bad\u202etext"), record("x".repeat(321)),
    record("old", 43), record("old", 42, 85000), record("future", 42, 100001), "m1|42|99000|a|", "m1|42|99000|invalid=|"]) {
    expect(parseAgentMessages(value, report, 100000)).toBeUndefined();
  }
  expect(parseAgentMessages(record("Human"), undefined, 100000)).toBeUndefined();
  expect(parseAgentMessages(record("Human"), { ...report, heartbeat: 85000 }, 100000)).toBeUndefined();
});

test("badges use runtime events, not recent window activity", () => {
  const reported = (state: "working" | "tool" | "needs-input" | "idle", toolCount = 0): AgentPane => ({ ...pane,
    report: { pid: 42, heartbeat: 99_000, state, toolCount } });
  expect(agentActivityBadge([pane], 100_000)).toBe("π detected");
  expect(agentActivityBadge([reported("working")], 100_000)).toBe("π working");
  expect(agentActivityBadge([reported("tool", 2)], 100_000)).toBe("π tool");
  expect(agentStateLabel(reported("tool", 2), 100_000)).toBe("Running tools (2)");
  expect(agentActivityBadge([reported("needs-input", 1), reported("tool", 2)], 100_000)).toBe("π input");
  expect(agentActivityBadge([reported("idle")], 100_000)).toBe("π idle");
  expect(agentActivityBadge([reported("idle"), pane], 100_000)).toBe("π detected");
  expect(agentStateLabel(reported("idle"), 114_000)).toBe("Detected; status unavailable");
  expect(agentActivityBadge([{ ...pane, dead: true }], 100_000)).toBe("π exited");
  expect(agentActivityBadge([], 100_000)).toBe("");
});
test("tmux sanitizes reports before newline/tab framing, not after", () => {
  const server = `twm-report-framing-${process.pid}`;
  const tmux = (...args: string[]) => execFileSync("tmux", ["-L", server, "-f", "/dev/null", ...args], { encoding: "utf8", timeout: 2000 });
  try {
    const target = tmux("new-session", "-d", "-s", "fixture", "-P", "-F", "#{pane_id}", "printf '\\033]2;π - fixture\\007'; exec node -e 'setInterval(() => {}, 1000)'").trim();
    const good = `v2|42|${Date.now()}|idle|0||0|0`;
    const message = `m1|42|${Date.now()}|${Buffer.from("Human line").toString("base64url")}|`;
    for (const raw of [message, `${message}\nmalformed`, `${message}\tmalformed`, `${message}\x1b`]) {
      tmux("set-option", "-p", "-t", target, "@twm_pi", good);
      tmux("set-option", "-p", "-t", target, "@twm_pi_messages", raw);
      const output = tmux("list-panes", "-a", "-F", agentPaneFormat);
      expect(output.trimEnd().split("\n")).toHaveLength(1);
      expect(parseAgentPanes(output)[0]?.messages?.human).toBe(raw === message ? "Human line" : undefined);
    }
    for (const record of [good, `${good}\nmalformed`, `${good}\tmalformed`, `${good}\r`, `${good}\x1b`]) {
      tmux("set-option", "-p", "-t", target, "@twm_pi", record);
      const output = tmux("list-panes", "-a", "-F", agentPaneFormat);
      expect(output.trimEnd().split("\n")).toHaveLength(1);
      const panes = parseAgentPanes(output);
      expect(panes).toHaveLength(1);
      expect(agentStateLabel(panes[0]!)).toBe(record === good ? "Idle" : "Detected; status unavailable");
    }
  } finally { tmux("kill-server"); }
});

test("real tmux live scan fetches message text only for selected worktree", async () => {
  const server = `twm-selected-messages-${process.pid}`;
  const tmux = (...args: string[]) => execFileSync("tmux", ["-L", server, "-f", "/dev/null", ...args], { encoding: "utf8", timeout: 2000 }).trim();
  const previous = process.env.TMUX;
  const previousOrigin = process.env.TWM_ORIGIN_SESSION;
  const previousClient = process.env.TWM_ORIGIN_CLIENT;
  delete process.env.TWM_ORIGIN_CLIENT;
  const a = item("/repo/a", "a"), b = item("/repo/b", "b");
  try {
    for (const entry of [a, b]) {
      const pane = tmux("new-session", "-d", "-P", "-F", "#{pane_id}", "-s", entry.sessionName, `exec '${process.execPath}' -e 'setInterval(()=>{},1000)'`);
      tmux("set-option", "-p", "-t", pane, "@twm_pi", `v2|42|${Date.now()}|idle|0||0|0`);
      tmux("set-option", "-p", "-t", pane, "@twm_pi_messages", `m1|42|${Date.now()}|${Buffer.from(`${entry.name} human`).toString("base64url")}|`);
    }
    process.env.TMUX = tmux("display-message", "-p", "-t", "a", "#{socket_path},#{pid},0");
    await Bun.sleep(50); // let exec replace the initial shell in each pane
    process.env.TWM_ORIGIN_SESSION = tmux("display-message", "-p", "-t", "a", "#{session_id}");
    const metadata = await loadLiveItems([a, b]);
    expect(metadata.map(entry => entry.isCurrentSession)).toEqual([true, false]);
    process.env.TWM_ORIGIN_SESSION = tmux("display-message", "-p", "-t", "b", "#{session_id}");
    expect(metadata.map(entry => entry.agentPanes?.[0]?.messages)).toEqual([undefined, undefined]);
    const selected = await loadLiveItems([a, b], b.path);
    expect(selected.map(entry => entry.isCurrentSession)).toEqual([false, true]);
    expect(selected[1]?.agentUnavailable).toBe(false);
    expect(selected[1]?.agentPanes).toHaveLength(1);
    expect(selected[0]?.agentPanes?.[0]?.messages).toBeUndefined();
    expect(selected[1]?.agentPanes?.[0]?.messages?.human).toBe("b human");
  } finally {
    if (previous === undefined) delete process.env.TMUX; else process.env.TMUX = previous;
    if (previousOrigin === undefined) delete process.env.TWM_ORIGIN_SESSION; else process.env.TWM_ORIGIN_SESSION = previousOrigin;
    if (previousClient === undefined) delete process.env.TWM_ORIGIN_CLIENT; else process.env.TWM_ORIGIN_CLIENT = previousClient;
    try { tmux("kill-server"); } catch {}
  }
});

test("fresh reports identify Node/Bun Pi without a title, not a stale shell", () => {
  const record = `v1|42|${Date.now()}|working|0`;
  expect(parseAgentPanes(`$7\t%3\t1\t3\t0\t0\t0\t1\t${record}`)).toHaveLength(1);
  expect(parseAgentPanes(`$7\t%3\t1\t3\t0\t1\t0\t0\t${record}`)).toHaveLength(0);
  const expired = parseAgentPanes("$7\t%3\t1\t3\t0\t0\t0\t1\tv1|42|1|idle|0");
  expect(expired).toHaveLength(1);
  expect(agentActivityBadge(expired)).toBe("π detected");
});
