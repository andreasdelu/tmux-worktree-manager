import { execFile } from "node:child_process";

export const HEARTBEAT_MS = 5_000;
export const STALE_MS = 15_000;
export type PiState = "working" | "thinking" | "responding" | "tool" | "needs-input" | "idle" | "done" | "error" | "stopped";
export type Snapshot = { state: PiState; toolCount: number; tools?: string[]; startedAt?: number; finishedAt?: number };
export const safeToolName = (name: unknown): string =>
  typeof name === "string" && /^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/.test(name) ? name : "unknown";
export type ReporterContext = { isIdle(): boolean };
export const MESSAGE_LIMIT = 320;
export type MessagePreview = { human: string; agent: string };
export type ChildActivity = "unknown" | "active" | "inactive";

// Text only, bounded before processing; never inspect thinking, tool calls,
// images or attachments. Flatten terminal escapes/bidi/control characters so
// conversation text cannot control the popup's presentation.
export function previewText(content: unknown): string {
  let text = "";
  if (typeof content === "string") text = content.slice(0, 4096);
  else if (Array.isArray(content)) {
    for (const block of content.slice(0, 32)) {
      if (block?.type === "text" && typeof block.text === "string") text += `${block.text.slice(0, 4096)} `;
      if (text.length >= 4096) break;
    }
  }
  const cleaned = text.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "").replace(/[\p{Cc}\p{Cf}]/gu, " ").replace(/\s+/g, " ").trim();
  const chars = Array.from(cleaned);
  return chars.length > MESSAGE_LIMIT ? `${chars.slice(0, MESSAGE_LIMIT - 1).join("")}…` : cleaned;
}

// TMUX is a socket path, server PID and session number. Do not accept shell text
// as a pane target, nor use session/window aliases which can move underneath us.
export function validTarget(tmux: string | undefined, pane: string | undefined): pane is string {
  return !!tmux && !/[\x00-\x1f\x7f]/.test(tmux) && /^.+,[1-9][0-9]*,[0-9]+$/.test(tmux)
    && !!pane && /^%[0-9]+$/.test(pane);
}

export class PiActivity {
  private tools = new Map<string, string>();
  private prompts = 0;
  private settled = true;
  private phase: PiState = "working";
  private outcome: PiState = "done";
  private startedAt = 0;
  private finishedAt = 0;

  constructor(private now: () => number = Date.now) {}
  agentStart() {
    if (this.settled || !this.startedAt) this.startedAt = this.now();
    this.settled = false; this.finishedAt = 0;
    this.phase = "working"; this.outcome = "done"; this.tools.clear();
  }
  toolStart(id: string, name?: unknown) { this.settled = false; this.tools.set(id, safeToolName(name)); }
  toolEnd(id: string) { this.tools.delete(id); this.phase = "working"; }
  stream(type: string) {
    const phase = type.startsWith("thinking_") ? "thinking" : type.startsWith("text_") ? "responding" : undefined;
    if (!phase || this.phase === phase) return false;
    this.phase = phase; return true;
  }
  messageEnd(reason: string) {
    // Read terminal metadata only, never assistant content or error messages.
    this.outcome = reason === "error" ? "error" : reason === "aborted" ? "stopped" : "done";
  }
  promptStart() { this.prompts++; }
  promptEnd() { this.prompts = Math.max(0, this.prompts - 1); }
  agentSettled() { this.settled = true; }

  snapshot(idle: boolean): Snapshot {
    // Settlement plus Pi's own idle check includes retries/compaction. A run
    // ending is not proof of task success; a tool failure alone is not terminal.
    if (this.settled && idle) {
      this.tools.clear();
      if (this.startedAt && !this.finishedAt) this.finishedAt = this.now();
    }
    const state = this.prompts ? "needs-input" : this.tools.size ? "tool"
      : this.settled && idle ? this.startedAt ? this.outcome : "idle" : this.settled ? "working" : this.phase;
    return { state, toolCount: this.tools.size, tools: [...new Set(this.tools.values())].slice(0, 3),
      startedAt: this.startedAt, finishedAt: ["done", "error", "stopped"].includes(state) ? this.finishedAt : 0 };
  }
}

