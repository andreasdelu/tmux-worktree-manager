import fs from "node:fs";
import path from "node:path";

const homeDir = process.env.HOME ?? "";
const xdgConfigHome =
  process.env.XDG_CONFIG_HOME ||
  (homeDir
    ? path.join(homeDir, ".config")
    : path.join(process.cwd(), ".config"));

const configDir = path.join(xdgConfigHome, "twm");

export const sourcesFile = path.join(configDir, "worktree-roots");
export const layoutHookFile = path.join(configDir, "layout.sh");

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
# The built-in default layout already created:
#   - window 1: code   (two panes, main-vertical)
#   - window 2: shell
#
# Edit this file however you like.

session="\$TWM_SESSION_NAME"
path="\$TWM_WORKTREE_PATH"

# Open the editor in the main pane.
tmux send-keys -t "\$session:1.1" "cd '\$path' && nvim" C-m

# Keep the side pane as a plain shell in the repo.
tmux send-keys -t "\$session:1.2" "cd '\$path'" C-m

# Start the second window in the repo too.
tmux send-keys -t "\$session:2" "cd '\$path'" C-m

# Example: add a third window for tests.
# tmux new-window -t "\$session:3" -n tests -c "\$path"
# tmux send-keys -t "\$session:3" "cd '\$path' && bun test --watch" C-m

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

export const previewDebounceMs = 40;
