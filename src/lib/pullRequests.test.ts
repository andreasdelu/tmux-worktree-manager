import { describe, expect, test } from "bun:test";
import { startTextCommand } from "./commands";
import {
  createPullRequestReader,
  derivePullRequestStack,
  matchPullRequestForBranch,
  parseGitHubRemote,
  type PullRequest,
  type PullRequestsReady,
} from "./pullRequests";

const repository = "team/project";
const pr = (number: number, headRef: string, baseRef = "main", extra: Partial<PullRequest> = {}): PullRequest => ({
  number, url: `https://github.com/${repository}/pull/${number}`,
  state: "open", draft: false, headRef, baseRef,
  headRepo: repository, baseRepo: repository, mergedAt: null, ...extra,
});
const ready = (pullRequests: PullRequest[], coverage: PullRequestsReady["coverage"] = "complete"): PullRequestsReady => ({
  status: "ready", repository, pullRequests, coverage,
});
const node = (pullRequest: PullRequest) => ({
  number: pullRequest.number,
  url: pullRequest.url,
  state: pullRequest.state === "draft" ? "OPEN" : pullRequest.state.toUpperCase(),
  isDraft: pullRequest.draft,
  headRefName: pullRequest.headRef,
  baseRefName: pullRequest.baseRef,
  headRepository: pullRequest.headRepo === null ? null : { nameWithOwner: pullRequest.headRepo },
  baseRepository: { nameWithOwner: pullRequest.baseRepo },
  mergedAt: pullRequest.mergedAt,
});
const page = (nodes: unknown[], hasNextPage = false, endCursor: string | null = null) =>
  JSON.stringify({ data: { repository: { pullRequests: {
    nodes, pageInfo: { hasNextPage, endCursor },
  } } } });
const result = (stdout: string, exitCode = 0) => ({ stdout, stderr: "", exitCode });

// Small per-reader adapter, with real promises and no process/global mocks.
const fixture = (api: (cmd: string[]) => ReturnType<typeof result> | Promise<ReturnType<typeof result>> = () => result(page([]))) => {
  const commands: string[][] = [];
  let time = 0;
  let kills = 0;
  const reader = createPullRequestReader({
    which: () => "/bin/gh",
    now: () => time,
    ttlMs: 100,
    timeoutMs: 50,
    startCommand: cmd => {
      commands.push(cmd);
      return {
        proc: { kill: () => { kills++; } },
        promise: cmd[0] === "git"
          ? Promise.resolve(result("git@github.com:Team/Project.git\n"))
          : Promise.resolve(api(cmd)),
      };
    },
  });
  return { ...reader, commands, advance: (ms: number) => { time += ms; }, kills: () => kills };
};

describe("GitHub remote identity", () => {
  test("accepts HTTPS, SCP and SSH URLs without changing branch case semantics", () => {
    for (const remote of [
      "https://github.com/Team/Project.git",
      "https://github.com/Team/Project/",
      "git@github.com:Team/Project.git\n",
      "ssh://git@github.com/Team/Project.git",
      "ssh://git@github.com:22/Team/Project.git",
    ]) expect(parseGitHubRemote(remote)).toBe(repository);
  });

  test("rejects non-GitHub, misleading hosts, extra paths and query parameters", () => {
    for (const remote of [
      "https://gitlab.com/team/project.git", "https://github.com.evil.test/team/project.git",
      "https://evil.test/github.com/team/project", "git@github.com:team/project/extra",
      "https://github.com/team/project?token=secret", "https://github.com/team/..",
      "/local/project", "https://github.com/team/project#ref",
    ]) expect(parseGitHubRemote(remote)).toBeNull();
  });
});

