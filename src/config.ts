import fs from "node:fs";
import path from "node:path";

const homeDir = process.env.HOME ?? "";
const xdgConfigHome =
  process.env.XDG_CONFIG_HOME ||
  (homeDir
    ? path.join(homeDir, ".config")
    : path.join(process.cwd(), ".config"));

const configDir = path.join(xdgConfigHome, "twm");

const expandHomePath = (value: string) => {
  if (value === "~") {
    return homeDir || value;
  }

  if (value.startsWith("~/")) {
    return homeDir ? path.join(homeDir, value.slice(2)) : value;
  }

  return value;
};

const envBool = (value: string | undefined, fallback = false) => {
  if (!value) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
};

export const sourcesFile = path.join(configDir, "worktree-roots");
export const layoutHookFile = path.join(configDir, "layout.sh");
export const overwatchEnabled = envBool(process.env.TWM_OVERWATCH_ENABLE, false);
export const overwatchDir = path.resolve(
  expandHomePath(process.env.TWM_OVERWATCH_DIR || path.join(homeDir, ".pi", "overwatch")),
);
export const overwatchStaleMs = Number(
  process.env.TWM_OVERWATCH_STALE_MS || process.env.PI_OVERWATCH_STALE_MS || 30_000,
);
export const overwatchRefreshMs = Number(process.env.TWM_OVERWATCH_REFRESH_MS || 3_000);

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
tmux send-keys -t "\$session:1.1" "cd '\$path' && nvim" C-m

# Keep the side pane as a plain shell in the repo.
tmux send-keys -t "\$session:1.2" "cd '\$path'" C-m

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

export const previewDebounceMs = 40;
