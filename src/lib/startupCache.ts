import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { configDir, sourcesFile } from "../config";
import type { Item, PreviewData } from "../types";
import type { PullRequestsReady, PullRequestsState } from "./pullRequests";

export const startupCacheFile = path.join(configDir, "startup-cache.json");
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export type StartupCache = {
  version: 1; sourcesKey: string; savedAt: number; items: Item[];
  previews: Record<string, PreviewData>; pullRequests: Record<string, PullRequestsReady>;
};
export const getSourcesKey = () => {
  try { return createHash("sha256").update(fs.readFileSync(sourcesFile)).digest("hex"); } catch { return ""; }
};
const text = (value: unknown): value is string => typeof value === "string" && value.length <= 4096 && !/[\x00-\x1f\x7f]/.test(value);
const absolute = (value: unknown): value is string => text(value) && path.isAbsolute(value);
const isObject = (value: unknown): value is Record<string, any> => !!value && typeof value === "object" && !Array.isArray(value);
const itemFields = ["group", "path", "name", "repoRoot", "createRoot", "branch", "sessionName"] as const;

// A display snapshot, not a Git/tmux authority. Drop all live session and agent
// metadata even when an old/corrupt writer included it in the JSON.
const displayItem = (value: any): Item | undefined => {
  if (!isObject(value) || !["worktree", "source-empty"].includes(value.kind)
    || !itemFields.every(field => text(value[field])) || ![value.path, value.repoRoot, value.createRoot].every(absolute)
    || !["isPrimary", "available", "locked"].every(field => typeof value[field] === "boolean")) return undefined;
  return { kind: value.kind, group: value.group, path: value.path, name: value.name, repoRoot: value.repoRoot,
    createRoot: value.createRoot, branch: value.branch, sessionName: value.sessionName,
    isPrimary: value.isPrimary, available: value.available, locked: value.locked, hasSession: false };
};
const displayPreview = (value: any, itemPath: string): PreviewData | undefined => {
  const fields = ["path", "branch", "base", "track", "status", "ancestry", "last"] as const;
  if (!isObject(value) || value.path !== itemPath || !fields.every(field => text(value[field]))
    || !Array.isArray(value.changes) || value.changes.length > 100 || !value.changes.every(text)) return undefined;
  return { path: value.path, branch: value.branch, base: value.base, track: value.track, status: value.status,
    ancestry: value.ancestry, last: value.last, changes: value.changes, tmux: "Checking…" };
};
const displayPrs = (value: any): PullRequestsReady | undefined => {
  const repository = /^[a-z\d-]+\/[a-z\d_.-]+$/i;
  if (!isObject(value) || value.status !== "ready" || !text(value.repository) || !repository.test(value.repository)
    || !["complete", "recent"].includes(value.coverage) || !Array.isArray(value.pullRequests) || value.pullRequests.length > 300) return undefined;
  const prs = value.pullRequests;
  for (const pr of prs) {
    if (!isObject(pr) || !Number.isSafeInteger(pr.number) || pr.number <= 0 || !["open", "draft", "closed", "merged"].includes(pr.state)
      || typeof pr.draft !== "boolean" || !text(pr.headRef) || !text(pr.baseRef) || !pr.headRef || !pr.baseRef
      || !text(pr.baseRepo) || !repository.test(pr.baseRepo) || !(pr.headRepo === null || text(pr.headRepo) && repository.test(pr.headRepo))
      || pr.url !== `https://github.com/${pr.baseRepo}/pull/${pr.number}`
      || !(pr.mergedAt === null || text(pr.mergedAt) && Number.isFinite(Date.parse(pr.mergedAt)))) return undefined;
  }
  return { status: "ready", repository: value.repository, coverage: value.coverage,
    pullRequests: prs.map(pr => ({ number: pr.number, url: pr.url, state: pr.state, draft: pr.draft,
      headRef: pr.headRef, baseRef: pr.baseRef, headRepo: pr.headRepo, baseRepo: pr.baseRepo, mergedAt: pr.mergedAt })) };
};

export function readStartupCache(file = startupCacheFile, key?: string, now = Date.now()): StartupCache | undefined {
  try {
    const expectedKey = key ?? getSourcesKey();
    if (!expectedKey || fs.statSync(file).size > MAX_BYTES) return undefined;
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!isObject(value) || value.version !== 1 || value.sourcesKey !== expectedKey
      || !Number.isSafeInteger(value.savedAt) || value.savedAt > now || now - value.savedAt > MAX_AGE_MS
      || !Array.isArray(value.items) || value.items.length > 2000 || !isObject(value.previews) || !isObject(value.pullRequests)) return undefined;
    const items = value.items.map(displayItem);
    if (items.some(item => !item) || new Set(items.map(item => item!.path)).size !== items.length) return undefined;
    const previews: Record<string, PreviewData> = {}, pullRequests: Record<string, PullRequestsReady> = {};
    for (const item of items as Item[]) {
      const preview = displayPreview(value.previews[item.path], item.path);
      if (preview) previews[item.path] = preview;
      const prs = displayPrs(value.pullRequests[item.repoRoot]);
      if (prs) pullRequests[item.repoRoot] = prs;
    }
    return { version: 1, sourcesKey: value.sourcesKey, savedAt: value.savedAt, items: items as Item[], previews, pullRequests };
  } catch { return undefined; }
}

export function writeStartupCache(items: Item[], previews: Map<string, PreviewData>, prs: Record<string, PullRequestsState>,
  file = startupCacheFile, key?: string, now = Date.now()): boolean {
  let temp = "";
  try {
    const expectedKey = key ?? getSourcesKey();
    if (!expectedKey) return false;
    const displayItems = items.map(displayItem);
    if (displayItems.some(item => !item)) return false;
    const previewRecords: Record<string, PreviewData> = {}, prRecords: Record<string, PullRequestsReady> = {};
    for (const item of items) {
      const preview = displayPreview(previews.get(item.path), item.path);
      if (preview) previewRecords[item.path] = preview;
      const pr = displayPrs(prs[item.repoRoot]);
      if (pr) prRecords[item.repoRoot] = pr;
    }
    const data = JSON.stringify({ version: 1, sourcesKey: expectedKey, savedAt: now,
      items: displayItems, previews: previewRecords, pullRequests: prRecords });
    if (Buffer.byteLength(data) > MAX_BYTES) return false;
    // A unique temp file plus same-directory rename makes concurrent popups
    // last-writer-wins, never a partial snapshot or a shared temp-file race.
    fs.mkdirSync(path.dirname(file), { recursive: true });
    temp = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
    fs.writeFileSync(temp, data, { mode: 0o600, flag: "wx" });
    fs.renameSync(temp, file); return true;
  } catch { return false; }
  finally { if (temp) { try { fs.unlinkSync(temp); } catch {} } }
}
