import { afterEach, beforeEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createItem,
  createItemResult,
  performAction,
  removalBlockedReason,
  suggestedCreateTargetDir,
} from "./actions";
import { isValidBranchName, parseBranchInput } from "./branchInput";
import { defaultSessionNameFor } from "./session";

// Developer machines may wrap Git with slower command-policy checks.
setDefaultTimeout(60_000);

const originalEnv = { ...process.env };
const gitExecutable = Bun.which("git")!;
let root: string;
let repo: string;
let linked: string;
let firstCommit: string;
let selectedCommit: string;

const git = (dir: string, ...args: string[]) => {
  const result = Bun.spawnSync({
    cmd: [gitExecutable, "-C", dir, ...args],
    env: { ...process.env, PATH: originalEnv.PATH },
    stdout: "pipe",
    stderr: "pipe",
  });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return result.stdout.toString().trim();
};

const events = () => fs.readFileSync(path.join(root, "events"), "utf8");

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "twm-actions-")));
  repo = path.join(root, "repo");
  linked = path.join(root, "repo-worktrees", "selected");
  fs.mkdirSync(repo);
  delete process.env.TMUX;
  delete process.env.TWM_ORIGIN_CLIENT;
  process.env.GIT_CONFIG_GLOBAL = path.join(root, "no-global-config");
  process.env.GIT_CONFIG_NOSYSTEM = "1";
  git(repo, "init", "-b", "main");
  git(repo, "config", "user.name", "Test");
  git(repo, "config", "user.email", "test@example.invalid");
  git(repo, "config", "commit.gpgsign", "false");
  git(repo, "config", "core.hooksPath", path.join(root, "no-hooks"));
  fs.writeFileSync(path.join(repo, "tracked"), "first\n");
  git(repo, "add", ".");
  git(repo, "commit", "-m", "first");
  firstCommit = git(repo, "rev-parse", "HEAD");
  git(repo, "worktree", "add", "-b", "selected", linked);
  fs.writeFileSync(path.join(linked, "tracked"), "second\n");
  git(linked, "commit", "-am", "selected head");
  selectedCommit = git(linked, "rev-parse", "HEAD");

  // Only failure injection and tmux are faked; successful Git commands stay real.
  const bin = path.join(root, "bin");
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(root, "events"), "");
  process.env.TWM_TEST_GIT = gitExecutable;
  process.env.TWM_TEST_ORIGINAL_PATH = originalEnv.PATH;
  process.env.TWM_TEST_ROOT = root;
  process.env.TWM_TEST_NAME = defaultSessionNameFor(linked);
  process.env.TWM_TEST_SESSION = "$2";
  process.env.TWM_TEST_CLIENT_SESSION = "$2";
  fs.writeFileSync(path.join(bin, "git"), `#!/bin/bash
printf 'git %s\\n' "$*" >> "$TWM_TEST_ROOT/events"
if [[ "$3" == "$TWM_TEST_EMPTY" ]]; then exit 0; fi
if [[ "$3" == "$TWM_TEST_FAIL" ]]; then
  printf '\\033[31mforced failure\\033[0m\\nwith detail\\007' >&2
  exit 128
fi
if [[ "$3 $4" == 'worktree remove' ]]; then
  if [[ -n "$TWM_TEST_RACE_DIR" ]]; then
    printf dirty > "$TWM_TEST_RACE_DIR/late-file"
  fi
  if [[ -n "$TWM_TEST_REMOVE_FAIL" ]]; then
    printf 'remove refused' >&2
    exit 128
  fi
fi
exec env PATH="$TWM_TEST_ORIGINAL_PATH" "$TWM_TEST_GIT" "$@"
`);
  fs.writeFileSync(path.join(bin, "tmux"), `#!/bin/bash
printf 'tmux %s\\n' "$*" >> "$TWM_TEST_ROOT/events"
case "$1" in
  display-message)
    if [[ -n "$TWM_TEST_TMUX_FAIL" ]]; then printf 'cannot find client' >&2; exit 1; fi
    printf '%s\\n' "$TWM_TEST_SESSION"
    ;;
  list-clients)
    if [[ -n "$TWM_TEST_CLIENT_FAIL" ]]; then printf 'client lookup refused' >&2; exit 1; fi
    printf '%s\\t%s\\n' "$TWM_ORIGIN_CLIENT" "$TWM_TEST_CLIENT_SESSION"
    ;;
  list-sessions)
    if [[ -n "$TWM_TEST_LIST_FAIL" ]]; then printf 'session listing refused' >&2; exit 1; fi
    if [[ -z "$TWM_TEST_NO_SESSION" ]]; then printf '$1\\t%s\\t\\n' "$TWM_TEST_NAME"; fi
    ;;
  new-session) printf 'session creation refused' >&2; exit 1 ;;
  kill-session)
    if [[ -d "$TWM_TEST_ROOT/repo-worktrees/selected" ]]; then
      printf 'session killed before removal' >&2; exit 1
    fi
    if [[ -n "$TWM_TEST_KILL_FAIL" ]]; then printf 'kill refused' >&2; exit 1; fi
    ;;
esac
`);
  fs.chmodSync(path.join(bin, "git"), 0o755);
  fs.chmodSync(path.join(bin, "tmux"), 0o755);
  process.env.PATH = `${bin}:${originalEnv.PATH}`;
});

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  Object.assign(process.env, originalEnv);
  fs.rmSync(root, { recursive: true, force: true });
});

