import { expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { assignSession, listUnassignedSessions, hasTmuxSession, hasTmuxSessionAsync, rememberSessionName, sessionNameFor } from "./session";
import { performAction } from "./actions";

test("POSIX checksum compatibility across byte lengths and Unicode", () => {
  for (const name of ["short", "ü🚀", "a".repeat(256), "a".repeat(1024)]) {
    const dir = `/tmp/${name}`;
    const checksum = Number(Bun.spawnSync({cmd:["cksum"],stdin:new TextEncoder().encode(dir)}).stdout.toString().split(" ")[0]);
    expect(rememberSessionName(dir, "/repo", false)).toEndWith(`--${checksum.toString(16).padStart(4, "0").slice(-4)}`);
  }
});

test("assignment preserves custom names and follows later renames across discovery and actions", async () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "twm-assign-")));
  const socket = `twm-assign-${process.pid}`;
  const oldTmux = process.env.TMUX;
  const oldOrigin = process.env.TWM_ORIGIN_SESSION;
  const run = (...args: string[]) => {
    const result = Bun.spawnSync({ cmd: args, env: process.env });
    if (result.exitCode) throw new Error(result.stderr.toString());
    return result.stdout.toString().trim();
  };
  const tmux = (...args: string[]) => run("tmux", "-L", socket, ...args);
  try {
    run("git", "init", "-q", root);
    tmux("-f", "/dev/null", "new-session", "-d", "-s", "scratch.with dots", "-c", root);
    process.env.TMUX = tmux("display-message", "-p", "#{socket_path},#{pid},0");
    const target = sessionNameFor(root);
    const assigned = "another-checkout";
    tmux("new-session", "-d", "-s", assigned);
    const candidates = listUnassignedSessions([target, assigned]);
    expect(candidates.map(item => item.name)).toEqual(["scratch.with dots"]);
    const session = candidates[0]!;
    const panes = () => tmux("list-panes", "-t", session.id, "-F", "#{pane_id}\t#{pane_pid}\t#{pane_current_path}");
    const before = panes();
    assignSession(root, session, [target, assigned]);
    expect(panes()).toBe(before);
    expect(tmux("display-message", "-p", "-t", session.id, "#{session_name}")).toBe("scratch.with dots");
    expect(sessionNameFor(root)).toBe("scratch.with dots");
    expect(listUnassignedSessions([target, assigned])).toEqual([]);
    expect(() => assignSession(root, session, [target, assigned])).toThrow("already has");
    tmux("rename-session", "-t", session.id, "renamed");
    expect(sessionNameFor(root)).toBe("renamed");
    const { parseSourceEntry } = await import("./sources");
    const { loadItems } = await import("./discovery");
    const { loadLiveItems } = await import("./agents");
    const rows = await loadItems([await parseSourceEntry(root)]);
    expect(rows[0]?.sessionName).toBe("renamed");
    expect(rows[0]?.hasSession).toBe(true);
    const live = await loadLiveItems(rows);
    expect(live[0]?.sessionName).toBe("renamed");
    expect(live[0]?.hasSession).toBe(true);
    const script = `import {sessionNameFor} from ${JSON.stringify(path.resolve("src/lib/session.ts"))}; console.log(sessionNameFor(${JSON.stringify(root)}));`;
    expect(run(process.execPath, "-e", script)).toBe("renamed");
    const otherRoot = path.join(root, "other"); fs.mkdirSync(otherRoot);
    expect(() => assignSession(otherRoot, { id: session.id, name: "renamed" }, [])).toThrow("already assigned");
    const occupied = listUnassignedSessions([]).find(item => item.name === assigned)!;
    expect(() => assignSession(otherRoot, occupied, [assigned])).toThrow("already assigned");
    expect(hasTmuxSession(assigned)).toBe(true);
    expect(() => assignSession(path.join(root, "missing"), occupied, [])).toThrow();
    // A custom-named current session remains protected from close/remove.
    process.env.TWM_ORIGIN_SESSION = session.id;
    expect(await performAction("kill", root)).toBe("Won't close the current tmux session");
    tmux("rename-session", "-t", session.id, "  spaced name  ");
    expect(await performAction("kill", root)).toBe("Won't close the current tmux session");
    delete process.env.TWM_ORIGIN_SESSION;
    delete process.env.TMUX;
    // Outside tmux, point commands at this isolated server via an explicit socket.
    process.env.TMUX = tmux("display-message", "-p", "-t", assigned, "#{socket_path},#{pid},0");
    process.env.TWM_ORIGIN_SESSION = tmux("display-message", "-p", "-t", assigned, "#{session_id}");
    // A legal session name that looks like the protected session's ID must
    // never redirect the destructive target to that protected session.
    tmux("rename-session", "-t", session.id, process.env.TWM_ORIGIN_SESSION);
    expect(await performAction("kill", root)).toContain("Closed tmux session");
    expect(sessionNameFor(root)).toBe(target);
    expect(hasTmuxSession(assigned)).toBe(true);
  } finally {
    Bun.spawnSync(["tmux", "-L", socket, "kill-server"]);
    if (oldTmux === undefined) delete process.env.TMUX; else process.env.TMUX = oldTmux;
    if (oldOrigin === undefined) delete process.env.TWM_ORIGIN_SESSION; else process.env.TWM_ORIGIN_SESSION = oldOrigin;
    fs.rmSync(root, { recursive: true, force: true });
  }
}, 60_000);

test("exact tmux targets preserve prefix-named sentinel sessions", async () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "twm-exact-")));
  const socket = `twm-exact-${process.pid}`;
  const oldTmux = process.env.TMUX;
  const oldOrigin = process.env.TWM_ORIGIN_SESSION;
  const run = (...args: string[]) => {
    const p = Bun.spawnSync(args);
    if (p.exitCode) throw new Error(p.stderr.toString());
    return p.stdout.toString().trim();
  };
  const git = (...args: string[]) => run("git", "-c", "core.hooksPath=/dev/null", "-c", "commit.gpgSign=false", ...args);
  try {
    const repo = path.join(root, "repo");
    const linked = path.join(root, "linked");
    git("init", "-q", repo);
    git("-C", repo, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-qm", "initial");
    git("-C", repo, "worktree", "add", "-qb", "topic", linked);
    run("tmux", "-L", socket, "-f", "/dev/null", "new-session", "-d", "-s", "fixture");
    const server = run("tmux", "-L", socket, "display-message", "-p", "-t", "fixture", "#{socket_path},#{pid},0");
    process.env.TMUX = server;
    process.env.TWM_ORIGIN_SESSION = "$0";
    const name = sessionNameFor(linked);
    const sentinel = `${name}-backup`;
    run("tmux", "-L", socket, "new-session", "-d", "-s", sentinel);
    expect(hasTmuxSession(name)).toBe(false);
    expect(await hasTmuxSessionAsync(name)).toBe(false);
    expect(await performAction("kill", linked)).toBe("No tmux session for linked");
    expect(await performAction("remove", linked)).toBe("Removed worktree linked");
    expect(run("tmux", "-L", socket, "list-sessions", "-F", "#{session_name}").split("\n").sort()).toEqual(["fixture", sentinel].sort());
  } finally {
    Bun.spawnSync(["tmux", "-L", socket, "kill-server"]);
    if (oldTmux === undefined) delete process.env.TMUX; else process.env.TMUX = oldTmux;
    if (oldOrigin === undefined) delete process.env.TWM_ORIGIN_SESSION; else process.env.TWM_ORIGIN_SESSION = oldOrigin;
    fs.rmSync(root, { recursive: true, force: true });
  }
}, 60_000);
