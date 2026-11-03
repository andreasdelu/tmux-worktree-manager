import { test, expect } from "bun:test";
for (const scenario of ["confirmation", "late-removal", "revisit", "vanished-target", "stale-refresh", "linear-paste", "details-keys", "cached-start", "changed-sources", "invalid-sources", "late-preview", "late-messages", "removed-pr-source", "source-jumps", "close-preference", "background-removal", "queued-reconciliation-failure", "create-reconciliation-failure", "close-reconciliation-failure", "text-editing", "failed-reconciliation", "failed-discovery"]) {
  test(`controller/input interaction: ${scenario}`, async () => {
    const process = Bun.spawn(["bun", "run", "scripts/ui-fixture.tsx", scenario], { stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, code] = await Promise.all([new Response(process.stdout).text(), new Response(process.stderr).text(), process.exited]);
    expect({ code, stderr }).toEqual({ code: 0, stderr: "" });
    expect(stdout).toContain(`PASS ${scenario}`);
  }, 10_000);
}