describe("branch input", () => {
  test("preserves a pasted Linear branch and suggests its final segment", () => {
    expect(parseBranchInput("alice/lf-123-fix-calendar")).toEqual({
      branchName: "alice/lf-123-fix-calendar",
      worktreeName: "lf-123-fix-calendar",
    });
    const branch = "andreasdeleuran/lan-18257-add-a-way-for-owners-to-invite-collaborators-in-api";
    expect(parseBranchInput(branch)).toEqual({ branchName: branch, worktreeName: "lan-18257-add-a-way-for" });
    expect(parseBranchInput("alice/LAN-18257")).toEqual({ branchName: "alice/LAN-18257", worktreeName: "LAN-18257" });
    expect(parseBranchInput("feature/team/full-name")).toEqual({ branchName: "feature/team/full-name", worktreeName: "full-name" });
  });

  test("suggests without running Git and preserves invalid pasted input", () => {
    expect(parseBranchInput("bad..branch")).toEqual({ branchName: "bad..branch", worktreeName: "bad..branch" });
    expect(parseBranchInput("  alice/topic\n")).toEqual({ branchName: "  alice/topic\n", worktreeName: "topic-" });
    expect(parseBranchInput("@{-1}").branchName).toBe("@{-1}");
    expect(events()).toBe("");
  });

  test("uses Git ref rules asynchronously and never expands previous-checkout shorthand", async () => {
    git(linked, "checkout", "--detach", "HEAD");
    git(linked, "checkout", "selected");
    for (const value of ["", "@{-1}", "topic@{1}", "bad..name", "topic.lock", "bad name", "-option", "topic\nname", "https://linear.app/team/issue/123"]) {
      expect(await isValidBranchName(value)).toBe(false);
      expect(parseBranchInput(value).branchName).toBe(value);
    }
    expect(await isValidBranchName("alice/lf-123-fix-calendar")).toBe(true);
  });
});

