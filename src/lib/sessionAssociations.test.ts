import { expect, test } from "bun:test";
import { associatedSessionName, parseSessionRecords, worktreeKey } from "./sessionAssociations";

test("explicit worktree associations take precedence without stealing another checkout's session", () => {
  const first = { id: "$1", name: "review.with spaces", worktree: worktreeKey("/repo/a") };
  const second = { id: "$2", name: "default-a", worktree: "" };
  expect(associatedSessionName("/repo/a", "default-a", [first, second])).toBe(first.name);
  expect(associatedSessionName("/repo/b", "default-b", [first, second])).toBe("default-b");
  expect(() => associatedSessionName("/repo/b", first.name, [first])).toThrow("another checkout");
  expect(() => associatedSessionName("/repo/a", "default-a", [first, { ...first, id: "$3", name: "other" }])).toThrow("Multiple");
  expect(parseSessionRecords(`$1\treview.with spaces\t${first.worktree}\n$2\tdefault-a\t\n`)).toEqual([first, second]);
  expect(parseSessionRecords("$3\tbad\u001bname\t\n$4\tname\tbad value\n")).toEqual([]);
});
