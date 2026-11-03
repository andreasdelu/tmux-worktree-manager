import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Exercise only disposable repositories and an isolated tmux server.
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "twm-smoke-")));
const binary = path.resolve("dist/twm");
const config = path.join(root, "config");
const repo = path.join(root, "repo");
const socket = `twm-smoke-${process.pid}`;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const deadline = async <T>(promise: Promise<T>, ms: number, label: string) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(label)), ms);
    })]);
  } finally { clearTimeout(timer); }
};
const run = (cmd: string[]) => {
  const p = Bun.spawnSync({cmd, timeout: 10_000});
  if (p.exitCode) throw new Error(p.stderr.toString());
  return p.stdout.toString().trim();
};
const git = (...args: string[]) => run(["git", "-c", "core.hooksPath=/dev/null", "-c", "commit.gpgSign=false", ...args]);
const tmux = (...args: string[]) => run(["tmux", "-L", socket, ...args]);
const clean = (text: string) => text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "").replace(/\x1b\][^\x07]*(?:\x07)/g, "").replace(/[\x00-\x08\x0b-\x1f]/g, "");

async function terminalRun(cmd: string[], env: Record<string, string | undefined>, scenario: (write: (text: string) => void, wait: (text: string | string[]) => Promise<void>, reset: () => void) => Promise<void>) {
  let output = "";
  const terminal = new Bun.Terminal({ cols: 140, rows: 40, data(_term, bytes) {
    output = (output + new TextDecoder().decode(bytes)).slice(-500_000);
  } });
  const p = Bun.spawn({ cmd, env, terminal });
  const wait = async (text: string | string[]) => {
    const expected = Array.isArray(text) ? text : [text];
    for (let n = 0; n < 200; n++) {
      if (expected.every(value => clean(output).includes(value))) { output = ""; return; }
      if (p.exitCode !== null) throw new Error(`Exited before ${text}: ${p.exitCode}`);
      await sleep(50);
    }
    throw new Error(`Missing ${text}: ${clean(output).slice(-5000)}`);
  };
  try { await deadline(scenario(text => terminal.write(text), wait, () => { output = ""; }), 60_000, "Smoke scenario deadline exceeded"); }
  finally {
    p.kill();
    await p.exited;
    terminal.close();
  }
}

