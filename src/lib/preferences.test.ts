import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("opening stays open by default; only an explicit true opts into closing", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "twm-preferences-"));
  const file = path.join(root, "twm", "preferences.json");
  const read = () => {
    const result = Bun.spawnSync(["bun", "-e", "import {readCloseOnOpen} from './src/lib/preferences.ts'; console.log(readCloseOnOpen())"],
      { env: { ...process.env, XDG_CONFIG_HOME: root } });
    expect(result.exitCode).toBe(0);
    return result.stdout.toString().trim();
  };
  try {
    expect(read()).toBe("false");
    expect(fs.existsSync(file)).toBe(false);
    fs.mkdirSync(path.dirname(file));
    for (const [content, expected] of [["{}", "false"], ['{"closeOnOpen":false}', "false"], ['{"closeOnOpen":true}', "true"], ['{"closeOnOpen":"true"}', "false"], ["corrupt", "false"], ["null", "false"]]) {
      fs.writeFileSync(file, content!);
      expect(read()).toBe(expected!);
      expect(fs.readFileSync(file, "utf8")).toBe(content!);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
