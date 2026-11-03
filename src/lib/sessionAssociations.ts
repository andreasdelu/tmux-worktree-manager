import fs from "node:fs";
import path from "node:path";

// Session-owned metadata survives popup restarts and tmux renames, but cannot
// accidentally bind a newly-created session that reuses an old session's name.
// Encode paths so tabs/newlines cannot break tmux's tab-separated snapshot.
export const worktreeKey = (dir: string): string => {
  let root = path.resolve(dir);
  try { root = fs.realpathSync(root); } catch { /* Missing worktrees still have an identity. */ }
  return Buffer.from(root).toString("base64url");
};
export type SessionRecord = { id: string; name: string; worktree: string };
export const sessionListFormat = "#{session_id}\t#{session_name}\t#{@twm_worktree}";
export const parseSessionRecords = (output: string): SessionRecord[] => output.split("\n").flatMap(line => {
  const fields = line.split("\t");
  if (fields.length !== 3) return [];
  const [id, name, worktree] = fields as [string, string, string];
  if (!/^\$\d+$/.test(id) || !name || /[\p{Cc}\p{Cf}]/u.test(name) || !/^[A-Za-z0-9_-]*$/.test(worktree)) return [];
  return [{ id, name, worktree }];
});
export const associatedSessionName = (dir: string, defaultName: string, sessions: SessionRecord[]): string => {
  const key = worktreeKey(dir);
  const matches = sessions.filter(session => session.worktree === key);
  if (matches.length > 1) throw new Error("Multiple tmux sessions are assigned to this checkout");
  if (matches[0]) return matches[0].name;
  const collision = sessions.find(session => session.name === defaultName && session.worktree && session.worktree !== key);
  if (collision) throw new Error(`Tmux session ${defaultName} is assigned to another checkout`);
  return defaultName;
};
