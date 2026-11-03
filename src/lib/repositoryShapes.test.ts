import { test, expect } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createItem, performAction } from "./actions";
import { parseSourceEntry } from "./sources";
import { loadItems, reloadRepositoryItems } from "./discovery";
import { sessionNameFor } from "./session";
const git = (...args: string[]) => {
  const r = Bun.spawnSync(["git", "-c", "core.hooksPath=/dev/null", "-c", "commit.gpgSign=false", ...args]);
  if (r.exitCode) throw new Error(r.stderr.toString());
  return r.stdout.toString().trim();
};
test("reconciliation rejects a real Git discovery failure instead of replacing rows with empty success", async () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "twm-discovery-fail-")));
  const repo = path.join(root, "repo");
  try {
    git("init", "-q", repo);
    const source = await parseSourceEntry(repo);
    const items = await loadItems([source], true);
    expect(items.length).toBeGreaterThan(0);
    fs.rmSync(repo, { recursive: true });
    await expect(reloadRepositoryItems(items, [source], source.resolvedPath)).rejects.toThrow("Could not discover Git worktrees");
    await expect(loadItems([source], true)).rejects.toThrow("Could not discover Git worktrees");
    expect(items.length).toBeGreaterThan(0);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

for (const shape of ["separate", "bare"] as const) test(`${shape} Git storage preserves names and supports create/remove from a linked source`, async () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "twm-shape-")));
  const previousTmux = process.env.TMUX;
  delete process.env.TMUX;
  try {
    const repo = path.join(root, "repo");
    const common = path.join(root, "metadata");
    git("init", "-q", ...(shape === "separate" ? [`--separate-git-dir=${common}`] : []), repo);
    git("-C", repo, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-qm", "initial");
    const base = shape === "bare" ? path.join(root, "bare.git") : repo;
    if (shape === "bare") git("clone", "-q", "--bare", repo, base);
    const linked = path.join(root, "linked");
    git("-C", base, "worktree", "add", "-qb", "topic", linked);
    const expected = sessionNameFor(linked);
    const expectedPrimary = shape === "separate" ? sessionNameFor(repo) : "";
    const source = await parseSourceEntry(linked);
    const items = await loadItems(shape === "separate" ? [await parseSourceEntry(repo), source] : [source]);
    const current = items.find(item => item.path === linked)!;
    expect(current.sessionName).toBe(expected);
    expect(await createItem(linked, "created", "child", "topic", current.createRoot)).toBe("Created worktree created");
    const created = path.join(current.createRoot, "created");
    expect(git("-C", created, "rev-parse", "HEAD")).toBe(git("-C", linked, "rev-parse", "HEAD"));
    expect(await performAction("remove", created)).toBe("Removed worktree created");
    expect(fs.existsSync(created)).toBe(false);
    if (shape === "separate") {
      expect(items.find(item => item.path === repo)?.isPrimary).toBe(true);
      expect(items.find(item => item.path === repo)?.sessionName).toBe(expectedPrimary);
    } else expect(items.every(item => !item.isPrimary)).toBe(true);
  } finally {
    if (previousTmux === undefined) delete process.env.TMUX; else process.env.TMUX = previousTmux;
    fs.rmSync(root, { recursive: true, force: true });
  }
}, 60_000);
