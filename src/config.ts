import fs from "node:fs";
import path from "node:path";

const homeDir = process.env.HOME ?? "";
const xdgConfigHome =
  process.env.XDG_CONFIG_HOME ||
  (homeDir
    ? path.join(homeDir, ".config")
    : path.join(process.cwd(), ".config"));

export const configDir = path.join(xdgConfigHome, "twm");

export const sourcesFile = path.join(configDir, "worktree-roots");
export const layoutHookFile = path.join(configDir, "layout.sh");
export const updateCheckFile = path.join(configDir, "update-check.json");
export const liveRefreshMs = 3_000;

export const sourcesFileHeader = `# One repo root per line.
# Missing directories are ignored.
# Lines starting with # are comments.
#
# Managed by twm.
`;

const defaultLayout = `#!/usr/bin/env bash
set -euo pipefail

# Starter layout hook for twm.
#
# This runs only when twm creates a brand-new tmux session.
# The built-in default layout creates a single default tmux window in the worktree.
# This file is where you take over from there.
#
# Edit or replace this however you like.

session="\$TWM_SESSION_NAME"
path="\$TWM_WORKTREE_PATH"

# Rename the first window and split it into editor + shell.
tmux rename-window -t "\$session:1" code
tmux split-window -h -t "\$session:1" -c "\$path"
tmux select-layout -t "\$session:1" main-vertical

# Open the editor in the main pane.
tmux send-keys -t "\$session:1.1" "nvim" C-m

# The side pane already starts in the repo via tmux's -c flag.
# Do not interpolate paths into commands typed into a shell.

# Add a second shell window.
tmux new-window -t "\$session:2" -n shell -c "\$path"

# Land back in the editor.
tmux select-window -t "\$session:1"
tmux select-pane -t "\$session:1.1"
`;

export const ensureConfigDefaults = () => {
  fs.mkdirSync(configDir, { recursive: true });

  if (!fs.existsSync(sourcesFile)) {
    fs.writeFileSync(sourcesFile, sourcesFileHeader, "utf8");
  }

  if (!fs.existsSync(layoutHookFile)) {
    fs.writeFileSync(layoutHookFile, defaultLayout, "utf8");
    fs.chmodSync(layoutHookFile, 0o755);
  }
};

export const loadingFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
export const loadingFrameIntervalMs = 120;

export const previewDebounceMs = 140;