describe("branch metadata and same-repository stacks", () => {
  test("prioritizes an active PR over branch reuse history, then newest number", () => {
    const data = ready([
      pr(4, "feature", "main", { state: "draft", draft: true }),
      pr(10, "feature", "main", { state: "merged" }),
      pr(3, "feature"), pr(20, "Feature"),
    ]);
    expect(matchPullRequestForBranch(data, "feature")).toEqual({ status: "matched", pullRequest: data.pullRequests[0] });
    expect(matchPullRequestForBranch(ready([pr(2, "old", "main", { state: "closed" }),
      pr(3, "old", "main", { state: "merged" })]), "old")).toMatchObject({
        status: "matched", pullRequest: { number: 3, state: "merged" },
      });
  });

  test("no match is distinct from unavailable and preserves limited-history coverage", () => {
    expect(matchPullRequestForBranch(ready([], "recent"), "old")).toEqual({ status: "no-pr", coverage: "recent" });
    expect(matchPullRequestForBranch(ready([]), "new")).toEqual({ status: "no-pr", coverage: "complete" });
  });

  test("excludes fork, deleted head repo, and other base-repo branch collisions", () => {
    const data = ready([
      pr(1, "feature", "main", { headRepo: "fork/project" }),
      pr(2, "feature", "main", { headRepo: null }),
      pr(3, "feature", "main", { baseRepo: "other/project" }),
    ]);
    expect(matchPullRequestForBranch(data, "feature").status).toBe("no-pr");
    expect(derivePullRequestStack(data, "feature").parents).toEqual([]);
    expect(matchPullRequestForBranch(ready([pr(4, "feature", "main", {
      headRepo: "TEAM/PROJECT", baseRepo: "Team/Project",
    })]), "feature").status).toBe("matched");
  });

  test("derives ordered parents and branching descendants from active PR edges only", () => {
    const data = ready([
      pr(1, "one"), pr(2, "two", "one", { state: "draft", draft: true }),
      pr(3, "three", "two"), pr(4, "four", "three"), pr(5, "side", "two"),
      pr(6, "closed", "two", { state: "closed" }),
      pr(7, "merged", "two", { state: "merged" }),
      pr(8, "fork-child", "two", { headRepo: "fork/project" }),
      pr(9, "one", "bad-parent", { headRepo: "fork/project" }),
    ]);
    const stack = derivePullRequestStack(data, "two");
    expect(stack.parents.map(pr => pr.headRef)).toEqual(["one"]);
    expect(stack.children.map(pr => pr.headRef)).toEqual(["side", "three", "four"]);
    expect(stack.cycle).toBe(false);
    expect(derivePullRequestStack(data, "closed").children).toEqual([]);
    expect(derivePullRequestStack(data, "three").parents.map(pr => pr.headRef)).toEqual(["two", "one"]);
  });

  test("terminates cycles without adding the current PR as its own relative", () => {
    const stack = derivePullRequestStack(ready([pr(1, "a", "c"), pr(2, "b", "a"), pr(3, "c", "b")]), "a");
    expect(stack.parents.map(pr => pr.headRef)).toEqual(["c", "b"]);
    expect(stack.children.map(pr => pr.headRef)).toEqual(["b", "c"]);
    expect(stack.cycle).toBe(true);
    const self = derivePullRequestStack(ready([pr(1, "self", "self")]), "self");
    expect(self).toMatchObject({ parents: [], children: [], cycle: true });
  });
});

