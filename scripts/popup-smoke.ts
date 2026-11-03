import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "twm-popup-")));
const socket = `twm-popup-${process.pid}`;
const config = path.join(root, "config"), repo = path.join(root, "repo"), plugin = path.join(root, "plugin");
const run = (cmd: string[]) => {
  const p = Bun.spawnSync({ cmd, timeout: 10000 });
  if (p.exitCode) throw new Error(p.stderr.toString());
  return p.stdout.toString().trim();
};
const tmux = (...args: string[]) => run(["tmux", "-L", socket, ...args]);
const git = (...args: string[]) => run(["/usr/bin/git", "-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", ...args]);
const clean = (s: string) => s.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "").replace(/\x1b\][^\x07]*(?:\x07)/g, "");
let helperSocket = "";
let output = "";
const terminal = new Bun.Terminal({ cols: 140, rows: 40, data(_term, bytes) { output = (output + new TextDecoder().decode(bytes)).slice(-300000); } });
let attached: ReturnType<typeof Bun.spawn> | undefined;
let secondAttached: ReturnType<typeof Bun.spawn> | undefined;
let secondTerminal: InstanceType<typeof Bun.Terminal> | undefined;
const wait = async (fn: () => boolean, label: string) => {
  for (let n = 0; n < 400; n++) { if (fn()) return; await Bun.sleep(25); }
  throw new Error(`Timeout ${label}: ${clean(output).slice(-2500)}`);
};
const text = (s: string) => wait(() => clean(output).includes(s), s);
const press = async (s: string) => { terminal.write(s); await Bun.sleep(180); };
try {
  git("init", "-qb", "main", repo);
  git("-C", repo, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--allow-empty", "-qm", "initial");
  const a = path.join(root, "a"), b = path.join(root, "b");
  git("-C", repo, "worktree", "add", "-qb", "a", a);
  git("-C", repo, "worktree", "add", "-qb", "b", b);
  fs.mkdirSync(path.join(config, "twm"), { recursive: true });
  fs.writeFileSync(path.join(config, "twm", "worktree-roots"), repo + "\n");
  fs.writeFileSync(path.join(config, "twm", "layout.sh"), '#!/bin/sh\ntmux set-option -t "$TWM_SESSION_ID" @fixture_layout host\ntmux new-window -d -t "$TWM_SESSION_ID" -n layout-proof\n');
  // Explicit false must not defeat detach-on-open for persistent popups.
  fs.writeFileSync(path.join(config, "twm", "preferences.json"), '{"closeOnOpen":false}\n');
  fs.mkdirSync(path.join(plugin, "scripts"), { recursive: true }); fs.mkdirSync(path.join(plugin, "dist"));
  for (const file of ["popup.sh", "run.sh"]) fs.copyFileSync(`scripts/${file}`, path.join(plugin, "scripts", file));
  fs.copyFileSync("plugin.tmux", path.join(plugin, "plugin.tmux"));
  fs.symlinkSync(path.resolve("dist/twm"), path.join(plugin, "dist", "twm"));
  fs.writeFileSync(path.join(plugin, "dist", ".install-stamp"), "version=latest\nmode=auto\nplugin_rev=unknown\n");
  const bin = path.join(root, "bin"); fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, "git"), `#!/bin/sh\nif [ "$3 $4" = "worktree remove" ]; then\n  if [ "$5" = '${path.join(root, "c")}' ]; then\n    touch '${path.join(root, "started")}'\n    while [ ! -f '${path.join(root, "release")}' ]; do sleep 0.05; done\n  else sleep 3; fi\nfi\nexec /usr/bin/git "$@"\n`, { mode: 0o755 });
  tmux("-f", "/dev/null", "new-session", "-d", "-s", "repo", "-c", repo, "-x", "140", "-y", "40");
  const hostTmux = tmux("display-message", "-p", "#{socket_path},#{pid},0");
  helperSocket = tmux("display-message", "-p", "#{socket_path}") + ".twm";
  tmux("set-environment", "-g", "PATH", `${bin}:${process.env.PATH}`);
  tmux("set-environment", "-g", "XDG_CONFIG_HOME", config);
  run(["env", `TMUX=${hostTmux}`, "bash", path.join(plugin, "plugin.tmux")]);
  attached = Bun.spawn(["tmux", "-L", socket, "attach-session", "-t", "repo"], { terminal });
  await Bun.sleep(200);
  const hostClient = tmux("list-clients", "-F", "#{client_name}");
  const open = async () => { output = ""; await press("\x02"); await press("W"); await text("twm v"); };
  const helper = (...args: string[]) => run(["tmux", "-S", helperSocket, ...args]);
  await open(); await text("(current)");
  const helperSession = helper("list-sessions", "-F", "#{session_name}");
  const pid = helper("list-panes", "-a", "-F", "#{pane_pid}");
  if (tmux("list-sessions", "-F", "#{session_name}").includes(helperSession)) throw new Error("Helper leaked to host server");
  await press("j"); await press("\r");
  await wait(() => helper("list-clients", "-F", "#{client_name}") === "", "detach on open");
  const current = tmux("list-clients", "-F", "#{session_name}");
  const aSession = tmux("display-message", "-p", "-t", `=${current}:`, "#{session_id}");
  const { rememberSessionName } = await import("../src/lib/session");
  if (current !== rememberSessionName(a, repo, false)) throw new Error("Open did not switch host client to a");
  if (tmux("show-option", "-qv", "-t", aSession, "@fixture_layout") !== "host") throw new Error("Layout did not run on host server");
  if (!tmux("list-windows", "-t", aSession, "-F", "#{window_name}").includes("layout-proof")) throw new Error("Host layout window missing");
  if (helper("list-windows", "-a", "-F", "#{window_name}").includes("layout-proof")) throw new Error("Layout leaked into helper server");
  await open(); await text("(current)");
  if (helper("list-panes", "-a", "-F", "#{pane_pid}") !== pid) throw new Error("Reopen restarted UI");
  await wait(() => helper("capture-pane", "-p", "-t", `=${helperSession}:`).includes("a (current)"), "a current row");
  await press("x"); await text("currently inside this worktree"); await press("\r");
  await press("d"); await text("y confirm"); await press("y"); await text("Won't close the current tmux session");
  await press("j"); await press("x"); await text("y confirm"); await press("y"); await text("Removing…");
  await press("q");
  await wait(() => helper("list-clients", "-F", "#{client_name}") === "", "detach during removal");
  await wait(() => !fs.existsSync(b), "background removal finishes");
  await open();
  if (helper("list-panes", "-a", "-F", "#{pane_pid}") !== pid) throw new Error("Background removal restarted UI");
  await press("q");
  // A second client on a different host session must not receive the first
  // client's opens, even when it is the most recently attached client.
  tmux("new-session", "-d", "-s", "sentinel");
  secondTerminal = new Bun.Terminal({ cols: 140, rows: 40, data() {} });
  secondAttached = Bun.spawn(["tmux", "-L", socket, "attach-session", "-t", "sentinel"], { terminal: secondTerminal });
  await wait(() => tmux("list-clients", "-F", "#{client_name}").split("\n").length === 2, "second client attached");
  tmux("switch-client", "-c", hostClient, "-t", "=repo");
  await open();
  await wait(() => helper("capture-pane", "-p", "-t", `=${helperSession}:`).includes("repo (current)"), "external host switch updates current row");
  // a was the old origin, but it must no longer be protected after reattach.
  await press("k"); await press("k"); await press("j"); await press("x"); await text("y confirm"); await press("n");
  await press("\r");
  await wait(() => helper("list-clients", "-F", "#{client_name}") === "", "open detaches with MRU sentinel");
  const clients = tmux("list-clients", "-F", "#{client_name}\t#{session_name}").split("\n");
  if (!clients.includes(`${hostClient}\t${current}`) || !clients.some(line => line.endsWith("\tsentinel"))) throw new Error("Open switched wrong host client");
  if (tmux("list-windows", "-t", aSession, "-F", "#{window_name}").split("\n").filter(name => name === "layout-proof").length !== 1) throw new Error("Reopen reran layout hook");
  // Queue two real removals, open while pending, then reopen from the queued
  // target. Its fresh origin must block deletion when that job actually starts.
  const c = path.join(root, "c"), d = path.join(root, "d");
  for (const dir of [c, d]) {
    const name = path.basename(dir); git("-C", repo, "worktree", "add", "-qb", name, dir);
    tmux("new-session", "-d", "-s", rememberSessionName(dir, repo, false), "-c", dir);
  }
  await open(); await press("r"); await text("Refreshed");
  await press("k"); await press("k"); await press("j"); await press("j");
  await press("x"); await text("y confirm"); await press("y"); await wait(() => fs.existsSync(path.join(root, "started")), "held removal c");
  await press("j"); await press("x"); await text("y confirm"); await press("y"); await text("Queued…");
  await press("k"); await press("k"); await press("k"); await press("\r");
  await wait(() => helper("list-clients", "-F", "#{client_name}") === "", "open during queue detaches");
  const dName = rememberSessionName(d, repo, false);
  tmux("switch-client", "-c", hostClient, "-t", `=${dName}:`);
  await open();
  await wait(() => helper("capture-pane", "-p", "-t", `=${helperSession}:`).includes("d (current)"), "queued target is new origin");
  fs.writeFileSync(path.join(root, "release"), "go");
  await text("currently inside this worktree");
  if (fs.existsSync(c) || !fs.existsSync(d)) throw new Error("Fresh queued safety checks did not protect d");
  tmux("has-session", "-t", `=${dName}:`);
  if (helper("list-panes", "-a", "-F", "#{pane_pid}") !== pid) throw new Error("Queue changed helper PID");
  await press("q");
  // Independently open the other client's popup; its helper must be distinct.
  secondTerminal.write("\x02"); await Bun.sleep(100); secondTerminal.write("W");
  await wait(() => helper("list-sessions", "-F", "#{session_name}").split("\n").length === 2, "separate helper for second client");
  secondTerminal.write("q");
  console.log("PASS: hidden reusable popup, real host layout/switching, exact current row, refreshed origin/close protection, two-client isolation and queued safety after detach");
} finally {
  attached?.kill(); if (attached) await attached.exited;
  secondAttached?.kill(); if (secondAttached) await secondAttached.exited;
  secondTerminal?.close();
  terminal.close();
  if (helperSocket) Bun.spawnSync(["tmux", "-S", helperSocket, "kill-server"]);
  Bun.spawnSync(["tmux", "-L", socket, "kill-server"]);
  fs.rmSync(root, { recursive: true, force: true });
}