const V1 = "v1[|][1-9][0-9]*[|][1-9][0-9]*[|](working|tool|needs-input|idle)[|][0-9]+";
const V2 = "v2[|][1-9][0-9]*[|][1-9][0-9]*[|](working|thinking|responding|tool|needs-input|idle|done|error|stopped)[|][0-9]+[|]([A-Za-z][A-Za-z0-9_.:-]*([+][A-Za-z][A-Za-z0-9_.:-]*)*)?[|][0-9]+[|][0-9]+";
const RECORD_PATTERN = `(${V1}|${V2})`;
const validRecord = `#{m/r:^${RECORD_PATTERN}$,#{@twm_pi}}`;
const owner = (pid: number) => `#{&&:${validRecord},#{m/r:^v[12][|]${pid}[|],#{@twm_pi}}}`;

function checkIdentity(pane: string, pid: number) {
  if (!/^%[0-9]+$/.test(pane) || !Number.isSafeInteger(pid) || pid <= 0) throw new Error("Invalid reporter identity");
}

// The read/test/write runs inside one tmux command queue, never as a shell or
// client-side read followed by a racy set. All command text is validated enum
// and numeric constants; existing option text is only format data, not code.
export function publishCommand(pane: string, pid: number, now: number, value: Snapshot, claim: boolean): string[] {
  checkIdentity(pane, pid);
  const tools = value.tools ?? [];
  const startedAt = value.startedAt ?? 0, finishedAt = value.finishedAt ?? 0;
  if (!Number.isSafeInteger(now) || now <= 0 || !Number.isSafeInteger(value.toolCount) || value.toolCount < 0
    || !["working", "thinking", "responding", "tool", "needs-input", "idle", "done", "error", "stopped"].includes(value.state)
    || tools.length > 3 || tools.some(name => safeToolName(name) !== name)
    || ![startedAt, finishedAt].every(time => Number.isSafeInteger(time) && time >= 0 && time <= now)
    || (finishedAt > 0 && (!startedAt || finishedAt < startedAt))) throw new Error("Invalid reporter record");
  const timestamp = "#{s/^v[12][|][0-9]+[|]([0-9]+)[|].*$/\\1/:@twm_pi}";
  const stale = `#{&&:${validRecord},#{e|<:${timestamp},${now - STALE_MS}}}`;
  const condition = claim ? `#{||:${owner(pid)},#{||:#{==:${validRecord},0},${stale}}}` : owner(pid);
  const record = `v2|${pid}|${now}|${value.state}|${value.toolCount}|${tools.join("+")}|${startedAt}|${finishedAt}`;
  return ["if-shell", "-F", "-t", pane, condition,
    `set-option -p -t '${pane}' @twm_pi '${record}' ; display-message -p '1'`, "display-message -p '0'"];
}

export function publishMessagesCommand(pane: string, pid: number, now: number, preview: MessagePreview, children?: ChildActivity): string[] {
  checkIdentity(pane, pid);
  if (!Number.isSafeInteger(now) || now <= 0) throw new Error("Invalid message timestamp");
  const encode = (text: string) => Buffer.from(previewText(text), "utf8").toString("base64url");
  // Encode before embedding in a tmux command. No quotes, delimiters, format
  // expressions or controls from message text can enter command/TSV framing.
  const record = `m1|${pid}|${now}|${encode(preview.human)}|${encode(preview.agent)}`;
  if (children !== undefined && !["unknown", "active", "inactive"].includes(children)) throw new Error("Invalid child activity");
  const childCommand = children === undefined ? `set-option -p -u -t '${pane}' @twm_pi_children`
    : `set-option -p -t '${pane}' @twm_pi_children 'c1|${pid}|${now}|${children}'`;
  return ["if-shell", "-F", "-t", pane, owner(pid),
    `set-option -p -t '${pane}' @twm_pi_messages '${record}' ; ${childCommand}`, ""];
}

