import { afterAll, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import extension from "./pi";
import { clearCommand, PiActivity, PiReporter, previewText, publishCommand, publishMessagesCommand, runTmux, STALE_MS, validTarget } from "./pi-reporter";

const idle = { isIdle: () => true };
const busy = { isIdle: () => false };
const flush = async () => { for (let n = 0; n < 8; n++) await Promise.resolve(); };

function fixture() {
  const handlers = new Map<string, Set<(event: any, ctx: any) => unknown>>();
  const commands = new Map<string, any>();
  const api = { getAllTools: () => [{ name: "pax_subagent" }], events: { on(name: string, handler: (data: unknown) => void) {
    return api.on(name, handler);
  } }, registerCommand(name: string, options: any) { commands.set(name, options); }, on(name: string, handler: (event: any, ctx: any) => unknown) {
    if (!handlers.has(name)) handlers.set(name, new Set());
    handlers.get(name)!.add(handler);
    return () => { handlers.get(name)!.delete(handler); };
  } };
  return { api: api as unknown as ExtensionAPI, handlers, commands,
    async emit(name: string, ctx: any, event: any = {}) {
      for (const handler of [...(handlers.get(name) ?? [])]) await handler(event, ctx);
    } };
}

test("message previews bound text and strip terminal controls without collecting thinking or tool content", () => {
  expect(previewText([{ type: "thinking", thinking: "PRIVATE" }, { type: "toolCall", args: "PRIVATE" },
    { type: "text", text: "\x1b[31mHello\x1b[0m\nworld\u202e" }, { type: "image", data: "PRIVATE" }])).toBe("Hello world");
  expect(Array.from(previewText("🙂".repeat(500))).length).toBe(320);
  expect(previewText("A\x1b]0;injected title\x07B")).toBe("AB");
  const command = publishMessagesCommand("%1", 42, 1000, { human: "'; kill-server; '#{pane_title}\nnext", agent: "done" });
  expect(command.join(" ")).not.toContain("kill-server");
  expect(command[5]).toMatch(/m1\|42\|1000\|[A-Za-z0-9_-]*\|[A-Za-z0-9_-]*/);
});

describe("activity truth, not terminal heuristics", () => {
  test("parallel and nested tool IDs are counted once; final tool end is not settlement", () => {
    const a = new PiActivity();
    expect(a.snapshot(true)).toMatchObject({ state: "idle", toolCount: 0 });
    a.agentStart();
    expect(a.snapshot(false).state).toBe("working");
    for (const id of ["a", "b", "a/1", "a/1/1", "a"]) a.toolStart(id);
    expect(a.snapshot(false)).toMatchObject({ state: "tool", toolCount: 4 });
    a.toolEnd("unknown");
    a.toolEnd("a");
    expect(a.snapshot(false).toolCount).toBe(3);
    for (const id of ["b", "a/1", "a/1/1"]) a.toolEnd(id);
    expect(a.snapshot(true).state).toBe("working");
    a.agentSettled();
    expect(a.snapshot(true).state).toBe("done");
  });

  test("only explicit dialogs imply needs-input, nested waits restore ongoing work", () => {
    const a = new PiActivity();
    a.agentStart(); a.toolStart("secret/path/tool");
    a.promptStart(); a.promptStart();
    a.promptEnd();
    expect(a.snapshot(false)).toMatchObject({ state: "needs-input", toolCount: 1 });
    a.promptEnd(); a.promptEnd();
    expect(a.snapshot(false).state).toBe("tool");
    a.toolEnd("secret/path/tool"); a.agentSettled();
    expect(a.snapshot(true).state).toBe("done");
  });

  test("abort, missing events and compaction never manufacture idle", () => {
    const a = new PiActivity();
    expect(a.snapshot(false).state).toBe("working"); // idle-session compaction
    expect(a.snapshot(true).state).toBe("idle");
    a.agentStart(); a.toolStart("aborted");
    expect(a.snapshot(true).state).toBe("tool"); // missing end/settled
    a.agentSettled();
    expect(a.snapshot(false).state).toBe("tool"); // compaction still active
    expect(a.snapshot(true)).toMatchObject({ state: "done", toolCount: 0 });
    a.agentStart();
    expect(a.snapshot(true).state).toBe("working"); // agent_end alone not enough
  });
});

test("run clock spans retries/queued continuations until final settlement", () => {
  let now = 1000; const a = new PiActivity(() => now);
  a.agentStart(); now = 5000; a.messageEnd("error"); a.agentStart();
  expect(a.snapshot(false).startedAt).toBe(1000);
  now = 14000; a.messageEnd("stop"); a.agentSettled();
  expect(a.snapshot(true)).toMatchObject({ state: "done", startedAt: 1000, finishedAt: 14000 });
  now = 16000; a.agentStart(); expect(a.snapshot(false).startedAt).toBe(16000);
});

test("rich lifecycle reports phase, bounded tool names, elapsed time and terminal outcome without contents", () => {
  let now = 1000;
  const a = new PiActivity(() => now);
  expect(a.snapshot(true)).toMatchObject({ state: "idle", startedAt: 0 });
  a.agentStart(); a.stream("thinking_delta");
  expect(a.snapshot(false).state).toBe("thinking");
  expect(a.stream("thinking_delta")).toBe(false); // token bursts do not publish bursts
  a.stream("text_delta"); expect(a.snapshot(false).state).toBe("responding");
  a.toolStart("outer", "codemode"); a.toolStart("nested", "read"); a.toolStart("unsafe", "secret/path\n;cmd");
  expect(a.snapshot(false)).toMatchObject({ state: "tool", tools: ["codemode", "read", "unknown"], toolCount: 3 });
  const wire = publishCommand("%1", 42, now, a.snapshot(false), true).join(" ");
  expect(wire).not.toContain("secret"); expect(wire).toContain("codemode+read+unknown");
  a.messageEnd("error"); a.agentSettled(); now = 2000;
  expect(a.snapshot(false).state).toBe("tool"); // unfinished compaction/tools still active
  expect(a.snapshot(true)).toMatchObject({ state: "error", finishedAt: 2000, startedAt: 1000, toolCount: 0 });
  now = 3000; expect(a.snapshot(true).finishedAt).toBe(2000);
  a.promptStart(); expect(a.snapshot(true)).toMatchObject({ state: "needs-input", finishedAt: 0 }); a.promptEnd();
  a.agentStart(); a.messageEnd("aborted"); a.agentSettled();
  expect(a.snapshot(true).state).toBe("stopped");
  a.agentStart(); a.messageEnd("error"); a.messageEnd("stop"); a.agentSettled();
  expect(a.snapshot(true).state).toBe("done"); // successful retry replaces terminal error
});

describe("bounded asynchronous publisher", () => {
  test("one in flight, coalesced pending state, shutdown drains then clears only once", async () => {
    const calls: string[][] = [];
    let release!: (accepted: boolean) => void;
    const r = new PiReporter("%1", 42, idle, (args) => {
      calls.push(args);
      return calls.length === 1 ? new Promise(resolve => { release = resolve; }) : Promise.resolve(true);
    }, () => 100_000);
    let removed = 0;
    r.subscribe(() => removed++);
    r.start();
    r.activity.agentStart();
    for (let n = 0; n < 500; n++) { r.activity.toolStart(String(n)); r.update(busy); }
    expect(calls.length).toBe(1);
    const stopped = r.stop();
    expect(r.stop()).toBe(stopped);
    r.update();
    release(true);
    await stopped;
    expect(calls.length).toBe(2);
    expect(calls[1]).toEqual(clearCommand("%1", 42));
    expect(removed).toBe(1);
  });

  test("pending updates coalesce and displaced writers cannot reclaim", async () => {
    const calls: string[][] = [];
    let release!: (accepted: boolean) => void;
    const r = new PiReporter("%2", 43, idle, args => {
      calls.push(args);
      return calls.length === 1 ? new Promise(resolve => { release = resolve; }) : Promise.resolve(false);
    }, () => 100_000);
    r.update();
    r.activity.agentStart(); r.update(busy);
    r.activity.toolStart("x"); r.update(busy);
    r.activity.promptStart(); r.update(busy);
    release(true);
    await flush();
    expect(calls.length).toBe(3);
    expect(calls[2]![5]).toContain("v2|43|100000|needs-input|1");
    expect(calls[2]![4]).not.toContain("15000"); // already owned: no stale-claim path
    r.update(); await flush();
    expect(calls.length).toBe(3);
    await r.stop();
  });

  test("transport rejection does not escape and remains retryable", async () => {
    const calls: string[][] = [];
    const r = new PiReporter("%3", 44, idle, async args => {
      calls.push(args); throw new Error("missing tmux");
    }, () => 100_000);
    r.update(); await flush(); r.update(); await flush();
    expect(calls.length).toBe(2);
    await r.stop();
  });

  test("failed observation clears status instead of renewing a false activity heartbeat", async () => {
    const calls: string[][] = [];
    const r = new PiReporter("%3", 44, idle, async args => { calls.push(args); return true; }, () => 100_000);
    r.start(); await flush();
    expect(calls[0]![5]).toContain("|idle|0");
    r.update({ isIdle() { throw new Error("stale context"); } });
    await r.stop();
    expect(calls.at(-1)).toEqual(clearCommand("%3", 44));
    r.update(); await flush();
    expect(calls).toHaveLength(3);
  });

  test("target and wire values reject arbitrary text", () => {
    expect(validTarget("/tmp/a,123,0", "%123")).toBe(true);
    for (const pane of ["", "1", "%1; kill-server", "%1\n", "session:1.0"]) expect(validTarget("/tmp/a,123,0", pane)).toBe(false);
    for (const tmux of [undefined, "", "/tmp/a", "/tmp/a,0,0", "/tmp/a\n,123,0"]) expect(validTarget(tmux, "%0")).toBe(false);
    expect(() => publishCommand("%1", 1, 1, { state: "prompt text" as any, toolCount: 0 }, true)).toThrow();
    expect(() => clearCommand("%1; kill-server", 1)).toThrow();
    expect(() => clearCommand("%1", NaN)).toThrow();
  });
});

// This server is always isolated (-L + -f /dev/null), never the user's server.
const server = `twm-pi-test-${process.pid}`;
let started = false;
function tmux(...args: string[]) {
  return execFileSync("tmux", ["-L", server, "-f", "/dev/null", ...args], { encoding: "utf8", timeout: 2_000 }).trim();
}
afterAll(() => { if (started) tmux("kill-server"); });

test("real tmux: exact pane records, ownership, expiry and safe malformed values", async () => {
  const pane = tmux("new-session", "-d", "-P", "-F", "#{pane_id}", "-s", "reporter", "sleep 90");
  started = true;
  const other = tmux("split-window", "-d", "-P", "-F", "#{pane_id}", "-t", pane, "sleep 90");
  const read = (target = pane) => tmux("show-options", "-p", "-v", "-t", target, "@twm_pi");
  const t = 1_000_000;
  const publish = (pid: number, now: number, state = "idle", count = 0, claim = true) =>
    tmux(...publishCommand(pane, pid, now, { state: state as any, toolCount: count }, claim));
  expect(publish(101, t, "working")).toBe("1");
  expect(read()).toBe(`v2|101|${t}|working|0||0|0`);
  expect(publish(202, t + 1)).toBe("0");
  expect(publish(202, t + STALE_MS)).toBe("0");
  expect(publish(202, t + STALE_MS + 1, "tool", 3)).toBe("1");
  expect(read()).toBe(`v2|202|${t + STALE_MS + 1}|tool|3||0|0`);
  expect(publish(101, t + 50_000, "idle", 0, false)).toBe("0");
  tmux(...publishMessagesCommand(pane, 202, t + STALE_MS + 1, { human: "New owner", agent: "Reply" }));
  const messageRecord = () => tmux("show-options", "-p", "-v", "-t", pane, "@twm_pi_messages");
  const ownedMessages = messageRecord();
  tmux(...publishMessagesCommand(pane, 101, t + STALE_MS + 1, { human: "Old owner", agent: "Must not replace" }));
  expect(messageRecord()).toBe(ownedMessages);
  tmux(...clearCommand(pane, 101));
  expect(messageRecord()).toBe(ownedMessages);
  expect(read()).toBe(`v2|202|${t + STALE_MS + 1}|tool|3||0|0`);
  tmux(...publishCommand(other, 303, t + 1, { state: "needs-input", toolCount: 1 }, true));
  tmux(...clearCommand(pane, 202));
  expect(tmux("display-message", "-p", "-t", pane, "#{@twm_pi_messages}")).toBe("");
  expect(tmux("display-message", "-p", "-t", pane, "#{@twm_pi}")).toBe("");
  expect(read(other)).toBe(`v2|303|${t + 1}|needs-input|1||0|0`);
  // No interpolation of caller-controlled record text into executable commands.
  tmux("set-option", "-p", "-t", pane, "@twm_pi", "bad'; kill-server; '#{pane_title}");
  expect(publish(404, t + 100_000)).toBe("1");
  expect(read()).toBe(`v2|404|${t + 100_000}|idle|0||0|0`);
  // Numeric expiry works across timestamps of different lengths.
  tmux("set-option", "-p", "-t", pane, "@twm_pi", "v1|505|999|idle|0");
  expect(publish(606, 20_000)).toBe("1");
  expect(read()).toBe("v2|606|20000|idle|0||0|0");
});

test("extension lifecycle on isolated tmux: public event adapter, heartbeat, session fencing", async () => {
  const pane = tmux("new-window", "-d", "-P", "-F", "#{pane_id}", "-t", "reporter", "sleep 90");
  const socket = tmux("display-message", "-p", "-t", pane, "#{socket_path}");
  const env = { TMUX: process.env.TMUX, TMUX_PANE: process.env.TMUX_PANE };
  process.env.TMUX = `${socket},${process.pid},0`;
  process.env.TMUX_PANE = pane;
  const f = fixture();
  const ctx = { mode: "tui", ...idle };
  const read = () => tmux("display-message", "-p", "-t", pane, "#{@twm_pi}");
  const waitFor = async (state: string) => {
    for (let n = 0; n < 100; n++) {
      if (read().split("|")[3] === state) return;
      await Bun.sleep(10);
    }
    throw new Error(`State not published: ${state}, got ${read()}`);
  };
  try {
    extension(f.api);
    expect(read()).toBe(""); // factory starts no resource
    await f.emit("session_start", { ...ctx, mode: "rpc" });
    expect(read()).toBe("");
    await f.emit("session_start", ctx);
    await waitFor("idle");
    const childRecord = () => tmux("display-message", "-p", "-t", pane, "#{@twm_pi_children}");
    const waitChild = async (state: string) => {
      for (let n = 0; n < 100; n++) { if (childRecord().split("|")[3] === state) return; await Bun.sleep(10); }
      throw new Error(`Child state missing: ${state}`);
    };
    await waitChild("unknown");
    await f.emit("pax:subagent-activity", ctx, { active: true }); await waitChild("active");
    await f.emit("pax:subagent-activity", ctx, { active: "false", secret: "PRIVATE" });
    await Bun.sleep(20); expect(childRecord().split("|")[3]).toBe("active");
    await f.emit("input", ctx, { source: "interactive", text: "Human says 'hi'; #{pane_title}\nnext" });
    await f.emit("agent_start", ctx);
    await waitFor("working");
    await f.emit("tool_execution_start", ctx, { toolCallId: "outer", args: "SECRET" });
    await f.emit("tool_execution_start", ctx, { toolCallId: "outer/1" });
    await waitFor("tool");
    await f.emit("ui_prompt_start", ctx, { title: "SECRET" });
    await waitFor("needs-input");
    expect(read()).toMatch(/^v2\|[1-9][0-9]*\|[1-9][0-9]*\|needs-input\|2\|unknown\|[1-9][0-9]*\|0$/);
    await f.emit("ui_prompt_end", ctx);
    await f.emit("tool_execution_end", ctx, { toolCallId: "outer/1" });
    await f.emit("tool_execution_end", ctx, { toolCallId: "outer" });
    await f.emit("agent_end", ctx); // intentionally not subscribed
    await waitFor("working");
    await f.emit("message_end", ctx, { message: { role: "assistant", stopReason: "stop", content: [
      { type: "thinking", thinking: "NOT SHARED" }, { type: "text", text: "Agent reply" }] } });
    await f.emit("agent_settled", ctx);
    await waitFor("done");
    expect(childRecord().split("|")[3]).toBe("active"); // parent settlement does not settle children
    await f.emit("pax:subagent-activity", ctx, { active: false }); await waitChild("inactive");
    await Bun.sleep(30);
    const messageRecord = () => tmux("display-message", "-p", "-t", pane, "#{@twm_pi_messages}");
    expect(Buffer.from(messageRecord().split("|")[3]!, "base64url").toString()).toBe("Human says 'hi'; #{pane_title} next");
    expect(Buffer.from(messageRecord().split("|")[4]!, "base64url").toString()).toBe("Agent reply");
    await f.emit("input", ctx, { source: "extension", text: "NOT HUMAN" });
    await f.emit("message_end", ctx, { message: { role: "assistant", stopReason: "toolUse", content: [
      { type: "thinking", thinking: "NOT SHARED" }, { type: "toolCall", args: "NOT SHARED" }] } });
    await Bun.sleep(30);
    expect(Buffer.from(messageRecord().split("|")[3]!, "base64url").toString()).toBe("Human says 'hi'; #{pane_title} next");
    expect(Buffer.from(messageRecord().split("|")[4]!, "base64url").toString()).toBe("Agent reply");
    await f.emit("message_end", ctx, { message: { role: "assistant", stopReason: "stop", content: [{ type: "text", text: "New reply" }] } });
    await Bun.sleep(30);
    expect(Buffer.from(messageRecord().split("|")[4]!, "base64url").toString()).toBe("New reply");
    const commandCtx = Object.assign(ctx, { ui: { notify() {} } });
    await f.commands.get("twm-report").handler("off", commandCtx);
    expect(read()).toBe(""); expect(messageRecord()).toBe(""); expect(childRecord()).toBe("");
    expect(f.handlers.get("pax:subagent-activity")?.size).toBe(0);
    expect(f.handlers.get("input")?.size).toBe(0);
    await f.emit("session_start", ctx); // switching/new sessions retain off in this runtime
    expect(read()).toBe(""); expect(messageRecord()).toBe("");
    await f.emit("input", ctx, { source: "interactive", text: "WHILE OFF" });
    await f.commands.get("twm-report").handler("on", commandCtx); await waitFor("idle");
    await waitChild("unknown");
    await Bun.sleep(30);
    expect(messageRecord()).toMatch(/^m1\|[1-9][0-9]*\|[1-9][0-9]*\|\|$/); // no history/backfill after enabling
    const before = Number(read().split("|")[2]);
    ctx.isIdle = () => false; // compaction can begin without agent_start
    await Bun.sleep(5_100);
    await waitFor("working");
    expect(Number(read().split("|")[2])).toBeGreaterThan(before);
    ctx.isIdle = () => true;
    await f.emit("session_shutdown", ctx);
    expect(read()).toBe("");
    expect(f.handlers.get("ui_prompt_start")?.size).toBe(0);
    await f.emit("session_shutdown", ctx);
    const restarting = f.emit("session_start", ctx);
    const shutdown = f.emit("session_shutdown", ctx);
    await Promise.all([restarting, shutdown]);
    expect(read()).toBe(""); // shutdown fences pending start
    await f.emit("session_start", ctx);
    await waitFor("idle");
    await f.emit("session_start", ctx); // same PID replacement drains old clear
    await waitFor("idle");
    expect(f.handlers.get("agent_start")?.size).toBe(1);
  } finally {
    await f.emit("session_shutdown", ctx);
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}, 15_000);

test("default transport absorbs absent tmux pane errors", async () => {
  expect(await runTmux(["-L", server, "show-options", "-p", "-t", "%99999999", "@twm_pi"])).toBeUndefined();
});