describe("create worktree", () => {
  test("tmux failure preserves the created worktree and cannot authorize auto-open", async () => {
    process.env.TWM_TEST_NO_SESSION = "1";
    const result = await createItemResult(linked, "partial", "partial", undefined, path.dirname(linked), "open");
    expect(result.sessionReady).toBe(false);
    expect(result.message).toContain("Created worktree partial; could not create tmux session");
    expect(git(path.join(path.dirname(linked), "partial"), "branch", "--show-current")).toBe("partial");
    expect(events()).not.toContain("switch-client");
    expect(events()).not.toContain("attach-session");
  });

  test("default creation does not invoke tmux", async () => {
    const result = await createItemResult(linked, "git-only", "git-only");
    expect(result).toEqual({ message: "Created worktree git-only", sessionReady: false });
    expect(events()).not.toContain("tmux ");
  });
  test("defaults new branches to the selected worktree HEAD", async () => {
    const target = suggestedCreateTargetDir(linked, "child");
    expect(await createItem(linked, "child", "alice/new-topic")).toBe("Created worktree child");
    expect(git(target, "rev-parse", "HEAD")).toBe(selectedCommit);
    expect(git(repo, "rev-parse", "HEAD")).toBe(firstCommit);
    expect(git(target, "branch", "--show-current")).toBe("alice/new-topic");
  });

  test("accepts the parent's create root and contains the target within it", async () => {
    const customRoot = path.join(root, "custom-worktrees");
    expect(await createItem(linked, "custom", "custom", undefined, customRoot)).toBe("Created worktree custom");
    expect(git(path.join(customRoot, "custom"), "rev-parse", "HEAD")).toBe(selectedCommit);
    expect(await createItem(linked, "../escape", "escape", undefined, customRoot)).toContain("Invalid worktree folder name");
    expect(fs.existsSync(path.join(root, "escape"))).toBe(false);
  });

  test("resolves an explicit starting ref to a commit, including annotated tags", async () => {
    git(repo, "tag", "-a", "start", firstCommit, "-m", "start tag");
    expect(await createItem(linked, "explicit", "explicit", "start")).toBe("Created worktree explicit");
    expect(git(suggestedCreateTargetDir(linked, "explicit"), "rev-parse", "HEAD")).toBe(firstCommit);
    expect(await createItem(repo, "sha", "sha", selectedCommit)).toBe("Created worktree sha");
    expect(git(suggestedCreateTargetDir(repo, "sha"), "rev-parse", "HEAD")).toBe(selectedCommit);
  });

  test("rejects invalid, option-like, and non-commit starting refs without creating a branch", async () => {
    const blob = git(repo, "rev-parse", "HEAD:tracked");
    for (const ref of ["missing-ref", "--help", "", blob]) {
      expect(await createItem(linked, "bad-base", "bad-base", ref)).toContain("Couldn't resolve starting commit");
      expect(fs.existsSync(suggestedCreateTargetDir(linked, "bad-base"))).toBe(false);
    }
    expect(git(repo, "branch", "--list", "bad-base")).toBe("");
  });

  test("reuses existing branches unchanged and clearly rejects an explicit base", async () => {
    git(repo, "branch", "existing", firstCommit);
    expect(await createItem(linked, "reject", "existing", selectedCommit)).toContain("Branch already exists");
    expect(fs.existsSync(suggestedCreateTargetDir(linked, "reject"))).toBe(false);
    expect(git(repo, "rev-parse", "existing")).toBe(firstCommit);
    expect(await createItem(linked, "existing", "existing")).toBe("Created worktree existing");
    expect(git(suggestedCreateTargetDir(linked, "existing"), "rev-parse", "HEAD")).toBe(firstCommit);
    expect(await createItem(linked, "duplicate", "existing")).toContain("Failed to create worktree");
    expect(git(repo, "rev-parse", "existing")).toBe(firstCommit);
  });

  test("rejects unsafe folder targets and invalid branches before side effects", async () => {
    for (const folder of [".", "..", "", " ", "../escape", "sub/folder", "sub\\folder", "/absolute", "line\nfeed", "nul\0byte", "x'$(touch${IFS}owned)'", "with space", "semicolon;"]) {
      expect(() => suggestedCreateTargetDir(linked, folder)).toThrow();
      expect(await createItem(linked, folder, "safe")).toContain("Invalid worktree folder name");
    }
    expect(git(repo, "branch", "--list", "safe")).toBe("");
    expect(await createItem(linked, "safe", "bad..branch")).toContain("Invalid branch name");
    git(linked, "checkout", "--detach", "HEAD");
    git(linked, "checkout", "selected");
    expect(await createItem(linked, "safe", "@{-1}")).toContain("Invalid branch name");
    expect(fs.existsSync(path.join(root, "escape"))).toBe(false);
  });

  test("does not follow an existing target symlink outside the root", async () => {
    const outside = path.join(root, "outside");
    fs.mkdirSync(outside);
    fs.symlinkSync(outside, path.join(path.dirname(linked), "alias"));
    expect(await createItem(linked, "alias", "alias")).toContain("Target already exists");
    expect(fs.readdirSync(outside)).toEqual([]);
    expect(git(repo, "branch", "--list", "alias")).toBe("");
  });

  test("rejects existing folders and Git inspection failures", async () => {
    expect(await createItem(linked, "selected", "new")).toContain("Target already exists");
    process.env.TWM_TEST_FAIL = "show-ref";
    expect(await createItem(linked, "new", "new")).toContain("Couldn't check existing branch");
    expect(fs.existsSync(suggestedCreateTargetDir(linked, "new"))).toBe(false);
  });
});

