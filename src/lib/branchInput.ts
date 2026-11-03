import { runCommand } from "./commands";

export const isValidBranchName = async (branchName: string): Promise<boolean> => {
  // Git expands @{-1} in --branch mode. Inputs must be literal branch names.
  if (!branchName || branchName.includes("@{")) {
    return false;
  }

  return (await runCommand(["git", "check-ref-format", "--branch", branchName])).success;
};

// Linear's copied Git branch already contains the issue ID. No API lookup is
// needed: retain that branch verbatim and suggest a short, editable folder.
// Invalid input stays visible for the action's Git validation.
export const parseBranchInput = (input: string): { branchName: string; worktreeName: string } => {
  const segment = input.split("/").at(-1)!;
  const issue = segment.match(/^([A-Za-z][A-Za-z0-9]*-\d+)(?:-(.+))?$/);
  const suggestion = issue
    ? [issue[1], ...((issue[2] ?? "").split("-").filter(Boolean).slice(0, 4))].join("-")
    : segment;
  return { branchName: input, worktreeName: suggestion.replace(/[^A-Za-z0-9._-]/g, "-") };
};
