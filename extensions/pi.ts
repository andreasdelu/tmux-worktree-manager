import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { PiReporter, validTarget } from "./pi-reporter";

/** Optional first-party reporter. Loading the factory itself has no side effects. */
export default function (pi: ExtensionAPI) {
  let reporter: PiReporter | undefined;
  let generation = 0;
  let enabled = true;
  // Also serializes same-PID session replacement against its old clear command.
  let cleanup: Promise<void> = Promise.resolve();

  function stop() {
    generation++;
    const previous = reporter;
    reporter = undefined;
    cleanup = previous?.stop() ?? cleanup;
    return cleanup;
  }

  async function start(ctx: ExtensionContext) {
    const waiting = stop();
    const current = generation;
    await waiting;
    const pane = process.env.TMUX_PANE;
    if (!enabled || ctx.mode !== "tui" || !validTarget(process.env.TMUX, pane)) return;
    // A shutdown while waiting on transport must fence this startup too.
    if (current !== generation) return;
    const next = new PiReporter(pane, process.pid, ctx);
    reporter = next;
    // pi.events is the general inter-extension entrypoint. Pax currently
    // exposes only aggregate activity, not a query/count/result contract.
    // A mid-run reload must not manufacture inactive children.
    if (pi.getAllTools().some(tool => tool.name === "pax_subagent")) next.childActivity("unknown");
    next.subscribe(pi.events.on("pax:subagent-activity", (data: unknown) => {
      if (!data || typeof data !== "object" || typeof (data as { active?: unknown }).active !== "boolean") return;
      next.childActivity((data as { active: boolean }).active ? "active" : "inactive");
    }));
    next.subscribe(pi.on("agent_start", (_event, context) => {
      next.activity.agentStart(); next.update(context);
    }));
    next.subscribe(pi.on("tool_execution_start", (event, context) => {
      next.activity.toolStart(event.toolCallId, event.toolName); next.update(context);
    }));
    next.subscribe(pi.on("tool_execution_end", (event, context) => {
      next.activity.toolEnd(event.toolCallId); next.update(context);
    }));
    next.subscribe(pi.on("message_update", (event, context) => {
      if (next.activity.stream(event.assistantMessageEvent.type)) next.update(context);
    }));
    next.subscribe(pi.on("input", (event) => {
      // Extension/RPC injected prompts are not a human message. No history reads.
      if (event.source === "interactive") next.message("human", event.text);
    }));
    next.subscribe(pi.on("message_end", (event) => {
      if (event.message.role === "assistant") {
        next.activity.messageEnd(event.message.stopReason);
        next.message("agent", event.message.content);
      }
    }));
    next.subscribe(pi.on("agent_settled", (_event, context) => {
      next.activity.agentSettled(); next.update(context);
    }));
    // Installed Pi exposes these public runner events through pi.on(), not
    // the inter-extension event bus. Only explicit UI waits imply needs-input.
    next.subscribe(pi.on("ui_prompt_start", (_event, context) => {
      next.activity.promptStart(); next.update(context);
    }));
    next.subscribe(pi.on("ui_prompt_end", (_event, context) => {
      next.activity.promptEnd(); next.update(context);
    }));
    next.start();
  }
  pi.registerCommand("twm-report", {
    description: "Turn this session's entire twm reporter on or off",
    handler: async (args, ctx) => {
      const mode = args.trim();
      if (mode !== "on" && mode !== "off") { ctx.ui.notify("Usage: /twm-report on|off", "info"); return; }
      if (mode === "off") { enabled = false; await stop(); }
      else if (!enabled) { enabled = true; await start(ctx); }
      ctx.ui.notify(`twm reporting ${enabled ? "on" : "off"}.`, "info");
    },
  });
  pi.on("session_start", (_event, ctx) => start(ctx));
  pi.on("session_shutdown", stop);
}
