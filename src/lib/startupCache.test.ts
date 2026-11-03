import { test, expect } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readStartupCache, writeStartupCache } from "./startupCache";
import type { Item, PreviewData } from "../types";

const item: Item = { kind: "worktree", path: "/repo/topic", group: "repo", name: "topic", repoRoot: "/repo",
  createRoot: "/repo", branch: "topic", sessionName: "repo__topic--1234", available: true, locked: false,
  isPrimary: false, hasSession: true, agentPanes: [{ sessionId: "$1", paneId: "%1", windowIndex: "1", paneIndex: "1",
    cwd: "/repo/topic", dead: false, messages: { human: "PRIVATE-HUMAN", agent: "PRIVATE-AGENT", heartbeat: 100000 }, report: { pid: 42, heartbeat: 100000, state: "working", toolCount: 0 } }] };
const preview: PreviewData = { path: item.path, branch: "topic", base: "origin/topic", track: "[ahead 1]", status: "clean",
  ancestry: "not contained", tmux: "attached", last: "1234 commit", changes: [] };
const prs = { "/repo": { status: "ready" as const, repository: "owner/repo", coverage: "complete" as const,
  pullRequests: [{ number: 1, url: "https://github.com/owner/repo/pull/1", state: "open" as const, draft: false,
    headRef: "topic", baseRef: "main", headRepo: "owner/repo", baseRepo: "owner/repo", mergedAt: null }] } };

test("atomic snapshot keeps display metadata but never live sessions/agents; source and age changes discard it", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "twm-cache-test-")), file = path.join(dir, "cache.json");
  try {
    expect(writeStartupCache([item], new Map([[item.path, preview]]), prs, file, "sources", 100000)).toBe(true);
    const cache = readStartupCache(file, "sources", 100001)!;
    expect(cache.items[0]?.hasSession).toBe(false); expect(cache.items[0]?.agentPanes).toBeUndefined();
    expect(cache.previews[item.path]?.tmux).toBe("Checking…");
    expect(cache.pullRequests["/repo"]?.pullRequests[0]?.number).toBe(1);
    expect(fs.readFileSync(file, "utf8")).not.toContain("heartbeat");
    expect(fs.readFileSync(file, "utf8")).not.toContain("PRIVATE-HUMAN");
    expect(fs.readFileSync(file, "utf8")).not.toContain("PRIVATE-AGENT");
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    expect(fs.readdirSync(dir)).toEqual(["cache.json"]);
    expect(readStartupCache(file, "changed", 100001)).toBeUndefined();
    expect(readStartupCache(file, "sources", 99999)).toBeUndefined();
    expect(readStartupCache(file, "sources", 100000 + 8 * 86400000)).toBeUndefined();
    expect(writeStartupCache([{ ...item, name: "bad\x1b" }], new Map(), {}, file, "sources")).toBe(false);
    expect(readStartupCache(file, "sources", 100001)?.items[0]?.name).toBe("topic"); // failure preserves previous snapshot
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("corrupt, oversized, duplicate and unsafe snapshots cannot seed UI state", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "twm-cache-invalid-")), file = path.join(dir, "cache.json");
  try {
    expect(readStartupCache(file, "sources")).toBeUndefined();
    fs.writeFileSync(file, "{"); expect(readStartupCache(file, "sources")).toBeUndefined();
    fs.writeFileSync(file, " ".repeat(4 * 1024 * 1024 + 1)); expect(readStartupCache(file, "sources")).toBeUndefined();
    for (const items of [[{ ...item, path: "relative" }], [item, item], [{ ...item, sessionName: "topic\u001bkill-server" }]]) {
      fs.writeFileSync(file, JSON.stringify({ version: 1, savedAt: 100000, sourcesKey: "sources", items, previews: {}, pullRequests: {} }));
      expect(readStartupCache(file, "sources", 100001)).toBeUndefined();
    }
    writeStartupCache([item], new Map([[item.path, preview]]), prs, file, "sources", 100000);
    const raw = JSON.parse(fs.readFileSync(file, "utf8")); raw.previews[item.path].last = "\x1b[2J";
    raw.pullRequests["/repo"].pullRequests[0].url = "https://attacker/pull/1";
    fs.writeFileSync(file, JSON.stringify(raw));
    const cache = readStartupCache(file, "sources", 100001)!;
    expect(cache.items).toHaveLength(1); expect(cache.previews).toEqual({}); expect(cache.pullRequests).toEqual({});
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
