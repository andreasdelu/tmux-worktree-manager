import fs from "node:fs";
import path from "node:path";
import { runCommand } from "./commands";
import type { AgentPane, AgentReport, Item } from "../types";
import { defaultSessionNameFor } from "./session";
import { associatedSessionName, parseSessionRecords, sessionListFormat } from "./sessionAssociations";

// Boolean title detection deliberately avoids reading titles, argv or pane contents.
// Activity metadata is separate from bounded live-only message previews.
export const parseAgentReport = (value: string, now = Date.now()): AgentReport | undefined => {
  const rich = value.startsWith("v2|");
  const match = rich
    ? value.match(/^v2\|([1-9]\d*)\|([1-9]\d*)\|(working|thinking|responding|tool|needs-input|idle|done|error|stopped)\|(\d+)\|((?:[A-Za-z][A-Za-z0-9_.:-]{0,63}(?:\+[A-Za-z][A-Za-z0-9_.:-]{0,63}){0,2})?)\|(\d+)\|(\d+)$/)
    : value.match(/^v1\|([1-9]\d*)\|([1-9]\d*)\|(working|tool|needs-input|idle)\|(\d+)$/);
  if (!match || match[0] !== value) return undefined;
  const [, pid, heartbeat, state, toolCount] = match;
  const report = { pid: Number(pid), heartbeat: Number(heartbeat), state, toolCount: Number(toolCount) } as AgentReport;
  if (![report.pid, report.heartbeat, report.toolCount].every(Number.isSafeInteger) ||
      report.heartbeat > now || now - report.heartbeat >= 15_000 ||
      (report.state === "tool" && report.toolCount < 1) || (report.state === "idle" && report.toolCount !== 0)) return undefined;
  if (rich) {
    report.tools = match[5] ? match[5].split("+") : [];
    report.startedAt = Number(match[6]); report.finishedAt = Number(match[7]);
    const terminal = ["done", "error", "stopped"].includes(report.state);
    if (![report.startedAt, report.finishedAt].every(time => Number.isSafeInteger(time) && time! >= 0 && time! <= report.heartbeat)
      || (report.finishedAt && (!report.startedAt || report.finishedAt < report.startedAt))
      || (terminal && (!report.finishedAt || report.toolCount))
      || (!terminal && report.finishedAt) || (report.state === "idle" && report.startedAt)
      || report.tools.length > report.toolCount) return undefined;
  }
  return report;
};
// Validate before raw option text enters line/TSV framing. Otherwise an added
// newline could make a corrupt report's prefix look like a valid idle record.
const reportPattern = "^(v1[|][1-9][0-9]*[|][1-9][0-9]*[|](working|tool|needs-input|idle)[|][0-9]+|v2[|][1-9][0-9]*[|][1-9][0-9]*[|](working|thinking|responding|tool|needs-input|idle|done|error|stopped)[|][0-9]+[|]([A-Za-z][A-Za-z0-9_.:-]*([+][A-Za-z][A-Za-z0-9_.:-]*)*)?[|][0-9]+[|][0-9]+)$";
const reportFormat = `#{?#{&&:#{m/r:${reportPattern},#{@twm_pi}},#{==:#{m/r:[[:cntrl:]],#{@twm_pi}},0}},#{@twm_pi},#{?#{m/r:^v[12][|],#{@twm_pi}},v1|invalid,}}`;
const messageFormat = "#{?#{&&:#{m/r:^m1[|][1-9][0-9]*[|][1-9][0-9]*[|][A-Za-z0-9_-]*[|][A-Za-z0-9_-]*$,#{@twm_pi_messages}},#{==:#{m/r:[[:cntrl:]],#{@twm_pi_messages}},0}},#{@twm_pi_messages},}";
const childFormat = "#{?#{&&:#{m/r:^c1[|][1-9][0-9]*[|][1-9][0-9]*[|](unknown|active|inactive)$,#{@twm_pi_children}},#{==:#{m/r:[[:cntrl:]],#{@twm_pi_children}},0}},#{@twm_pi_children},#{?#{@twm_pi_children},c1|invalid,}}";
export const parseChildActivity = (value: string, report: AgentReport | undefined, now = Date.now()): AgentPane["children"] => {
  const match = value.match(/^c1\|([1-9]\d*)\|([1-9]\d*)\|(unknown|active|inactive)$/);
  if (!report || !value) return undefined;
  // The presence of a child observation is a support hint, not authority.
  // Invalid/expired/replaced owners mean unknown, never completed children.
  const unknown = { state: "unknown" as const, heartbeat: report.heartbeat };
  if (!match || Number(match[1]) !== report.pid) return unknown;
  const heartbeat = Number(match[2]);
  if (!Number.isSafeInteger(heartbeat) || heartbeat > now || now - heartbeat >= 15000
    || report.heartbeat > now || now - report.heartbeat >= 15000) return unknown;
  return { state: match[3] as "unknown" | "active" | "inactive", heartbeat };
};
export const parseAgentMessages = (value: string, report: AgentReport | undefined, now = Date.now()) => {
  if (!report || value.length > 3500) return undefined;
  const match = value.match(/^m1\|([1-9]\d*)\|([1-9]\d*)\|([A-Za-z0-9_-]*)\|([A-Za-z0-9_-]*)$/);
  if (!match || Number(match[1]) !== report.pid || !Number.isSafeInteger(Number(match[2]))
    || Number(match[2]) > now || now - Number(match[2]) >= 15000
    || report.heartbeat > now || now - report.heartbeat >= 15000) return undefined;
  const decode = (encoded: string) => {
    const bytes = Buffer.from(encoded, "base64url");
    const text = bytes.toString("utf8");
    if (bytes.toString("base64url") !== encoded || text.includes("\uFFFD") || Array.from(text).length > 320
      || /[\p{Cc}\p{Cf}]/u.test(text)) throw new Error("Invalid message preview");
    return text;
  };
  try { return { human: decode(match[3]!), agent: decode(match[4]!), heartbeat: Number(match[2]) }; } catch { return undefined; }
};
export const agentMetadataFormat = ["#{session_id}", "#{pane_id}", "#{window_index}",
  "#{pane_index}", "#{pane_dead}",
  "#{m:π*,#{pane_title}}", "#{m/r:^(pi|pax)$,#{pane_current_command}}",
  "#{m/r:^(node|bun)$,#{pane_current_command}}", reportFormat, childFormat].join("\t");