try {
  git("init", "-q", "-b", "main", repo);
  git("-C", repo, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-qm", "initial");
  await terminalRun([binary], { ...process.env, XDG_CONFIG_HOME: config }, async (write, wait) => {
    await wait("Add a repo root to get started.");
    if (!fs.existsSync(path.join(config, "twm", "layout.sh"))) throw new Error("Defaults missing");
    write("\x1b"); await sleep(100); write("q");
  });
  fs.writeFileSync(path.join(config, "twm", "worktree-roots"), `parent ${repo}\n`);
  fs.writeFileSync(path.join(config, "twm", "layout.sh"), `#!/bin/sh\nprintf 'new\\n' >> '${path.join(root, "layout-count")}'\n`);
  // Exercise explicit close-on-open compatibility in the early open scenarios.
  fs.writeFileSync(path.join(config, "twm", "preferences.json"), '{"closeOnOpen":true}\n');
  const pastedBranch = "andreasdeleuran/lan-18257-add-a-way-for-owners-to-invite-collaborators-in-api";
  const folder = "lan-18257-add-a-way-for";
  const base = path.join(root, "repo-worktrees", "base");
  git("-C", repo, "worktree", "add", "-qb", "base", base);
  git("-C", base, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-qm", "base commit");
  const baseCommit = git("-C", base, "rev-parse", "HEAD");
  // Deterministic provider metadata, not evidence of real PRs. Run the actual
  // compiled reader -> store -> details/stack presentation without network access.
  const provider = path.join(root, "provider");
  fs.mkdirSync(provider);
  const identity = "twm-smoke/fixture";
  const node = (number: number, headRefName: string, baseRefName: string, state: string) => ({
    number, headRefName, baseRefName, state, isDraft: false,
    mergedAt: state === "MERGED" ? "2026-01-01T00:00:00Z" : null,
    url: `https://github.com/${identity}/pull/${number}`,
    headRepository: { nameWithOwner: identity }, baseRepository: { nameWithOwner: identity },
  });
  const metadata = { data: { repository: { nameWithOwner: identity, pullRequests: {
    nodes: [node(1, "base", "main", "OPEN"), node(2, pastedBranch, "base", "OPEN"), node(3, "main", "trunk", "MERGED")],
    pageInfo: { hasNextPage: false, endCursor: null },
  } } } };
  fs.writeFileSync(path.join(provider, "gh"), `#!/bin/sh\nprintf '%s\\n' '${JSON.stringify(metadata)}'\n`, { mode: 0o755 });
  git("-C", repo, "remote", "add", "origin", `https://github.com/${identity}.git`);
  process.env.PATH = `${provider}:${process.env.PATH}`;
  tmux("-f", "/dev/null", "new-session", "-d", "-s", "fixture", "-x", "140", "-y", "40");
  tmux("set-environment", "-g", "PATH", process.env.PATH!);
  const originSession = tmux("display-message", "-p", "-t", "fixture", "#{session_id}");
  await terminalRun(["tmux", "-L", socket, "attach-session", "-t", "fixture"], process.env, async (write, wait, reset) => {
    await sleep(200);
    const popup = Bun.spawn(["tmux", "-L", socket, "display-popup", "-t", "fixture", "-E", "-w", "95%", "-h", "95%",
      `env TWM_ORIGIN_SESSION='${originSession}' XDG_CONFIG_HOME='${config}' TWM_NO_ENTER=1 '${binary}'`], { stdout: "ignore", stderr: "pipe" });
    try {
      await wait(["repo/repo · primary", "#3"]);
      console.log("PASS: compiled PR reader and merged badge with deterministic provider metadata");
      write("c"); await wait("Paste a Linear Git branch");
      write(`\x1b[200~${pastedBranch}\x1b[201~`);
      await wait(folder);
      write("\t"); await sleep(100); write("\t"); await sleep(100); write("bse"); await sleep(100);
      write("\x1b[D"); await sleep(60); write("\x1b[D"); await sleep(60); write("a"); await sleep(100);
      const createStart = performance.now(); write("\r");
      await wait(`Created worktree ${folder}`);
      console.log(JSON.stringify({ createAndRefreshMs: Math.round(performance.now() - createStart), fixture: "empty Git repository" }));
      const branch = pastedBranch;
      if (git("-C", repo, "rev-parse", branch) !== baseCommit) throw new Error("Wrong stacked base");
      const target = path.join(root, "repo-worktrees", folder);
      if (git("-C", target, "branch", "--show-current") !== branch) throw new Error("Linear branch was not preserved");
      console.log("PASS: popup Linear paste, mid-field cursor insertion and explicit base");
      await wait(["PR stack", "↑ #1 base"]);
      console.log("PASS: PR stack lives inline in details");
      write("\r");
      await deadline(popup.exited, 10_000, "Open session popup did not exit");
      console.log("PASS: non-empty popup PR stack and new session open (provider fixture)");
      if (fs.readFileSync(path.join(root, "layout-count"), "utf8") !== "new\n") throw new Error("Layout did not run exactly once");
      const { sessionNameFor } = await import("../src/lib/session");
      const session = sessionNameFor(target);
      tmux("new-window", "-t", session, "-n", "user-window");
      tmux("new-window", "-t", session, "-n", "agent", "-c", target,
        "printf '\\033]2;π - twm-fixture\\007'; exec node -e 'setInterval(() => {}, 1000)'");
      reset();
      const reopen = Bun.spawn(["tmux", "-L", socket, "display-popup", "-t", "fixture", "-E", "-w", "95%", "-h", "95%",
        `env TWM_ORIGIN_SESSION='${originSession}' XDG_CONFIG_HOME='${config}' TWM_NO_ENTER=1 '${binary}'`], { stdout: "ignore", stderr: "pipe" });
      await wait("π ● T"); console.log("PASS: Pi/Pax presence uses an icon without invented activity");
      // Exercise the real publisher -> tmux -> compiled consumer with an
      // offline runtime context. Installed SDK events are tested separately.
      const { PiReporter } = await import("../extensions/pi-reporter");
      const agentPane = tmux("list-panes", "-t", `${session}:agent`, "-F", "#{pane_id}");
      let idle = true;
      const reporter = new PiReporter(agentPane, process.pid, { isIdle: () => idle }, async args => {
        const proc = Bun.spawn(["tmux", "-L", socket, ...args], { stdout: "pipe", stderr: "pipe" });
        const [output, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
        return code === 0 ? output.trim() === "1" : undefined;
      });
      try {
        reporter.start(); await sleep(200);
        reporter.message("human", "Popup human preview"); reporter.message("agent", "Popup agent preview");
        // Reporter belongs to the created worktree. It must not expose text
        // while the primary is selected, then show it when selected.
        write("j"); await sleep(100); write("j"); await wait(["Popup human preview", "Popup agent preview"]);
        console.log("PASS: compiled selected-worktree human/agent previews");
        idle = false; reporter.activity.agentStart(); reporter.update(); await wait("Working");
        reporter.activity.stream("thinking_start"); reporter.update(); await wait("Thinking");
        reporter.activity.toolStart("fixture", "read"); reporter.update(); await wait("Reading files");
        const record = tmux("show-options", "-p", "-v", "-t", agentPane, "@twm_pi");
        if (!record.includes("|tool|1|read|")) throw new Error(`Missing named tool: ${record}`);
        reporter.activity.promptStart(); reporter.update(); await wait("Needs input");
        reporter.activity.promptEnd(); reporter.activity.toolEnd("fixture");
        reporter.activity.agentSettled(); idle = true; reporter.update(); await wait("Popup agent preview");
        reporter.childActivity("active"); await wait("Subagents working", ["Finished", "Subagents working"]);
        reporter.childActivity("unknown"); await wait("Subagent status unknown");
        reporter.childActivity("inactive"); await wait("Popup agent preview");
      } finally { await reporter.stop(); }
      await wait("Detected; status unavailable");
      const clearedMessages = tmux("display-message", "-p", "-t", agentPane, "#{@twm_pi_messages}");
      if (clearedMessages) throw new Error("Reporter cleanup left message previews in tmux");
      write("k"); await sleep(100); write("k"); await sleep(100);
      console.log("PASS: compiled animated working/thinking/named-tool/input/done, then unavailable after reporter cleanup (offline fixture)");
      // The primary comes first, then Git's path-sorted linked records: base, created.
      write("j"); await sleep(100); write("j"); await sleep(250); write("\r");
      await deadline(reopen.exited, 10_000, "Reopen popup did not exit");
      console.log("PASS: existing session reopened");
      if (fs.readFileSync(path.join(root, "layout-count"), "utf8") !== "new\n") throw new Error("Reopening reran layout");
      if (!tmux("list-windows", "-t", session, "-F", "#{window_name}").includes("user-window")) throw new Error("User state lost");
      reset();
      const remove = Bun.spawn(["tmux", "-L", socket, "display-popup", "-t", "fixture", "-E", "-w", "95%", "-h", "95%",
        `env TWM_ORIGIN_SESSION='${originSession}' XDG_CONFIG_HOME='${config}' TWM_NO_ENTER=1 '${binary}'`], { stdout: "ignore", stderr: "pipe" });
      await wait(["repo/repo · primary", "Ready."]); write("j"); await sleep(100); write("j"); await sleep(250);
      write("x"); await wait("y confirm"); const removeStart = performance.now(); write("y");
      await wait(`Removed worktree ${folder}`);
      console.log(JSON.stringify({ removeAndRefreshMs: Math.round(performance.now() - removeStart), fixture: "empty Git repository" }));
      if (fs.existsSync(target)) throw new Error("Clean linked worktree was not removed");
      const hasSession = Bun.spawnSync(["tmux", "-L", socket, "has-session", "-t", session]);
      if (hasSession.exitCode === 0) throw new Error("Removed worktree session survived");
      write("q"); await deadline(remove.exited, 10_000, "Remove popup did not exit");
      console.log("PASS: native agent detection and real Git/tmux removal");
      tmux("new-session", "-d", "-s", "scratch-adopt", "-c", repo);
      const adoptedId = tmux("display-message", "-p", "-t", "scratch-adopt", "#{session_id}");
      const adoptedBefore = tmux("list-panes", "-t", adoptedId, "-F", "#{pane_id} #{pane_pid}");
      reset();
      fs.writeFileSync(path.join(config, "twm", "preferences.json"), '{"closeOnOpen":false}\n');
      const assign = Bun.spawn(["tmux", "-L", socket, "display-popup", "-t", "fixture", "-E", "-w", "95%", "-h", "95%",
        `env TWM_ORIGIN_SESSION='${originSession}' XDG_CONFIG_HOME='${config}' TWM_NO_ENTER=1 '${binary}'`], { stdout: "ignore", stderr: "pipe" });
      await wait(["repo/repo · primary", "Ready."]);
      write("a"); await wait("Assign existing tmux session");
      write("\x1b"); await wait("Cancelled");
      write("a"); await wait("scratch-adopt"); write("j"); await sleep(100); write("\r");
      await wait("Assigned scratch-adopt to repo.");
      if (tmux("display-message", "-p", "-t", adoptedId, "#{session_name}") !== "scratch-adopt") throw new Error("Assignment renamed the chosen session");
      if (tmux("list-panes", "-t", adoptedId, "-F", "#{pane_id} #{pane_pid}") !== adoptedBefore) throw new Error("Assignment changed panes/processes");
      if (fs.readFileSync(path.join(root, "layout-count"), "utf8") !== "new\n") throw new Error("Assignment reran layout hook");
      write("r"); await wait("scratch-adopt");
      tmux("rename-session", "-t", adoptedId, "custom review.name");
      write("r"); await wait("custom review.name");
      write("\r"); await wait("Opened repo.");
      if (tmux("list-sessions", "-F", "#{session_name}").split("\n").includes("repo")) throw new Error("Opening a custom assignment created a duplicate default session");
      write("q"); await deadline(assign.exited, 10_000, "Assignment popup did not exit");
      tmux("kill-session", "-t", adoptedId);
      fs.writeFileSync(path.join(config, "twm", "preferences.json"), '{"closeOnOpen":true}\n');
      console.log("PASS: compiled popup assignment preserves name, panes/processes and skips layout hook");
      for (const autoOpen of [false, true]) {
        const name = autoOpen ? "auto-open" : "auto-session";
        reset();
        const createClient = tmux("list-clients", "-F", "#{client_name}");
        const create = Bun.spawn(["tmux", "-L", socket, "display-popup", "-t", "fixture", "-E", "-w", "95%", "-h", "95%",
          `env TWM_ORIGIN_SESSION='${originSession}' TWM_ORIGIN_CLIENT='${createClient}' XDG_CONFIG_HOME='${config}' TWM_NO_ENTER=0 '${binary}'`], { stdout: "ignore", stderr: "pipe" });
        await wait(["repo/repo · primary", "Ready."]);
        write("c"); await wait("Create tmux session"); write(name); await sleep(150);
        for (let field = 0; field < (autoOpen ? 4 : 3); field++) { write("\t"); await sleep(150); }
        write(" "); await wait(autoOpen ? "[x] Open after creation" : "[x] Create tmux session"); write("\r");
        const createdPath = path.join(root, "repo-worktrees", name);
        if (autoOpen) await deadline(create.exited, 10_000, "Auto-open popup did not exit");
        else {
          await wait(`Created worktree ${name}`);
          if (create.exitCode !== null) throw new Error("Create-session-only unexpectedly closed popup");
          write("q"); await deadline(create.exited, 10_000, "Create-session popup did not exit");
        }
        const expectedSession = sessionNameFor(createdPath);
        tmux("has-session", "-t", `=${expectedSession}`);
        if (tmux("list-clients", "-F", "#{session_name}") !== (autoOpen ? expectedSession : "fixture")) throw new Error("Create/open toggle switched to the wrong destination");
        if (autoOpen) tmux("switch-client", "-c", createClient, "-t", "=fixture");
        // Retain both worktrees for the queued-removal popup proof below.
      }
      console.log("PASS: create-session-only keeps popup/client; open toggle creates and switches real client to the new session");
      // Delay only Git removal so the compiled popup has a deterministic window
      // to queue another job and open a third worktree. All Git effects are real.
      fs.writeFileSync(path.join(provider, "git"), '#!/bin/sh\nif [ "$3 $4" = "worktree remove" ]; then sleep 2; fi\nexec /usr/bin/git "$@"\n', { mode: 0o755 });
      reset();
      const queueClient = tmux("list-clients", "-F", "#{client_name}");
      const queuePopup = Bun.spawn(["tmux", "-L", socket, "display-popup", "-t", "fixture", "-E", "-w", "95%", "-h", "95%",
        `env TWM_ORIGIN_SESSION='${originSession}' TWM_ORIGIN_CLIENT='${queueClient}' XDG_CONFIG_HOME='${config}' TWM_NO_ENTER=0 '${binary}'`], { stdout: "ignore", stderr: "pipe" });
      await wait(["repo/repo · primary", "Ready."]);
      write("j"); await sleep(120); write("x"); await wait("y confirm"); write("y"); await wait("Removing…");
      write("j"); await sleep(120); write("x"); await wait("y confirm"); write("y"); await wait("Queued…");
      write("k"); await sleep(120); write("k"); await sleep(120); write("\r"); await wait("Opened repo.");
      if (queuePopup.exitCode !== null) throw new Error("Opening interrupted removal queue");
      if (tmux("list-clients", "-F", "#{session_name}") !== "repo") throw new Error("Queued-removal open did not switch real client");
      await wait("Removed worktree auto-session");
      for (const name of ["auto-open", "auto-session"]) {
        const removedPath = path.join(root, "repo-worktrees", name);
        if (fs.existsSync(removedPath)) throw new Error(`Queued worktree survived: ${name}`);
        if (Bun.spawnSync(["tmux", "-L", socket, "has-session", "-t", `=${sessionNameFor(removedPath)}`]).exitCode === 0) throw new Error(`Queued session survived: ${name}`);
      }
      // Wait for final list reconciliation, not just the Git/session effects.
      await sleep(250); write("q"); await deadline(queuePopup.exited, 10_000, "Queue popup did not exit");
      tmux("switch-client", "-c", queueClient, "-t", "=fixture");
      tmux("kill-session", "-t", "=repo");
      fs.unlinkSync(path.join(provider, "git"));
      console.log("PASS: compiled popup queues real removals, switches real client to another worktree, and drains queue without exiting");
      const plugin = path.join(root, "plugin with space");
      fs.mkdirSync(path.join(plugin, "scripts"), { recursive: true });
      fs.mkdirSync(path.join(plugin, "dist"));
      fs.copyFileSync("plugin.tmux", path.join(plugin, "plugin.tmux"));
      fs.copyFileSync("scripts/run.sh", path.join(plugin, "scripts", "run.sh"));
      fs.symlinkSync(binary, path.join(plugin, "dist", "twm"));
      fs.writeFileSync(path.join(plugin, "dist", ".install-stamp"), "version=latest\nmode=auto\nplugin_rev=unknown\n");
      tmux("set-environment", "-g", "XDG_CONFIG_HOME", config);
      tmux("set-environment", "-g", "TWM_NO_ENTER", "1");
      const server = tmux("display-message", "-p", "-t", "fixture", "#{socket_path},#{pid},0");
      const installed = Bun.spawnSync({ cmd: ["bash", path.join(plugin, "plugin.tmux")], env: { ...process.env, TMUX: server } });
      if (installed.exitCode) throw new Error(installed.stderr.toString());
      tmux("new-session", "-d", "-s", sessionNameFor(base), "-c", base);
      reset(); write("\x02"); await sleep(100); write("W"); await wait(["repo/repo · primary", "Ready."]);
      write("j"); await sleep(250); write("x"); await wait("y confirm");
      write("n"); await wait("Cancelled"); write("q"); await sleep(250);
      console.log("PASS: actual TPM binding captures the origin session despite a different most-recent session");
      const client = tmux("list-clients", "-F", "#{client_name}");
      const baseSession = sessionNameFor(base);
      tmux("switch-client", "-c", client, "-t", `=${baseSession}`);
      tmux("new-session", "-d", "-s", "newer-sentinel");
      reset(); write("\x02"); await sleep(100); write("W"); await wait(["repo/repo · primary", "Ready."]);
      write("j"); await sleep(250); write("x"); await wait("currently inside this worktree");
      write("\r"); await sleep(100); write("d"); await wait("y confirm"); write("y"); await wait("Won't close the current tmux session");
      write("q"); await sleep(250);
      const before = tmux("list-windows", "-t", `=${baseSession}`, "-F", "#{window_id} #{window_layout}");
      tmux("set-environment", "-gu", "TWM_NO_ENTER");
      tmux("switch-client", "-c", client, "-t", "=fixture");
      fs.unlinkSync(path.join(config, "twm", "preferences.json"));
      reset(); write("\x02"); await sleep(100); write("W"); await wait(["repo/repo · primary", "Ready."]);
      write("j"); await sleep(250); write("\r"); await wait("Opened base.");
      write("x"); await wait("currently inside this worktree"); write("\r"); await sleep(100);
      write("d"); await wait("y confirm"); write("y"); await wait("Won't close the current tmux session");
      write("k"); await wait("repo/repo · primary");
      if (tmux("list-clients", "-F", "#{session_name}") !== baseSession) throw new Error("Open did not switch the originating client");
      if (tmux("list-windows", "-t", `=${baseSession}`, "-F", "#{window_id} #{window_layout}") !== before) throw new Error("Existing session layout changed");
      write("q"); await sleep(200);
      reset(); write("\x02"); await sleep(100); write("W"); await wait(["repo/repo · primary", "Ready."]);
      write("o"); await sleep(100); write("j"); await sleep(150); write("\r"); await wait("Opened base.");
      write("q"); await sleep(200);
      console.log("PASS: actual-origin protection, default stay-open across launches, real session switching and inert old toggle");
    } finally { popup.kill(); }
  });
  console.log("PASS: compiled first boot, tmux popup, Linear paste, explicit stacked base, inline PR stack, native detection, deletion, new/existing session layout");
} finally {
  Bun.spawnSync(["tmux", "-L", socket, "kill-server"]);
  fs.rmSync(root, { recursive: true, force: true });
}
