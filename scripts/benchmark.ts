import path from "node:path";

// Use the popup's Git environment, not coding-harness wrappers, when available.
const tmux = Bun.spawnSync(["tmux", "show-environment", "-g", "PATH"]);
const popupPath = tmux.exitCode === 0 ? tmux.stdout.toString().trim().replace(/^PATH=/, "") : process.env.PATH;
const roots = [process.cwd(), ...(process.argv[2] ? [path.resolve(process.argv[2])] : [])];
for (const [index, root] of roots.entries()) {
  for (let iteration = 0; iteration < 3; iteration++) {
    const script = `
      let syncCalls=0,asyncCalls=0;
      const sync=Bun.spawnSync,spawn=Bun.spawn;
      Bun.spawnSync=function(...args){syncCalls++;return sync(...args)};
      Bun.spawn=function(...args){asyncCalls++;return spawn(...args)};
      const {loadSources}=await import(${JSON.stringify(path.join(root, "src/lib/sources.ts"))});
      const {loadItems}=await import(${JSON.stringify(path.join(root, "src/lib/discovery.ts"))});
      const start=performance.now(); const sources=await loadSources();
      ${index ? "await loadSources();" : ""}
      const items=await loadItems(sources); const ready=performance.now();
      const startup={syncCalls,asyncCalls}; syncCalls=0;asyncCalls=0;
      await loadItems(sources); const refreshed=performance.now();
      console.log(JSON.stringify({version:${JSON.stringify(index ? "baseline" : "current")},sources:sources.length,items:items.length,
        listReadyMs:Math.round(ready-start),refreshMs:Math.round(refreshed-ready),startup,refresh:{syncCalls,asyncCalls}}));
    `;
    const result = Bun.spawnSync({ cmd: [process.execPath, "-e", script], env: { ...process.env, PATH: popupPath } });
    if (result.exitCode) throw new Error(result.stderr.toString());
    process.stdout.write(result.stdout);
  }
}
