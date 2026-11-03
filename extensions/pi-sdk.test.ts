import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Opt-in host SDK contract test. No Pi dependency is required by twm or the
// extension. Point TWM_PI_SDK_DIR at an existing installed pi-coding-agent dir.
const sdk = process.env.TWM_PI_SDK_DIR;
(sdk ? test : test.skip)("installed Pi loader/runner emits real TUI dialog events to the reporter", async () => {
  const { createExtensionRuntime, loadExtensions } = await import(`${sdk}/dist/core/extensions/loader.js`);
  const { ExtensionRunner } = await import(`${sdk}/dist/core/extensions/runner.js`);
  const { createEventBus } = await import(`${sdk}/dist/core/event-bus.js`);
  const { SessionManager } = await import(`${sdk}/dist/core/session-manager.js`);
  const server = `twm-pi-sdk-${process.pid}`;
  const tmux = (...args: string[]) => execFileSync("tmux", ["-L", server, "-f", "/dev/null", ...args],
    { encoding: "utf8", timeout: 2_000 }).trim();
  const pane = tmux("new-session", "-d", "-P", "-F", "#{pane_id}", "-s", "sdk", "sleep 90");
  const original = { TMUX: process.env.TMUX, TMUX_PANE: process.env.TMUX_PANE };
  process.env.TMUX = tmux("display-message", "-p", "-t", pane, "#{socket_path},#{pid},0");
  process.env.TMUX_PANE = pane;
  const read = () => tmux("display-message", "-p", "-t", pane, "#{@twm_pi}");
  const wait = async (state: string, count: number) => {
    for (let n = 0; n < 100; n++) {
      const record = read();
      if (record.split("|")[3] === state && Number(record.split("|")[4]) === count) {
        expect(record).toMatch(/^v2\|[1-9][0-9]*\|[1-9][0-9]*\|(working|thinking|responding|tool|needs-input|idle|done|error|stopped)\|[0-9]+\|[A-Za-z0-9_.:+-]*\|[0-9]+\|[0-9]+$/);
        return;
      }
      await Bun.sleep(10);
    }
    throw new Error(`Expected ${state}/${count}, got ${read()}`);
  };
  let runner: any;
  let finishDialog: (() => void) | undefined;
  const bus = createEventBus();
  const installed = fs.mkdtempSync(path.join(os.tmpdir(), "twm-sdk-install-"));
  const entrypoint = path.join(installed, "extensions/twm/index.ts");
  try {
    execFileSync("bash", [new URL("../scripts/install-reporter.sh", import.meta.url).pathname, "pi"],
      { env: { ...process.env, PI_CODING_AGENT_DIR: installed } });
    const runtime = createExtensionRuntime();
    const loaded = await loadExtensions([entrypoint], process.cwd(), bus, runtime);
    expect(loaded.errors).toEqual([]);
    expect(loaded.extensions).toHaveLength(1);
    expect(read()).toBe(""); // factory must not spawn before session_start
    runner = new ExtensionRunner(loaded.extensions, runtime, process.cwd(), SessionManager.inMemory(), {});
    const errors: unknown[] = [];
    runner.onError((error: unknown) => errors.push(error));
    let idle = true;
    // Bind only context actions required for observation. No AgentSession,
    // provider, auth storage, model call, client terminal or user settings.
    runner.bindCore({ getAllTools: () => [{ name: "pax_subagent" }] }, { getModel: () => undefined, getScopedModels: () => [], isIdle: () => idle,
      getSignal: () => undefined, abort: () => {}, hasPendingMessages: () => false, shutdown: () => {},
      getContextUsage: () => undefined, compact: () => {}, getSystemPrompt: () => "" });
    runner.setUIContext({ notify: () => {}, confirm: () => new Promise<boolean>(resolve => {
      finishDialog = () => resolve(true);
    }) }, "tui");
    await runner.emit({ type: "session_start" });
    await wait("idle", 0);
    idle = false;
    await runner.emit({ type: "input", source: "interactive", text: "Latest human request", images: [] });
    await runner.emit({ type: "agent_start" });
    await wait("working", 0);
    await runner.emit({ type: "tool_execution_start", toolCallId: "outer", toolName: "example", args: {} });
    await runner.emit({ type: "tool_execution_start", toolCallId: "outer/1", parentToolCallId: "outer", toolName: "example", args: {} });
    await wait("tool", 2);
    expect(read().split("|")[5]).toBe("example");
    // The actual runner wrapper emits ui_prompt_start/end via pi.on; this
    // catches use of the wrong event bus or registration surface.
    const dialog = runner.getUIContext().confirm("SECRET title", "SECRET body");
    await wait("needs-input", 2);
    finishDialog!();
    await dialog;
    await wait("tool", 2);
    for (const toolCallId of ["outer/1", "outer"]) await runner.emit({ type: "tool_execution_end",
      toolCallId, toolName: "example", result: { secret: "not published" }, isError: false });
    await runner.emit({ type: "agent_end", messages: [] });
    await wait("working", 0);
    await runner.emit({ type: "agent_settled" });
    await wait("working", 0); // settlement still requires ctx.isIdle
    idle = true;
    await runner.emit({ type: "agent_settled" });
    await wait("done", 0);
    bus.emit("pax:subagent-activity", { active: true });
    await Bun.sleep(40);
    const childRecord = () => tmux("display-message", "-p", "-t", pane, "#{@twm_pi_children}");
    expect(childRecord().split("|")[3]).toBe("active");
    expect(read().split("|")[3]).toBe("done"); // parent and child activity are independent
    bus.emit("pax:subagent-activity", { active: false });
    await Bun.sleep(40); expect(childRecord().split("|")[3]).toBe("inactive");
    for (const [stopReason, state] of [["error", "error"], ["aborted", "stopped"], ["stop", "done"]]) {
      idle = false; await runner.emit({ type: "agent_start" });
      await runner.emit({ type: "message_update", message: { role: "assistant" }, assistantMessageEvent: { type: "thinking_start" } });
      await wait("thinking", 0);
      await runner.emit({ type: "message_update", message: { role: "assistant" }, assistantMessageEvent: { type: "text_start" } });
      await wait("responding", 0);
      await runner.emit({ type: "message_end", message: { role: "assistant", stopReason, content: [{ type: "text", text: "Latest agent reply" }] } });
      idle = true; await runner.emit({ type: "agent_settled" });
      await wait(state, 0);
      await Bun.sleep(30);
      const preview = tmux("display-message", "-p", "-t", pane, "#{@twm_pi_messages}");
      expect(Buffer.from(preview.split("|")[3]!, "base64url").toString()).toBe("Latest human request");
      expect(Buffer.from(preview.split("|")[4]!, "base64url").toString()).toBe("Latest agent reply");
    }
    const command = runner.getCommand("twm-report");
    expect(command).toBeDefined();
    await command.handler("off", runner.createCommandContext());
    expect(read()).toBe(""); expect(tmux("display-message", "-p", "-t", pane, "#{@twm_pi_messages}")).toBe("");
    expect(childRecord()).toBe("");
    bus.emit("pax:subagent-activity", { active: true }); await Bun.sleep(30);
    expect(childRecord()).toBe("");
    await command.handler("on", runner.createCommandContext()); await wait("idle", 0);
    await runner.emit({ type: "session_shutdown" });
    expect(read()).toBe("");
    expect(runner.hasHandlers("ui_prompt_start")).toBe(false);
    expect(errors).toEqual([]);
    const oldRunner = runner;
    oldRunner.invalidate();
    // Match the installed AgentSession.reload ordering: await old shutdown,
    // invalidate old runner, load/build fresh runtime, then session_start.
    // This is an offline runner replacement, not a live agent reload.
    const replacementRuntime = createExtensionRuntime();
    const replacement = await loadExtensions([entrypoint], process.cwd(), bus, replacementRuntime);
    expect(replacement.errors).toEqual([]);
    runner = new ExtensionRunner(replacement.extensions, replacementRuntime, process.cwd(), SessionManager.inMemory(), {});
    runner.onError((error: unknown) => errors.push(error));
    runner.bindCore({ getAllTools: () => [{ name: "pax_subagent" }] }, { getModel: () => undefined, getScopedModels: () => [], isIdle: () => true,
      getSignal: () => undefined, abort: () => {}, hasPendingMessages: () => false, shutdown: () => {},
      getContextUsage: () => undefined, compact: () => {}, getSystemPrompt: () => "" });
    runner.setUIContext({}, "tui");
    await runner.emit({ type: "session_start", reason: "reload" });
    await wait("idle", 0);
    const replacementRecord = read();
    expect(replacementRecord.split("|")[1]).toBe(String(process.pid));
    await oldRunner.emit({ type: "session_shutdown", reason: "reload" });
    expect(read()).toBe(replacementRecord); // idempotent old clear cannot touch new record
    expect(errors).toEqual([]);
  } finally {
    finishDialog?.();
    if (runner) await runner.emit({ type: "session_shutdown" });
    bus.clear();
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    tmux("kill-server");
    fs.rmSync(installed, { recursive: true, force: true });
  }
}, 10_000);
