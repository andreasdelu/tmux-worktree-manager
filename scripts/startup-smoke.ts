import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Compiled first-paint/reconciliation proof with controlled slow Git, not a
// claim about normal filesystem/model performance. No user config is changed.
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "twm-startup-")));
const config = path.join(root, "config"), repo = path.join(root, "repo"), bin = path.join(root, "bin");
const git = (...args: string[]) => {
  const result = Bun.spawnSync(["/usr/bin/git", "-c", "core.hooksPath=/dev/null", "-c", "commit.gpgSign=false", ...args]);
  if (result.exitCode) throw new Error(result.stderr.toString());
};
const strip = (text: string) => text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "").replace(/\x1b\][^\x07]*\x07/g, "");
async function popup(warm: boolean) {
  let output = "";
  const start = performance.now();
  const terminal = new Bun.Terminal({ cols: 140, rows: 40, data(_term, bytes) { output += new TextDecoder().decode(bytes); } });
  const proc = Bun.spawn([path.resolve("dist/twm")], { terminal,
    env: { ...process.env, XDG_CONFIG_HOME: config, PATH: `${bin}:${process.env.PATH}` } });
  const wait = async (text: string) => {
    for (let n = 0; n < 200; n++) {
      if (strip(output).includes(text)) return performance.now() - start;
      if (proc.exitCode !== null) throw new Error(`Exited before ${text}: ${strip(output)}`);
      await Bun.sleep(25);
    }
    throw new Error(`Missing ${text}: ${strip(output).slice(-2000)}`);
  };
  try {
    const firstPaint = await wait(warm ? "cached-topic" : "repo/repo · primary");
    if (warm) {
      if (!strip(output).includes("Syncing…")) throw new Error("Cached rows painted without syncing marker");
      terminal.write("x"); await Bun.sleep(60);
      if (strip(output).includes("y confirm")) throw new Error("Cached row authorized removal");
    }
    await wait("Ready.");
    if (warm) {
      output = ""; terminal.write("j"); await Bun.sleep(200);
      if (strip(output).includes("cached-topic")) throw new Error("Removed worktree survived fresh discovery");
    }
    await Bun.sleep(350); terminal.write("q"); await proc.exited;
    console.log(JSON.stringify({ cache: warm ? "warm" : "cold", firstPaintMs: Math.round(firstPaint), controlledGitDelayMs: 300 }));
  } finally { proc.kill(); await proc.exited; terminal.close(); }
}
try {
  fs.mkdirSync(path.join(config, "twm"), { recursive: true }); fs.mkdirSync(bin);
  git("init", "-q", "-b", "main", repo);
  git("-C", repo, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--allow-empty", "-qm", "initial");
  const topic = path.join(root, "cached-topic"); git("-C", repo, "worktree", "add", "-qb", "topic", topic);
  fs.writeFileSync(path.join(config, "twm", "worktree-roots"), `${repo}\n`);
  fs.writeFileSync(path.join(bin, "git"), '#!/bin/sh\nsleep 0.3\nexec /usr/bin/git "$@"\n', { mode: 0o755 });
  await popup(false);
  const cache = path.join(config, "twm", "startup-cache.json");
  if (!fs.existsSync(cache) || !JSON.parse(fs.readFileSync(cache, "utf8")).items.some((item: any) => item.path === topic)) throw new Error("Cache not written");
  git("-C", repo, "worktree", "remove", topic);
  await popup(true);
  if (JSON.parse(fs.readFileSync(cache, "utf8")).items.some((item: any) => item.path === topic)) throw new Error("Cache not reconciled");
  console.log("PASS: compiled cached first paint precedes slow discovery, actions wait, vanished rows reconcile");
} finally { fs.rmSync(root, { recursive: true, force: true }); }