export const agentPaneFormat = `${agentMetadataFormat}\t${messageFormat}`;

export const parseAgentPanes = (output: string): AgentPane[] => output.split("\n").flatMap(line => {
  const fields = line.split("\t");
  if (fields.length !== 9 && fields.length !== 10 && fields.length !== 11) return [];
  const [sessionId, paneId, windowIndex, paneIndex, dead, title, command, runtime, rawReport] = fields;
  if (!/^\$\d+$/.test(sessionId!) || !/^%\d+$/.test(paneId!) ||
    !/^\d+$/.test(windowIndex!) || !/^\d+$/.test(paneIndex!) ||
    ![dead, title, command, runtime].every(value => /^(0|1)$/.test(value!))) return [];
  const report = parseAgentReport(rawReport!);
  // A stale/malformed first-party report is still a detection hint, not live
  // status. Don't silently hide a reporter-equipped pane when its heartbeat dies.
  const hasReporter = /^v[12]\|/.test(rawReport!);
  if (command !== "1" && !(runtime === "1" && (title === "1" || hasReporter)) && !(dead === "1" && hasReporter)) return [];
  const hasChildren = fields.length === 11 || fields.length === 10 && (fields[9] === "" || fields[9]?.startsWith("c1|"));
  return [{ sessionId: sessionId!, paneId: paneId!, windowIndex: windowIndex!, paneIndex: paneIndex!,
    dead: dead === "1", report, messages: dead === "1" ? undefined : parseAgentMessages(fields[hasChildren ? 10 : 9] ?? "", report),
    children: dead === "1" || !hasChildren ? undefined : parseChildActivity(fields[9] ?? "", report), cwd: "" }];
});

const canonical = (dir: string) => {
  try { return fs.realpathSync(dir); } catch { return path.resolve(dir); }
};

export const annotateAgentPanes = (items: Item[], panes: AgentPane[], sessions: Map<string, string>, available: boolean): Item[] => {
  const worktrees = items.filter(item => item.kind === "worktree" && item.available);
  const bySession = new Map<string, Item>();
  for (const item of worktrees) if (!bySession.has(item.sessionName)) bySession.set(item.sessionName, item);
  const sessionNames = new Set(sessions.values());
  // Per-scan only: symlink and availability changes must be observed next poll.
  const paths = new Map<string, string>();
  const resolve = (dir: string) => {
    if (!paths.has(dir)) paths.set(dir, canonical(dir));
    return paths.get(dir)!;
  };
  const byPath = [...worktrees].sort((a, b) => b.path.length - a.path.length);
  const owned = new Map<string, AgentPane[]>();
  for (const pane of panes) {
    let owner = bySession.get(sessions.get(pane.sessionId) ?? "");
    if (!owner && pane.cwd) {
      const cwd = resolve(pane.cwd);
      owner = byPath.find(item => {
        const relative = path.relative(resolve(item.path), cwd);
        return !relative || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
      });
    }
    if (owner) {
      const group = owned.get(owner.path) ?? [];
      group.push(pane);
      owned.set(owner.path, group);
    }
  }
  return items.map(item => ({ ...item,
    hasSession: sessionNames.has(item.sessionName),
    agentPanes: owned.get(item.path) ?? [], agentUnavailable: !available,
  }));
};