export function clearCommand(pane: string, pid: number): string[] {
  checkIdentity(pane, pid);
  const messageOwner = `#{m/r:^m1[|]${pid}[|][1-9][0-9]*[|][A-Za-z0-9_-]*[|][A-Za-z0-9_-]*$,#{@twm_pi_messages}}`;
  return ["if-shell", "-F", "-t", pane, messageOwner, `set-option -p -u -t '${pane}' @twm_pi_messages`, "", ";",
    "if-shell", "-F", "-t", pane, owner(pid), `set-option -p -u -t '${pane}' @twm_pi_children ; set-option -p -u -t '${pane}' @twm_pi`];
}

export type Transport = (args: string[]) => Promise<boolean | undefined>;
export const runTmux: Transport = (args) => new Promise((resolve) => {
  execFile("tmux", args, { timeout: 1_000, killSignal: "SIGKILL", maxBuffer: 1_024, windowsHide: true }, (error, stdout) => {
    resolve(error ? undefined : stdout.trim() === "1");
  });
});

export class PiReporter {
  readonly activity: PiActivity;
  private context: ReporterContext;
  private pending: Snapshot | undefined;
  private running: Promise<void> | undefined;
  private stopping: Promise<void> | undefined;
  private stopped = false;
  private owned = false;
  private retired = false;
  private timer: ReturnType<typeof setInterval> | undefined;
  private listeners: Array<() => void> = [];
  private messages: MessagePreview = { human: "", agent: "" };
  private children: ChildActivity | undefined;

  childActivity(state: ChildActivity) {
    if (this.stopped || this.retired) return;
    this.children = state;
    this.update();
  }

  message(role: "human" | "agent", content: unknown) {
    if (this.stopped || this.retired) return;
    const text = previewText(content);
    if (role === "agent" && !text) return; // tool/thinking-only turns do not replace the latest actual text
    this.messages[role] = text;
    this.update();
  }

  constructor(private pane: string, private pid: number, context: ReporterContext,
    private transport: Transport = runTmux, private now: () => number = Date.now) {
    checkIdentity(pane, pid);
    this.context = context;
    this.activity = new PiActivity(now);
  }

  start() {
    if (this.stopped || this.timer) return;
    this.update();
    if (this.stopped) return;
    this.timer = setInterval(() => this.update(), HEARTBEAT_MS);
    this.timer.unref();
  }

  subscribe(unsubscribe: () => void) { this.listeners.push(unsubscribe); }

  update(context?: ReporterContext) {
    if (this.stopped || this.retired) return;
    if (context) this.context = context;
    let idle: boolean;
    try { idle = this.context.isIdle(); } catch {
      // Failed observation is unavailable, not fresh "working" forever.
      // Drain and clear only this owner; never disrupt Pi with observer errors.
      void this.stop();
      return;
    }
    this.pending = this.activity.snapshot(idle);
    // One in-flight command and one coalesced latest update, even during a
    // tool burst. Handlers never await transport on Pi's critical path.
    if (!this.running) {
      this.running = this.drain().finally(() => { this.running = undefined; });
    }
  }

  private async send(args: string[]) {
    try { return await this.transport(args); } catch { return undefined; }
  }

  private async drain() {
    while (this.pending && !this.stopped && !this.retired) {
      const value = this.pending;
      this.pending = undefined;
      let command: string[];
      try { command = publishCommand(this.pane, this.pid, this.now(), value, !this.owned); } catch {
        this.retired = true; this.pending = undefined;
        if (this.timer) clearInterval(this.timer);
        await this.send(clearCommand(this.pane, this.pid));
        return;
      }
      const accepted = await this.send(command);
      if (accepted === true) {
        this.owned = true;
        if (!this.stopped) await this.send(publishMessagesCommand(this.pane, this.pid, this.now(), this.messages, this.children));
      }
      // Once displaced, an old writer cannot reclaim a newer process's pane,
      // even if that process subsequently stops heartbeating.
      if (accepted === false && this.owned) { this.retired = true; this.pending = undefined; }
    }
  }

  stop(): Promise<void> {
    if (this.stopping) return this.stopping;
    this.stopped = true;
    this.pending = undefined;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    for (const unsubscribe of this.listeners.splice(0)) unsubscribe();
    this.stopping = (async () => {
      await this.running;
      await this.send(clearCommand(this.pane, this.pid));
    })();
    return this.stopping;
  }
}
