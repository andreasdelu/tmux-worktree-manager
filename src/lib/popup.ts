// The UI lives on a private tmux server; worktree operations always use the
// invoking server. Never infer either server from tmux's most-recent client.
export const hostCommand = (cmd: string[]): string[] =>
  cmd[0] === "tmux" && process.env.TWM_HOST_SOCKET
    ? ["tmux", "-S", process.env.TWM_HOST_SOCKET, ...cmd.slice(1)] : cmd;

export const isPersistentPopup = () => process.env.TWM_POPUP === "1";

export const refreshPopupOrigin = (): string => {
  if (!isPersistentPopup()) return "";
  const target = process.env.TWM_POPUP_SESSION;
  if (!target || !/^twm-\d+$/.test(target)) throw new Error("Missing popup session identity");
  const result = Bun.spawnSync({ cmd: ["tmux", "display-message", "-p", "-t", `=${target}:`,
    "#{@twm_origin_client}\t#{@twm_origin_session}\t#{@twm_popup_generation}"], env: process.env, stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error("Could not read popup launch context");
  const [client, session, generation] = result.stdout.toString().replace(/\n$/, "").split("\t");
  if (!client || !session || !/^\$\d+$/.test(session) || !generation) throw new Error("Invalid popup launch context");
  process.env.TWM_ORIGIN_CLIENT = client;
  process.env.TWM_ORIGIN_SESSION = session;
  return generation;
};

export const detachPopup = () => {
  refreshPopupOrigin();
  const result = Bun.spawnSync({ cmd: ["tmux", "detach-client", "-s", `=${process.env.TWM_POPUP_SESSION}:`], env: process.env, stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error("Could not detach popup");
};