describe("close session", () => {
  test("fails closed on failed or empty current-session lookup", async () => {
    process.env.TMUX = "test-client";
    process.env.TWM_TEST_TMUX_FAIL = "1";
    expect(await performAction("kill", linked)).toContain("cannot find client");
    delete process.env.TWM_TEST_TMUX_FAIL;
    process.env.TWM_TEST_SESSION = "";
    expect(await performAction("kill", linked)).toContain("Closing blocked");
    expect(events()).not.toContain("kill-session");
  });

  test("never closes the current tmux session", async () => {
    process.env.TMUX = "test-client";
    process.env.TWM_TEST_SESSION = "$1";
    expect(await performAction("kill", linked)).toBe("Won't close the current tmux session");
    expect(events()).not.toContain("kill-session");
  });
});

test("retained popup protects both launch origin and the exact current client session", async () => {
  process.env.TMUX = "test-client";
  process.env.TWM_ORIGIN_CLIENT = "/dev/fixture";
  process.env.TWM_TEST_SESSION = "$3";
  process.env.TWM_TEST_CLIENT_SESSION = "$1";
  expect(await removalBlockedReason(linked)).toContain("currently inside");
  expect(await performAction("kill", linked)).toContain("Won't close");
  expect(events()).not.toContain("kill-session");
  process.env.TWM_TEST_SESSION = "$1";
  process.env.TWM_TEST_CLIENT_SESSION = "$2";
  expect(await removalBlockedReason(linked)).toContain("currently inside");
  process.env.TWM_TEST_SESSION = "$3";
  process.env.TWM_TEST_CLIENT_FAIL = "1";
  expect(await removalBlockedReason(linked)).toContain("blocked");
  expect(await performAction("kill", linked)).toContain("Closing blocked");
});