describe("lazy bulk GitHub reader", () => {
  test("loads asynchronously and distinguishes open, draft, closed and merged metadata", async () => {
    const nodes = [node(pr(1, "open")), node(pr(2, "draft", "main", { state: "draft", draft: true })),
      node(pr(3, "closed", "main", { state: "closed" })),
      { ...node(pr(4, "merged", "main", { state: "closed" })), mergedAt: "2026-01-01T00:00:00Z" },
      node(pr(5, "deleted", "main", { headRepo: null }))];
    const f = fixture(() => result(page(nodes)));
    expect(f.commands).toEqual([]);
    expect(f.getPullRequestsState("/repo")).toBeUndefined();
    const pending = f.loadPullRequests("/repo");
    expect(f.getPullRequestsState("/repo")).toEqual({ status: "loading" });
    const data = await pending;
    expect(data.status).toBe("ready");
    if (data.status !== "ready") throw new Error("expected ready");
    expect(data.pullRequests.map(pr => pr.state)).toEqual(["open", "draft", "closed", "merged", "open"]);
    expect(data.pullRequests[4]!.headRepo).toBeNull();
    expect(data.coverage).toBe("complete");
    expect(f.getPullRequestsState("/repo")).toEqual(data);
    expect(f.commands[0]).toEqual(["git", "-C", "/repo", "remote", "get-url", "origin"]);
    const cmd = f.commands[1]!;
    expect(cmd.slice(0, 5)).toEqual(["/bin/gh", "api", "graphql", "--hostname", "github.com"]);
    expect(cmd.find(arg => arg.startsWith("query="))).not.toMatch(/\b(title|body|author|comments|mutation)\b/);
  });

  test("follows cursors, stops at three pages, and reports truncation honestly", async () => {
    let calls = 0;
    const f = fixture(() => {
      calls++;
      return result(page([node(pr(calls, `branch-${calls}`))], true, `cursor-${calls}`));
    });
    const data = await f.loadPullRequests("/repo");
    expect(data).toMatchObject({ status: "ready", coverage: "recent" });
    expect(calls).toBe(3);
    expect(f.commands[2]).toContain("cursor=cursor-1");
    expect(f.commands[3]).toContain("cursor=cursor-2");
    if (data.status === "ready") expect(data.pullRequests.map(pr => pr.number)).toEqual([1, 2, 3]);
  });

  test("a later final page reports complete coverage", async () => {
    let calls = 0;
    const f = fixture(() => result(page([node(pr(++calls, `b${calls}`))], calls === 1, calls === 1 ? "next" : null)));
    expect(await f.loadPullRequests("/repo")).toMatchObject({ status: "ready", coverage: "complete" });
    expect(calls).toBe(2);
  });

  test("coalesces concurrent loads across roots and caches by repository with TTL and refresh", async () => {
    let release!: (value: ReturnType<typeof result>) => void;
    const f = fixture(() => new Promise(resolve => { release = resolve; }));
    const first = f.loadPullRequests("/one");
    expect(f.loadPullRequests("/one")).toBe(first);
    const second = f.loadPullRequests("/two");
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    release(result(page([])));
    expect(await second).toEqual(await first);
    expect(f.commands.filter(cmd => cmd[0] !== "git")).toHaveLength(1);
    await f.loadPullRequests("/three");
    expect(f.commands.filter(cmd => cmd[0] !== "git")).toHaveLength(1);
    const refresh = f.loadPullRequests("/one", { refresh: true });
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    release(result(page([])));
    await refresh;
    expect(f.commands.filter(cmd => cmd[0] !== "git")).toHaveLength(2);
    f.advance(101);
    const expired = f.loadPullRequests("/two");
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    release(result(page([])));
    await expired;
    expect(f.commands.filter(cmd => cmd[0] !== "git")).toHaveLength(3);
  });

  test("canceling an active reader kills the subprocess and stops further pages", async () => {
    let killed = 0;
    let launched = 0;
    let release: ((result: { stdout: string; stderr: string; exitCode: number }) => void) | undefined;
    const reader = createPullRequestReader({ which: () => "gh", startCommand: () => {
      launched++;
      if (launched === 1) return { proc: { kill() {} }, promise: Promise.resolve(result("https://github.com/acme/repo.git")) };
      return { proc: { kill: () => { killed++; release?.(result(page([], true, "next"))); } },
        promise: new Promise(resolve => { release = resolve; }) };
    } });
    const pending = reader.loadPullRequests("/repo");
    for (let n = 0; n < 10 && launched < 2; n++) await Promise.resolve();
    reader.cancel();
    expect(await pending).toEqual({ status: "error", reason: "command-failed" });
    expect(killed).toBe(1);
    expect(launched).toBe(2);
  });

  test("missing gh does not launch git or block startup", async () => {
    const reader = createPullRequestReader({ which: () => null, startCommand: () => { throw new Error("must not run"); } });
    expect(await reader.loadPullRequests("/repo")).toEqual({ status: "unavailable", reason: "missing-gh" });
  });

  test("missing/unsupported origin does not query GitHub", async () => {
    for (const origin of [result("", 2), result("https://gitlab.com/team/project")]) {
      const commands: string[][] = [];
      const reader = createPullRequestReader({ which: () => "gh", startCommand: cmd => {
        commands.push(cmd);
        return { proc: { kill: () => {} }, promise: Promise.resolve(origin) };
      } });
      expect(await reader.loadPullRequests("/repo")).toEqual({
        status: "unavailable", reason: origin.exitCode ? "missing-origin" : "unsupported-remote",
      });
      expect(commands).toHaveLength(1);
    }
  });

  test("offline/auth failures expose no raw stderr and are retryable via refresh", async () => {
    let calls = 0;
    const f = fixture(() => ++calls === 1
      ? { ...result("", 1), stderr: "auth/offline error with sensitive text" }
      : result(page([])));
    expect(await f.loadPullRequests("/repo")).toEqual({ status: "error", reason: "command-failed" });
    expect(await f.loadPullRequests("/repo")).toEqual({ status: "error", reason: "command-failed" });
    expect(calls).toBe(1);
    expect(await f.loadPullRequests("/repo", { refresh: true })).toMatchObject({ status: "ready" });
  });

  test("kills a stalled command and returns timeout rather than rejecting", async () => {
    const f = fixture(() => new Promise(() => {}));
    expect(await f.loadPullRequests("/repo")).toEqual({ status: "error", reason: "timeout" });
    expect(f.kills()).toBe(1);
    expect(f.getPullRequestsState("/repo")).toEqual({ status: "error", reason: "timeout" });
  });

  test("timeout cancels a real subprocess through the existing command helper, without network", async () => {
    let command: ReturnType<typeof startTextCommand> | undefined;
    const reader = createPullRequestReader({
      which: () => "gh",
      timeoutMs: 100,
      startCommand: () => {
        command = startTextCommand([process.execPath, "-e", "await Bun.sleep(10000)"]);
        return command;
      },
    });
    expect(await reader.loadPullRequests("/repo")).toEqual({ status: "error", reason: "timeout" });
    expect(command).toBeDefined();
    expect(await command!.proc.exited).not.toBe(0);
  });

  test("one deadline bounds all pages rather than restarting timeout on each page", async () => {
    const f = fixture(() => {
      f.advance(51);
      return result(page([], true, "next"));
    });
    expect(await f.loadPullRequests("/repo")).toEqual({ status: "error", reason: "timeout" });
    expect(f.commands).toHaveLength(2);
  });

  test("rejects malformed responses and cross-repository or unsafe metadata", async () => {
    for (const payload of [
      "not json", JSON.stringify({ errors: [{ message: "sensitive" }] }),
      page([{ ...node(pr(1, "a")), isDraft: "false" }]),
      page([{ ...node(pr(1, "a")), url: "https://evil.test/1" }]),
      page([node(pr(1, "a", "main", { baseRepo: "wrong/repo", url: "https://github.com/wrong/repo/pull/1" }))]),
      page([node(pr(1, "a\x1b[31m"))]), page([], true, null),
    ]) expect(await fixture(() => result(payload)).loadPullRequests("/repo")).toEqual({
      status: "error", reason: "invalid-response",
    });
  });

  test("GraphQL errors on later pages do not masquerade as complete or truncated success", async () => {
    let calls = 0;
    const f = fixture(() => result(++calls === 1 ? page([node(pr(1, "a"))], true, "next") : "{}"));
    expect(await f.loadPullRequests("/repo")).toEqual({ status: "error", reason: "invalid-response" });
  });

  test("spawn errors become terminal error states", async () => {
    const reader = createPullRequestReader({ which: () => "gh", startCommand: () => { throw new Error("ENOENT"); } });
    expect(await reader.loadPullRequests("/repo")).toEqual({ status: "error", reason: "command-failed" });
  });
});
