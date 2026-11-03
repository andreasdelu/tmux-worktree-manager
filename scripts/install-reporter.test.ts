import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const script = new URL("./install-reporter.sh", import.meta.url).pathname;

test("reporter installer selects explicit Pi/Pax destinations, updates both files and preserves neighbors", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "twm-reporter-install-"));
  const env = { ...process.env, HOME: root, PI_CODING_AGENT_DIR: "", PAX_RUNTIME_DIR: "", PAX_HOME: "" };
  const run = (args: string[], overrides = {}) => Bun.spawnSync(["bash", script, ...args], { cwd: os.tmpdir(), env: { ...env, ...overrides } });
  const check = (dir: string) => {
    expect(fs.readFileSync(path.join(dir, "index.ts"), "utf8")).toBe(fs.readFileSync(new URL("../extensions/pi.ts", import.meta.url), "utf8"));
    expect(fs.readFileSync(path.join(dir, "pi-reporter.ts"), "utf8")).toBe(fs.readFileSync(new URL("../extensions/pi-reporter.ts", import.meta.url), "utf8"));
    expect(fs.readdirSync(dir).sort()).toEqual(["index.ts", "pi-reporter.ts"]);
  };
  try {
    for (const args of [[], ["typo"], ["pi", "extra"]]) expect(run(args).exitCode).toBe(2);
    expect(fs.readdirSync(root)).toEqual([]);
    expect(run(["--help"]).exitCode).toBe(0);
    for (const [runtime, parent, overrides] of [
      ["pi", path.join(root, ".pi/agent"), {}],
      ["pax", path.join(root, ".pax/cache/pi-packages"), {}],
      ["pi", path.join(root, "custom pi"), { PI_CODING_AGENT_DIR: path.join(root, "custom pi") }],
      ["pax", path.join(root, "custom pax"), { PAX_RUNTIME_DIR: path.join(root, "custom pax"), PI_CODING_AGENT_DIR: path.join(root, "ignored pi") }],
      ["pax", path.join(root, "pax home/cache/pi-packages"), { PAX_HOME: path.join(root, "pax home") }],
    ] as const) {
      fs.mkdirSync(parent, { recursive: true });
      fs.writeFileSync(path.join(parent, "settings.json"), "leave settings alone");
      const result = run([runtime], overrides);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.toString()).toContain("/reload");
      const dest = path.join(parent, "extensions/twm"); check(dest);
      fs.writeFileSync(path.join(dest, "index.ts"), "old entrypoint");
      fs.writeFileSync(path.join(dest, "pi-reporter.ts"), "old helper");
      fs.writeFileSync(path.join(parent, "extensions/neighbor.ts"), "leave neighbor alone");
      expect(run([runtime], overrides).exitCode).toBe(0); check(dest);
      expect(fs.readFileSync(path.join(parent, "settings.json"), "utf8")).toBe("leave settings alone");
      expect(fs.readFileSync(path.join(parent, "extensions/neighbor.ts"), "utf8")).toBe("leave neighbor alone");
    }
    const dest = path.join(root, ".pi/agent/extensions/twm");
    // A failed second rename must be recoverable by rerunning, before reload.
    const bin = path.join(root, "bin"); fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, "mv"), '#!/usr/bin/env bash\ncase "$3" in */index.ts) exit 9 ;; esac\nexec /bin/mv "$@"\n', { mode: 0o755 });
    fs.writeFileSync(path.join(dest, "index.ts"), "old entrypoint");
    const failed = run(["pi"], { PATH: `${bin}:${process.env.PATH}` });
    expect(failed.exitCode).not.toBe(0);
    expect(failed.stderr.toString()).toContain("rerun the same command before /reload");
    expect(fs.readFileSync(path.join(dest, "index.ts"), "utf8")).toBe("old entrypoint");
    expect(run(["pi"]).exitCode).toBe(0); check(dest);
    const outside = path.join(root, "outside.ts"); fs.writeFileSync(outside, "keep");
    fs.unlinkSync(path.join(dest, "index.ts")); fs.symlinkSync(outside, path.join(dest, "index.ts"));
    expect(run(["pi"]).exitCode).toBe(1);
    expect(fs.readFileSync(outside, "utf8")).toBe("keep");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