describe("remove worktree", () => {
  test("protects the primary checkout", async () => {
    expect(await removalBlockedReason(repo)).toContain("primary checkout");
    expect(await performAction("remove", repo)).toContain("primary checkout");
    expect(fs.existsSync(repo)).toBe(true);
    const alias = path.join(root, "primary-alias");
    fs.symlinkSync(repo, alias);
    expect(await performAction("remove", alias)).toContain("primary checkout");
    expect(events()).not.toContain("worktree remove");
    expect(events()).not.toContain("kill-session");
  });

  test("blocks dirty and untracked worktrees even with status config hiding untracked files", async () => {
    fs.writeFileSync(path.join(linked, "tracked"), "dirty\n");
    expect(await removalBlockedReason(linked)).toContain("uncommitted changes");
    git(linked, "restore", "tracked");
    git(repo, "config", "status.showUntrackedFiles", "no");
    fs.writeFileSync(path.join(linked, "untracked"), "untracked\n");
    expect(await performAction("remove", linked)).toContain("uncommitted changes");
    expect(fs.existsSync(linked)).toBe(true);
    expect(events()).not.toContain("kill-session");
  });

  test("rechecks after confirmation", async () => {
    expect(await removalBlockedReason(linked)).toBeNull();
    fs.writeFileSync(path.join(linked, "after-check"), "new\n");
    expect(await performAction("remove", linked)).toContain("uncommitted changes");
    expect(fs.existsSync(linked)).toBe(true);
  });

  test("fails closed when Git path or status inspection fails, with sanitized detail", async () => {
    for (const command of ["rev-parse", "status"]) {
      process.env.TWM_TEST_FAIL = command;
      const reason = await removalBlockedReason(linked);
      expect(reason).toContain("forced failure with detail");
      expect(reason).not.toMatch(/[\x00-\x1f\x7f]/);
      expect(await performAction("remove", linked)).toContain("blocked");
      expect(fs.existsSync(linked)).toBe(true);
    }
    expect(events()).not.toContain("worktree remove");
    expect(events()).not.toContain("kill-session");
    delete process.env.TWM_TEST_FAIL;
    process.env.TWM_TEST_EMPTY = "rev-parse";
    expect(await performAction("remove", linked)).toContain("Couldn't inspect Git worktree");
    expect(fs.existsSync(linked)).toBe(true);
  });

  test("fails closed on current tmux session lookup failure or empty output", async () => {
    process.env.TMUX = "test-client";
    process.env.TWM_TEST_TMUX_FAIL = "1";
    expect(await performAction("remove", linked)).toContain("cannot find client");
    delete process.env.TWM_TEST_TMUX_FAIL;
    process.env.TWM_TEST_SESSION = "";
    expect(await performAction("remove", linked)).toContain("Couldn't identify current tmux session");
    expect(fs.existsSync(linked)).toBe(true);
    expect(events()).not.toContain("worktree remove");
    expect(events()).not.toContain("kill-session");
  });

  test("failed session association lookup cannot authorize Git removal or session closure", async () => {
    process.env.TWM_TEST_LIST_FAIL = "1";
    expect(await removalBlockedReason(linked)).toContain("session listing refused");
    expect(await performAction("remove", linked)).toContain("blocked");
    expect(await performAction("kill", linked)).toContain("Closing blocked");
    expect(fs.existsSync(linked)).toBe(true);
    expect(events()).not.toContain("worktree remove");
    expect(events()).not.toContain("kill-session");
  });

  test("protects the current tmux session", async () => {
    process.env.TMUX = "test-client";
    process.env.TWM_TEST_SESSION = "$1";
    expect(await performAction("remove", linked)).toContain("currently inside");
    expect(fs.existsSync(linked)).toBe(true);
  });

  test("does not kill a session when Git removal fails", async () => {
    process.env.TWM_TEST_REMOVE_FAIL = "1";
    expect(await performAction("remove", linked)).toContain("remove refused");
    expect(fs.existsSync(linked)).toBe(true);
    expect(events()).not.toContain("kill-session");
  });

  test("nonforce removal preserves changes made after execution checks, and the session", async () => {
    process.env.TWM_TEST_RACE_DIR = linked;
    expect(await performAction("remove", linked)).toContain("Failed to remove worktree");
    expect(fs.readFileSync(path.join(linked, "late-file"), "utf8")).toBe("dirty");
    expect(events()).not.toContain("kill-session");
    expect(events()).not.toContain("--force");
  });

  test("removes a clean worktree before closing its session", async () => {
    expect(await performAction("remove", linked)).toBe("Removed worktree selected");
    expect(fs.existsSync(linked)).toBe(false);
    const log = events();
    expect(log.indexOf("worktree remove")).toBeLessThan(log.indexOf("kill-session"));
    expect(log).not.toContain("display-message");
  });

  test("reports a tmux cleanup failure without claiming Git removal failed", async () => {
    process.env.TWM_TEST_KILL_FAIL = "1";
    expect(await performAction("remove", linked)).toBe("Removed worktree selected; failed to close tmux session: kill refused");
    expect(fs.existsSync(linked)).toBe(false);
  });
});
