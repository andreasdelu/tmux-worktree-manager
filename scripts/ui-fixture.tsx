import { mock } from "bun:test";
import React from "react";
import { PassThrough } from "node:stream";
import { render, Text, Box } from "ink";
import { strict as assert } from "node:assert";
import path from "node:path";
import type { Item, PreviewData, SourceEntry } from "../src/types";

// Run in a separate process: module mocks must not pollute real-Git tests.
const lib = (name: string) => path.resolve(`src/lib/${name}.ts`);
const item = (name: string): Item => ({ kind: "worktree", group: "repo", path: `/repo/${name}`, repoRoot: "/repo",
  createRoot: "/repo", name, branch: name, sessionName: name, available: true, locked: false, isPrimary: false, hasSession: true });
const a = item("a"), b = item("b");
const scenario = process.argv[2];
const actualPrs = await import("../src/lib/pullRequests");
const ghost = item("deleted");
const cachedPreview: PreviewData = { path: a.path, branch: "cached-branch", base: "", track: "", status: "cached-clean", ancestry: "unknown", tmux: "Checking…", last: "cached commit", changes: [] };
const source: SourceEntry = { raw: "/repo", path: "/repo", resolvedPath: "/repo", valid: true, exists: true, issue: "", commonDir: "/repo/.git" };
let nextItems = [a, b];
let delayedRefresh: (() => void) | undefined;
let holdRefresh = ["cached-start", "changed-sources"].includes(scenario);
let key = "fixture";
let validSources = scenario !== "invalid-sources";
let loadCount = 0;
let discoveryFailed = scenario === "failed-discovery";
let delayedRemoval: ((reason: string | null) => void) | undefined;
let holdRemoval = false;
let previewLoads = 0;
let prLoads = 0;
let holdPreview = ["cached-start", "late-preview"].includes(scenario);
const pendingPreviews: Array<() => void> = [];
let holdPr = ["cached-start", "removed-pr-source"].includes(scenario);
const pendingPrs: Array<() => void> = [];
const pendingLive: Array<{ path?: string; finish: () => void }> = [];
let holdLive = false;
const opens: string[] = [];
let exits = 0;
let finishAction: (() => void) | undefined;
let finishReload: (() => void) | undefined;
mock.module(lib("preferences"), () => ({ readCloseOnOpen: () => scenario !== "close-preference" }));
// Controller fixtures must neither hydrate nor write the real user cache.
mock.module(lib("startupCache"), () => ({ readStartupCache: () => ["cached-start", "changed-sources", "invalid-sources"].includes(scenario) ? { sourcesKey: "fixture", items: [ghost, a, b], previews: { [a.path]: cachedPreview }, pullRequests: { "/repo": { status: "ready", repository: "owner/repo", pullRequests: [], coverage: "complete" } } } : undefined, writeStartupCache: () => true, getSourcesKey: () => key }));
const actions: string[] = [];
const creations: unknown[][] = [];
mock.module(lib("sources"), () => ({ formatPath: (value: string) => value, loadSources: async () => validSources ? [source] : [], parseSourceEntry: async () => source, writeSources() {} }));
mock.module(lib("discovery"), () => ({
  loadItems: async () => { loadCount++; if (discoveryFailed) throw new Error("Git discovery refused"); if (holdRefresh) await new Promise<void>(resolve => { delayedRefresh = resolve; }); return nextItems; },
  annotateItemsWithLiveState: async (items: Item[], messagePath?: string) => {
    if (!holdLive) return items;
    return new Promise<Item[]>(resolve => { const number = pendingLive.length + 1;
      pendingLive.push({ path: messagePath, finish: () => resolve(items.map(entry => ({ ...entry,
        agentPanes: entry.path !== messagePath ? [] : [{ sessionId: "$1", paneId: "%1", windowIndex: "1", paneIndex: "1",
          dead: false, cwd: entry.path, report: { pid: 42, heartbeat: Date.now(), state: "idle", toolCount: 0 },
          messages: { human: `reply-${number}`, agent: "", heartbeat: Date.now() } }] }))) }); });
  },
  reloadRepositoryItems: async () => {
    if (scenario === "background-removal") await new Promise<void>(resolve => { finishReload = resolve; });
    if (["failed-reconciliation", "queued-reconciliation-failure", "create-reconciliation-failure", "close-reconciliation-failure"].includes(scenario)) throw new Error("Discovery refused");
    return nextItems;
  },
}));
mock.module(lib("update"), () => ({ checkForUpdate: async () => null }));
mock.module(lib("preview"), () => ({ startPreviewLoad: (dir: string) => {
  previewLoads++;
  const preview: PreviewData = { path: dir, branch: `fresh-${previewLoads}`, base: "", track: "", status: "clean", ancestry: "unknown", tmux: "existing", last: "commit", changes: [] };
  return { promise: holdPreview ? new Promise<PreviewData>(resolve => { pendingPreviews.push(() => resolve(preview)); }) : Promise.resolve(preview), cancel() {} };
} }));
mock.module(lib("pullRequests"), () => ({ ...actualPrs, cancelPullRequestLoads() {}, loadPullRequests: async () => {
  prLoads++;
  if (holdPr) await new Promise<void>(resolve => { pendingPrs.push(resolve); });
  return { status: "ready", repository: "owner/repo", pullRequests: [], coverage: "complete" };
} }));
mock.module(lib("actions"), () => ({
  openItem(dir: string) { opens.push(dir); }, createItemResult: async (...args: unknown[]) => { creations.push(args); return { message: "Invalid branch name", sessionReady: false }; },
  performAction: async (mode: string, dir: string) => {
    actions.push(`${mode}:${dir}`);
    if (["background-removal", "queued-reconciliation-failure"].includes(scenario)) await new Promise<void>(resolve => { finishAction = resolve; });
    return "Closed";
  },
  removalBlockedReason: async () => holdRemoval ? new Promise<string | null>(resolve => { delayedRemoval = resolve; }) : null,
}));
const { useTwmStore } = await import("../src/store");
const { useTwmController } = await import("../src/useTwmController");
const { useTwmInput } = await import("../src/useTwmInput");
const { SidebarPane, DetailsPane, StatusLine } = await import("../src/ui");
const stdin = Object.assign(new PassThrough(), { isTTY: true, setRawMode() {}, ref() {}, unref() {} });
const stdout = Object.assign(new PassThrough(), { isTTY: true, columns: 120, rows: 40 });
let output = "";
stdout.on("data", chunk => { output += chunk.toString(); });
const App = () => {
  const controller = useTwmController(); useTwmInput({ exit() { exits++; }, controller });
  return scenario === "cached-start" ? <Box flexDirection="column"><Box>
    <SidebarPane mainPanelsHeight={30} isSplit sourceRowsTarget={24} /><DetailsPane mainPanelsHeight={30} isSplit />
  </Box><StatusLine statusBoxHeight={3} /></Box> : <Text>Fixture</Text>;
};
const instance = render(<App />, { stdin, stdout, stderr: stdout, patchConsole: false, exitOnCtrlC: false });
let rendererExited = false;
void instance.waitUntilExit().then(() => { rendererExited = true; });
const wait = async (predicate: () => boolean, label: string) => {
  for (let n = 0; n < 200; n++) { if (predicate()) return; await Bun.sleep(10); }
  throw new Error(`Timed out: ${label}`);
};
const press = async (key: string) => { stdin.write(key); await Bun.sleep(60); };
try {
  if (scenario === "failed-discovery") {
    await wait(() => !useTwmStore.getState().loading && !useTwmStore.getState().syncing, "failed startup discovery");
    assert.deepEqual(useTwmStore.getState().items, []); assert.equal(useTwmStore.getState().cachedList, true);
    assert.match(useTwmStore.getState().message, /Could not discover/);
    await press("r"); assert.equal(useTwmStore.getState().cachedList, true);
    discoveryFailed = false; await press("r");
    await wait(() => !useTwmStore.getState().cachedList && useTwmStore.getState().items.length === 2, "retry with no selected worktree");
    await press("\r"); assert.deepEqual(opens, [a.path]);
    console.log(`PASS ${scenario}`);
  } else if (scenario === "late-messages") {
    await wait(() => !useTwmStore.getState().loading && !useTwmStore.getState().syncing, "startup");
    await Bun.sleep(60); holdLive = true;
    await press("j"); await wait(() => pendingLive.length === 1, "held B messages");
    await press("k"); await wait(() => pendingLive.length === 2, "held A messages");
    await press("j"); await wait(() => pendingLive.length === 3, "held newest B messages");
    pendingLive[0]!.finish(); await Bun.sleep(40);
    assert.equal(useTwmStore.getState().items[1]?.agentPanes?.[0]?.messages, undefined, "Obsolete B response cannot populate revisited B");
    pendingLive[2]!.finish(); await wait(() => useTwmStore.getState().items[1]?.agentPanes?.[0]?.messages?.human === "reply-3", "latest B messages");
    pendingLive[1]!.finish(); await Bun.sleep(40);
    assert.equal(useTwmStore.getState().items[0]?.agentPanes?.[0]?.messages, undefined, "Late A cannot expose unselected messages");
    assert.equal(useTwmStore.getState().items[1]?.agentPanes?.[0]?.messages?.human, "reply-3");
    console.log(`PASS ${scenario}`);
  } else if (scenario === "late-preview") {
    await wait(() => pendingPreviews.length === 1, "initial held preview");
    await press("j"); await wait(() => pendingPreviews.length === 2, "held B preview");
    await press("k"); await wait(() => pendingPreviews.length === 3, "held latest A preview");
    pendingPreviews[0]!(); await Bun.sleep(40);
    assert.equal(useTwmStore.getState().preview, null, "Obsolete A request must not populate same-path A revisit");
    pendingPreviews[2]!(); await wait(() => useTwmStore.getState().preview?.branch === "fresh-3", "latest A preview");
    pendingPreviews[1]!(); await Bun.sleep(40);
    assert.equal(useTwmStore.getState().preview?.branch, "fresh-3");
    console.log(`PASS ${scenario}`);
  } else if (scenario === "removed-pr-source") {
    await wait(() => pendingPrs.length > 0, "held PR request");
    validSources = false; nextItems = []; await press("r");
    await wait(() => !useTwmStore.getState().syncing && useTwmStore.getState().items.length === 0, "removed source");
    for (const resolve of pendingPrs.splice(0)) resolve(); await Bun.sleep(40);
    assert.deepEqual(useTwmStore.getState().pullRequests, {}, "Late PR response cannot restore removed source state");
    console.log(`PASS ${scenario}`);
  } else if (scenario === "changed-sources") {
    await wait(() => Boolean(delayedRefresh), "held startup discovery");
    key = "changed"; validSources = false; nextItems = []; holdRefresh = false; delayedRefresh!();
    await wait(() => !useTwmStore.getState().syncing, "source-key retry");
    assert.ok(loadCount >= 2, "Key change must reject and retry the in-flight snapshot");
    assert.deepEqual(useTwmStore.getState().items, []);
    assert.deepEqual(useTwmStore.getState().pullRequests, {});
    assert.equal(useTwmStore.getState().view, "sources");
    assert.equal(useTwmStore.getState().dialog.kind, "add-source");
    console.log(`PASS ${scenario}`);
  } else if (scenario === "invalid-sources") {
    await wait(() => !useTwmStore.getState().syncing, "invalid sources");
    assert.deepEqual(useTwmStore.getState().items, []); assert.deepEqual(useTwmStore.getState().pullRequests, {});
    assert.equal(useTwmStore.getState().dialog.kind, "add-source");
    console.log(`PASS ${scenario}`);
  } else if (scenario === "cached-start") {
    await wait(() => Boolean(delayedRefresh), "background discovery");
    assert.equal(useTwmStore.getState().loading, false, "Cached rows must be navigable before discovery resolves");
    assert.equal(useTwmStore.getState().cachedList, true);
    assert.ok(output.includes("Syncing…") && output.includes("deleted"), "Real UI paints cached rows and syncing marker before discovery");
    assert.equal(previewLoads, 0, "Do not launch cached-path Git commands before discovery");
    await press("j"); assert.equal(useTwmStore.getState().preview?.branch, "cached-branch");
    for (const key of ["c", "d", "x", "\r"]) await press(key);
    assert.equal(useTwmStore.getState().dialog.kind, "none"); assert.deepEqual(actions, []); assert.deepEqual(creations, []); assert.deepEqual(opens, []);
    assert.ok(output.includes("cached-branch") && output.includes("Cached Git/PR state"));
    holdRefresh = false; delayedRefresh!();
    await wait(() => !useTwmStore.getState().syncing && pendingPreviews.length > 0, "fresh list reconciliation");
    assert.ok(useTwmStore.getState().cachedPreviewPaths.includes(a.path));
    assert.ok(useTwmStore.getState().cachedPrRoots.includes("/repo"));
    holdPreview = false; for (const resolve of pendingPreviews.splice(0)) resolve();
    await wait(() => !useTwmStore.getState().cachedPreviewPaths.includes(a.path), "fresh Git details");
    assert.ok(useTwmStore.getState().cachedPrRoots.includes("/repo"), "PR provenance waits for its own response");
    holdPr = false; for (const resolve of pendingPrs.splice(0)) resolve();
    await wait(() => !useTwmStore.getState().cachedPrRoots.includes("/repo"), "fresh PR state");
    assert.deepEqual(useTwmStore.getState().items.map(item => item.path), [a.path, b.path]);
    assert.equal(useTwmStore.getState().items[useTwmStore.getState().selected]?.path, a.path);
    assert.match(useTwmStore.getState().preview?.branch ?? "", /^fresh-/);
    console.log(`PASS ${scenario}`);
  } else {
  await wait(() => !useTwmStore.getState().syncing && !useTwmStore.getState().loading && !useTwmStore.getState().previewLoading, "initial preview");
  if (["create-reconciliation-failure", "close-reconciliation-failure"].includes(scenario)) {
    if (scenario === "create-reconciliation-failure") { await press("c"); await press("topic"); await press("\r"); }
    else { await press("d"); await press("y"); }
    await wait(() => useTwmStore.getState().dialog.kind === "none" && useTwmStore.getState().cachedList, "reconciliation failure recovered");
    assert.match(useTwmStore.getState().message, /could not refresh worktrees/);
    await press("\r"); assert.deepEqual(opens, []);
    await press("r"); await wait(() => !useTwmStore.getState().cachedList, "fresh state after failure");
    await press("\r"); assert.deepEqual(opens, [a.path]);
  } else if (scenario === "queued-reconciliation-failure") {
    await press("x"); await press("y"); await wait(() => !!finishAction, "held first action");
    await press("j"); await press("x"); await press("y");
    assert.deepEqual(useTwmStore.getState().removingPaths, [a.path, b.path]);
    finishAction!();
    await wait(() => useTwmStore.getState().removingPaths.length === 0, "failed queue drained");
    assert.deepEqual(actions, ["remove:/repo/a"], "Reconciliation failure skips queued writes");
    assert.equal(useTwmStore.getState().cachedList, true);
    await press("\r"); assert.deepEqual(opens, []);
    await press("r"); await wait(() => !useTwmStore.getState().cachedList, "queue failure recovery");
    await press("\r"); assert.deepEqual(opens, [b.path]);
  } else if (scenario === "failed-reconciliation") {
    await press("x"); await wait(() => useTwmStore.getState().dialog.kind === "confirm", "remove confirmation");
    await press("y"); await wait(() => useTwmStore.getState().removingPaths.length === 0 && actions.length === 1, "failed reconciliation");
    assert.equal(useTwmStore.getState().cachedList, true); assert.match(useTwmStore.getState().message, /could not refresh worktrees/);
    await press("\r"); await press("c"); assert.deepEqual(opens, []); assert.deepEqual(creations, []);
    nextItems = [b]; await press("r"); await wait(() => !useTwmStore.getState().syncing && !useTwmStore.getState().cachedList, "recovery refresh");
    await press("\r"); assert.deepEqual(opens, [b.path]);
  } else if (scenario === "text-editing") {
    await press("c"); await press("abcd"); await press("\x1b[D"); await press("\x1b[D"); await press("X");
    let dialog = useTwmStore.getState().dialog;
    assert.equal(dialog.kind === "create" && dialog.worktreeName, "abXcd");
    await press("\x7f"); await press("\x1b[3~");
    dialog = useTwmStore.getState().dialog; assert.equal(dialog.kind === "create" && dialog.worktreeName, "abd");
    await press("\t"); await press("branch"); await press("\x01"); await press("pre-");
    dialog = useTwmStore.getState().dialog; assert.equal(dialog.kind === "create" && dialog.branchName, "pre-branch");
    await press("\t"); await press("main");
    await press("\t"); await press(" ");
    dialog = useTwmStore.getState().dialog; assert.equal(dialog.kind === "create" && dialog.sessionMode, "create");
    await press("\t"); await press(" ");
    dialog = useTwmStore.getState().dialog; assert.equal(dialog.kind === "create" && dialog.sessionMode, "open");
    await press(" ");
    dialog = useTwmStore.getState().dialog; assert.equal(dialog.kind === "create" && dialog.sessionMode, "create");
    await press("\x1b[Z"); await press(" ");
    dialog = useTwmStore.getState().dialog; assert.equal(dialog.kind === "create" && dialog.sessionMode, "none");
    await press("\r");
    await wait(() => creations.length === 1, "edited create");
    assert.deepEqual(creations[0], [a.path, "abd", "pre-branch", "main", a.createRoot, "none"]);
    await press("\t"); await press("a"); await press("café🙂"); await press("\x7f"); await press("\x1b[D"); await press("X");
    dialog = useTwmStore.getState().dialog;
    assert.equal(dialog.kind === "add-source" && dialog.value, "cafXé");
    await press("\x1b"); assert.equal(useTwmStore.getState().dialog.kind, "none");
    useTwmStore.setState({ view: "worktrees" }); await press("x");
    await wait(() => useTwmStore.getState().dialog.kind === "confirm", "confirm after edit");
    await press("\r"); assert.deepEqual(actions, []); assert.equal(useTwmStore.getState().dialog.kind, "none");
  } else if (scenario === "source-jumps") {
    const c = { ...item("c"), repoRoot: "/second", group: "second" };
    const d = { ...item("d"), repoRoot: "/third", group: "third" };
    useTwmStore.setState({ items: [a, b, c, d], selected: 1 });
    await press("l"); assert.equal(useTwmStore.getState().selected, 2);
    await press("l"); assert.equal(useTwmStore.getState().selected, 3);
    await press("l"); assert.equal(useTwmStore.getState().selected, 3);
    await press("h"); assert.equal(useTwmStore.getState().selected, 2);
    await press("h"); assert.equal(useTwmStore.getState().selected, 0);
    await press("h"); assert.equal(useTwmStore.getState().selected, 0);
  } else if (scenario === "close-preference") {
    await press("o"); assert.equal(useTwmStore.getState().closeOnOpen, false, "Old shortcut is inert");
    await press("\r"); assert.deepEqual(opens, [a.path]); assert.equal(exits, 0);
    useTwmStore.setState({ closeOnOpen: true });
    await press("o"); assert.equal(useTwmStore.getState().closeOnOpen, true);
    await press("\r"); assert.equal(exits, 1);
  } else if (scenario === "background-removal") {
    await press("x"); await wait(() => useTwmStore.getState().dialog.kind === "confirm", "remove confirmation");
    await press("y"); await wait(() => !!finishAction, "held remove");
    assert.deepEqual(useTwmStore.getState().removingPaths, [a.path]);
    assert.equal(useTwmStore.getState().dialog.kind, "none");
    await press("\r"); await press("x"); assert.deepEqual(opens, []);
    assert.equal(useTwmStore.getState().dialog.kind, "none", "Cannot open/remove the active deletion");
    await press("j"); assert.equal(useTwmStore.getState().selected, 1);
    await press("\r"); assert.deepEqual(opens, [b.path]); assert.equal(exits, 0, "Opening keeps queue alive");
    await press("x"); await wait(() => useTwmStore.getState().dialog.kind === "confirm", "second removal confirmation");
    await press("\x1b"); assert.equal(useTwmStore.getState().dialog.kind, "none", "Can cancel while removing");
    await press("x"); await press("y");
    assert.deepEqual(useTwmStore.getState().removingPaths, [a.path, b.path]);
    await press("x"); await press("\r");
    assert.deepEqual(opens, [b.path], "Cannot open a queued deletion");
    assert.equal(useTwmStore.getState().dialog.kind, "none");
    for (const key of ["c", "d", "r", "q", "\x1b"]) await press(key);
    assert.equal(exits, 0); assert.deepEqual(creations, []);
    assert.deepEqual(actions, ["remove:/repo/a"], "Queued writes must not overlap");
    await press("\x03"); assert.equal(exits, 0); assert.equal(rendererExited, false);
    nextItems = [b]; const firstAction = finishAction!; finishAction = undefined; firstAction();
    await wait(() => !!finishReload, "held reconciliation");
    await press("\x03"); assert.equal(exits, 0); assert.equal(rendererExited, false);
    finishReload!(); finishReload = undefined;
    await wait(() => actions.length === 2 && !!finishAction, "second queued removal starts");
    assert.deepEqual(actions, ["remove:/repo/a", "remove:/repo/b"]);
    assert.deepEqual(useTwmStore.getState().removingPaths, [b.path]);
    assert.equal(useTwmStore.getState().items[useTwmStore.getState().selected]?.path, b.path);
    nextItems = []; finishAction!(); await wait(() => !!finishReload, "second reconciliation");
    finishReload!(); await wait(() => useTwmStore.getState().removingPaths.length === 0, "queue drained");
    assert.deepEqual(useTwmStore.getState().items, []);
    assert.equal(useTwmStore.getState().dialog.kind, "none");
    await press("\x03"); assert.equal(exits, 1);
  } else if (scenario === "linear-paste") {
    const branch = "andreasdeleuran/lan-18257-add-a-way-for-owners-to-invite-collaborators-in-api";
    await press("c"); await press(`\x1b[200~${branch}\x1b[201~`);
    const dialog = useTwmStore.getState().dialog;
    assert.equal(dialog.kind, "create");
    if (dialog.kind !== "create") throw new Error("Create dialog missing");
    assert.equal(dialog.branchName, branch);
    assert.equal(dialog.worktreeName, "lan-18257-add-a-way-for");
    await press("\r"); await wait(() => creations.length === 1, "create from copied branch");
    assert.deepEqual(creations[0], [a.path, "lan-18257-add-a-way-for", branch, undefined, a.createRoot, "none"]);
  } else if (scenario === "details-keys") {
    await press("]"); await press("["); await press("/"); await press("s");
    assert.equal(useTwmStore.getState().detailsScroll, 0);
    assert.equal(useTwmStore.getState().dialog.kind, "none", "Stack lives only in details");
    await press("\x1b[6~"); assert.equal(useTwmStore.getState().detailsScroll, 5);
    await press("c"); await press("\x1b[6~");
    assert.equal(useTwmStore.getState().detailsScroll, 5, "Dialog input must not scroll details");
    await press("\x1b"); await press("\x1b[5~"); assert.equal(useTwmStore.getState().detailsScroll, 0);
  } else if (scenario === "confirmation") {
    holdRefresh = true;
    await press("r"); await wait(() => Boolean(delayedRefresh), "pending refresh");
    await press("d");
    const dialog = useTwmStore.getState().dialog;
    assert.equal(dialog.kind, "confirm");
    assert.equal(dialog.kind === "confirm" && dialog.targetPath, a.path);
    nextItems = [b, a]; holdRefresh = false; delayedRefresh!();
    await Bun.sleep(100); await press("y");
    await wait(() => Boolean(actions.length), "close action");
    assert.deepEqual(actions, ["kill:/repo/a"]);
    await wait(() => previewLoads >= 2 && !useTwmStore.getState().cachedPreviewPaths.includes(a.path), "fresh same-path preview after close");
    assert.ok(previewLoads >= 2);
  } else if (scenario === "late-removal") {
    holdRemoval = true;
    await press("x"); await wait(() => Boolean(delayedRemoval), "pending removal safety");
    await press("c"); assert.equal(useTwmStore.getState().dialog.kind, "create");
    delayedRemoval!(null); await Bun.sleep(100);
    assert.equal(useTwmStore.getState().dialog.kind, "create");
    await press("test"); await press("\r");
    await wait(() => useTwmStore.getState().dialog.kind === "none", "failed creation");
    await wait(() => previewLoads >= 2 && !useTwmStore.getState().cachedPreviewPaths.includes(a.path), "fresh same-path failed creation preview");
    assert.ok(previewLoads >= 2);
  } else if (scenario === "revisit") {
    await press("j"); await wait(() => useTwmStore.getState().preview?.path === b.path, "second branch");
    const count = prLoads;
    await press("k"); await wait(() => !useTwmStore.getState().previewLoading, "first branch again");
    assert.ok(prLoads > count, "Revisiting must consult the reader so it can honor TTL");
    assert.equal(useTwmStore.getState().preview?.path, a.path);
  } else if (scenario === "stale-refresh") {
    holdRefresh = true; await press("r"); await wait(() => Boolean(delayedRefresh), "pending refresh");
    await press("d"); await press("y");
    await wait(() => actions.length === 1 && useTwmStore.getState().dialog.kind === "none", "close completed");
    const store = useTwmStore.getState();
    const message = store.message;
    nextItems = [b]; holdRefresh = false; delayedRefresh!(); await Bun.sleep(100);
    assert.deepEqual(useTwmStore.getState().items.map(item => item.path), [a.path, b.path]);
    assert.equal(useTwmStore.getState().message, message);
  } else if (scenario === "vanished-target") {
    holdRefresh = true; await press("r"); await wait(() => Boolean(delayedRefresh), "pending refresh");
    await press("d"); nextItems = [b]; holdRefresh = false; delayedRefresh!();
    await Bun.sleep(100); assert.equal(useTwmStore.getState().dialog.kind, "none");
    await press("y"); assert.deepEqual(actions, []);
  } else throw new Error(`Unknown scenario ${scenario}`);
  console.log(`PASS ${scenario}`);
  }
} finally { instance.unmount(); stdin.destroy(); stdout.destroy(); }