export const loadLiveItems = async (items: Item[], messagePath?: string): Promise<Item[]> => {
  const [sessionResult, paneResult] = await Promise.all([
    runCommand(["tmux", "list-sessions", "-F", sessionListFormat]),
    runCommand(["tmux", "list-panes", "-a", "-F", agentMetadataFormat]),
  ]);
  const records = parseSessionRecords(sessionResult.stdout);
  const sessions = new Map(records.map(session => [session.id, session.name]));
  try {
    items = items.map(item => item.kind === "worktree" ? { ...item,
      sessionName: associatedSessionName(item.path, defaultSessionNameFor(item.path), records),
    } : item);
  } catch {
    // Ambiguous ownership is unavailable, never an invented assignment.
    return items.map(item => ({ ...item, hasSession: false, agentPanes: [], agentUnavailable: true }));
  }
  const panes = parseAgentPanes(paneResult.stdout);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(3, panes.length) }, async () => {
    while (cursor < panes.length) {
      const pane = panes[cursor++]!;
      if (items.some(item => item.sessionName === sessions.get(pane.sessionId))) continue;
      const cwd = await runCommand(["tmux", "display-message", "-p", "-t", pane.paneId, "#{pane_current_path}"]);
      if (cwd.success) pane.cwd = cwd.stdout.replace(/\n$/, "");
    }
  }));
  const annotated = annotateAgentPanes(items, panes, sessions, sessionResult.success && paneResult.success);
  // Only the selected worktree's panes need conversation text. Never collect
  // previews for unrelated panes while scanning global activity metadata.
  const selected = annotated.find(item => item.path === messagePath);
  await Promise.all((selected?.agentPanes ?? []).filter(pane => !pane.dead && pane.report).map(async pane => {
    const result = await runCommand(["tmux", "display-message", "-p", "-t", pane.paneId, messageFormat]);
    if (result.success) pane.messages = parseAgentMessages(result.stdout.replace(/\n$/, ""), pane.report);
  }));
  return annotated;
};

export const agentActivityBadge = (panes: AgentPane[] = [], now = Date.now()): string => {
  if (!panes.length) return "";
  const live = panes.filter(pane => !pane.dead);
  if (!live.length) return "π exited";
  const states = live.map(pane => freshAgentState(pane, now));
  if (states.includes("needs-input")) return "π input";
  if (live.some(pane => freshChildState(pane, now) === "active")) return "π working";
  if (states.includes("tool")) return "π tool";
  for (const state of ["thinking", "responding", "working", "error", "stopped"] as const) {
    if (states.includes(state)) return `π ${state}`;
  }
  if (states.includes(undefined)) return "π detected";
  if (states.includes("done")) return "π done";
  return "π idle";
};

export const freshAgentState = (pane: AgentPane, now = Date.now()) =>
  !pane.dead && pane.report && pane.report.heartbeat <= now && now - pane.report.heartbeat < 15_000 ? pane.report.state : undefined;
export const freshChildState = (pane: AgentPane, now = Date.now()) => freshAgentState(pane, now)
  && pane.children && pane.children.heartbeat <= now && now - pane.children.heartbeat < 15000 ? pane.children.state : undefined;
export const agentIsBusy = (pane: AgentPane, now = Date.now()) =>
  freshChildState(pane, now) === "active" || ["working", "thinking", "responding", "tool"].includes(freshAgentState(pane, now) ?? "");
const toolAction: Record<string, string> = { read: "Reading files", bash: "Running command", edit: "Editing files", write: "Writing files",
  codemode: "Running code", subagent: "Delegating", ask_questions: "Asking questions", grep: "Searching", find: "Finding files", ls: "Listing files" };
export const agentDuration = (pane: AgentPane, now = Date.now()) => {
  if (!freshAgentState(pane, now) || !pane.report?.startedAt) return "";
  const seconds = Math.max(0, Math.floor(((pane.report.finishedAt || now) - pane.report.startedAt) / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
};

export const agentStateLabel = (pane: AgentPane, now = Date.now()): string => {
  if (pane.dead) return "Exited";
  const report = pane.report;
  if (!report || report.heartbeat > now || now - report.heartbeat >= 15_000) return "Detected; status unavailable";
  const children = freshChildState(pane, now) ?? (pane.children ? "unknown" : undefined);
  const parentSettled = ["done", "idle", "error", "stopped"].includes(report.state);
  if (children === "active" && parentSettled) return `Parent ${report.state === "done" ? "finished" : report.state}; children active`;
  if (children === "unknown" && parentSettled) return `Parent ${report.state === "done" ? "finished" : report.state}; children unknown`;
  switch (report.state) {
    case "working": return "Working";
    case "thinking": return "Thinking";
    case "responding": return "Responding";
    case "tool": {
      const names = report.tools ?? [];
      if (!names.length) return `Running tool${report.toolCount === 1 ? "" : "s"} (${report.toolCount})`;
      const actions = names.map(name => toolAction[name] ?? `Calling ${name}`).join(" · ");
      return report.toolCount > 1 ? `${actions} (${report.toolCount} active)` : actions;
    }
    case "needs-input": return "Needs input";
    case "idle": return "Idle";
    case "done": return "Finished";
    case "error": return "Run failed";
    case "stopped": return "Stopped";
  }
};
