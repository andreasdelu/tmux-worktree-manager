import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Match the popup's PATH rather than measuring coding-harness Git wrappers.
if (!process.env.TWM_PERF_CHILD) {
  const tmux = Bun.spawnSync(["tmux", "show-environment", "-g", "PATH"]);
  const popupPath = tmux.exitCode === 0 ? tmux.stdout.toString().trim().replace(/^PATH=/, "") : process.env.PATH;
  const child = Bun.spawnSync({ cmd: [process.execPath, import.meta.path], env: { ...process.env, PATH: popupPath, TWM_PERF_CHILD: "1" } });
  process.stdout.write(child.stdout); process.stderr.write(child.stderr); process.exit(child.exitCode);
}
const { loadSources } = await import("../src/lib/sources");
const { loadItems } = await import("../src/lib/discovery");
const { annotateAgentPanes, loadLiveItems } = await import("../src/lib/agents");
const measure = async (name: string, fn: () => unknown, iterations = 15) => {
  await fn();
  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now(); await fn(); times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  console.log(JSON.stringify({ name, iterations, medianMs: +times[Math.floor(times.length / 2)]!.toFixed(2), maxMs: +times.at(-1)!.toFixed(2) }));
};
const sources = await loadSources(), items = await loadItems(sources);
console.log(JSON.stringify({ sources: sources.length, items: items.length }));
await measure("source validation", loadSources);
await measure("full source + list discovery", async () => loadItems(await loadSources()));
await measure("list-only refresh", () => loadItems(sources));
await measure("live tmux poll (no message previews)", () => loadLiveItems(items));
// Synthetic scale probe, not a claim about normal user workloads. Missing paths
// intentionally exercise canonicalization's fallback too. No message text read.
const root = fs.mkdtempSync(path.join(os.tmpdir(), "twm-perf-"));
try {
  for (const size of [10, 100, 500]) {
    const trees = Array.from({ length: size }, (_, i) => ({ kind: "worktree" as const, group: "fixture", path: path.join(root, `tree-${i}`),
      name: `tree-${i}`, sessionName: `tree-${i}`, repoRoot: root, createRoot: root, branch: "main", available: true, locked: false, isPrimary: false, hasSession: false }));
    const panes = trees.map((tree, i) => ({ sessionId: `$${i}`, paneId: `%${i}`, windowIndex: "0", paneIndex: "0", dead: false, cwd: `${tree.path}/src` }));
    await measure(`synthetic unmatched ownership ${size}x${size}`, () => annotateAgentPanes(trees, panes, new Map(), true), 5);
    await measure(`synthetic session-matched ownership ${size}x${size}`, () => annotateAgentPanes(trees, panes, new Map(trees.map((tree, i) => [`$${i}`, tree.sessionName])), true), 5);
  }
} finally { fs.rmSync(root, { recursive: true, force: true }); }
