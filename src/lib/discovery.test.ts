import { test, expect } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadItems, parseWorktreeRecords } from "./discovery";
import { parseSourceEntry } from "./sources";
import { sessionNameFor, rememberSessionName } from "./session";

const git = (...args: string[]) => {
  const result = Bun.spawnSync(["git", "-c", "core.hooksPath=/dev/null", "-c", "commit.gpgSign=false", ...args]);
  if (result.exitCode) throw new Error(result.stderr.toString());
  return result.stdout.toString().trim();
};

test("discovery preserves session names and handles linked sources, detached, locked and missing worktrees", async () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "twm-discovery-")));
  try {
    const repo = path.join(root, "repo");
    git("init", "-q", repo);
    git("-C", repo, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-qm", "initial");
    const linked = path.join(root, "punctuated ü linked");
    const detached = path.join(root, "detached");
    git("-C", repo, "worktree", "add", "-qb", "topic", linked);
    git("-C", repo, "worktree", "add", "-q", "--detach", detached);
    git("-C", repo, "worktree", "lock", linked);
    // Capture established naming before discovery seeds the cache.
    const expected = [repo, linked, detached].map(sessionNameFor);
    const bytes = new TextEncoder().encode(linked);
    const checksum = Bun.spawnSync({ cmd: ["cksum"], stdin: bytes }).stdout.toString().split(" ")[0]!;
    expect(expected[1]).toEndWith(`--${Number(checksum).toString(16).padStart(4, "0").slice(-4)}`);
    expect(rememberSessionName(linked, repo, false)).toBe(expected[1]);
    const source = await parseSourceEntry(linked);
    const items = await loadItems([source, await parseSourceEntry(repo)]);
    expect(items).toHaveLength(3);
    for (const [index, itemPath] of [repo, linked, detached].entries()) {
      expect(items.find(item => item.path === itemPath)?.sessionName).toBe(expected[index]);
    }
    expect(items.filter(item => item.isPrimary).map(item => item.path)).toEqual([repo]);
    expect(items.find(item => item.path === linked)?.branch).toBe("topic");
    expect(items.find(item => item.path === linked)?.locked).toBe(true);
    expect(items.find(item => item.path === detached)?.branch).toBe("");
    fs.rmSync(detached, { recursive: true });
    const refreshed = await loadItems([source]);
    expect(refreshed.find(item => item.path === detached)?.available).toBe(false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}, 30_000);

test("bare-backed sources do not invent a primary checkout", async () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "twm-bare-")));
  try {
    const repo = path.join(root, "ordinary");
    const bare = path.join(root, "bare.git");
    const linked = path.join(root, "linked");
    git("init", "-q", repo);
    git("-C", repo, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-qm", "initial");
    git("clone", "-q", "--bare", repo, bare);
    git("-C", bare, "worktree", "add", "-qb", "topic", linked);
    const expected = sessionNameFor(linked);
    const items = await loadItems([await parseSourceEntry(linked)]);
    expect(items).toHaveLength(1);
    expect(items[0]!.isPrimary).toBe(false);
    expect(items[0]!.sessionName).toBe(expected);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}, 30_000);

test("NUL porcelain preserves unusual paths and registration flags", () => {
  const records = parseWorktreeRecords("worktree /a/line\nbreak\0HEAD abc\0branch refs/heads/topic\0locked reason\0prunable reason\0\0worktree /bare\0bare\0\0");
  expect(records[0]).toEqual({ path: "/a/line\nbreak", branch: "topic", bare: false, locked: true, prunable: true });
  expect(records[1]?.bare).toBe(true);
});
