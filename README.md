# tmux-worktree-manager

```text
████████╗██╗    ██╗███╗   ███╗
╚══██╔══╝██║    ██║████╗ ████║
   ██║   ██║ █╗ ██║██╔████╔██║
   ██║   ██║███╗██║██║╚██╔╝██║
   ██║   ╚███╔███╔╝██║ ╚═╝ ██║
   ╚═╝    ╚══╝╚══╝ ╚═╝     ╚═╝
```

`twm` is a tmux popup for browsing Git worktrees and jumping into tmux sessions.

<img width="49%" alt="Screenshot 2026-04-24 at 09 16 25" src="https://github.com/user-attachments/assets/859c1a37-09f9-40dd-a90f-bc70e6d9f599" />
<img width="49%" alt="Screenshot 2026-04-24 at 09 16 32" src="https://github.com/user-attachments/assets/fc879b9b-4f20-4a0a-a5e1-a8400b0f3038" />


## Install

Add the plugin to `.tmux.conf`:

```tmux
set -g @plugin 'tmux-plugins/tpm'
set -g @plugin 'andreasdelu/tmux-worktree-manager'
```

Reload tmux, then install plugins with TPM (`prefix + I`) or run:

```sh
tmux source-file ~/.tmux.conf
~/.tmux/plugins/tpm/bin/install_plugins
```

Open `twm` with:

```txt
prefix + W
```

## First run

If you have no sources yet, `twm` opens the add-source flow.

Add a Git repo root, for example:

```txt
~/code/my-repo
```

Use the repo root itself, not a subdirectory.

`twm` stores config in:

```txt
${XDG_CONFIG_HOME:-$HOME/.config}/twm/
```

Files created on first run:

- `worktree-roots`
- `layout.sh`

## What it does

- shows the primary checkout and linked worktrees from your configured repo roots
- opens the matching tmux session if it exists
- creates a tmux session if it does not
- uses repo-scoped tmux session names (`landfolk` for the primary checkout, `landfolk__checkout-flow--8f3a` for linked worktrees)
- can create, close, refresh, and remove worktrees from the UI

## Keys

### Worktrees

- `j` / `k` or arrows — move
- `enter` — open worktree session
- `c` — create worktree
- `d` — close tmux session
- `x` — remove worktree
  - blocked for the primary checkout
- `r` — refresh
- `tab` — switch to sources
- `q` or `esc` — quit

### Sources

- `j` / `k` or arrows — move
- `a` — add repo root
- `x` — remove repo root
- `tab` — switch back
- `q` or `esc` — quit

## Pi Overwatch

Optional.

<img width="50%" alt="Screenshot 2026-04-24 at 09 16 04" src="https://github.com/user-attachments/assets/5b87dfd9-af0c-48ae-a6d7-cef8170f9d70" />


Enable it in tmux:

```tmux
set -g @twm-overwatch-enable 'on'
set -g @twm-overwatch-dir '~/.pi/overwatch'
```

`twm` reads agent state from:

```txt
~/.pi/overwatch/agents/*.json
```

Install Pi Overwatch separately:

```sh
pi install npm:pi-overwatch
```

Repo:

- https://github.com/denismrvoljak/pi-overwatch

Matching order:

1. exact worktree path
2. exact tmux session name

When enabled, `twm` shows:

- a small Pi badge in the worktree list
- a `Pi Overwatch` box in the details pane

## Config

### `worktree-roots`

One repo root per line.

Example:

```txt
parent ~/Documents/landfolk
parent ~/Documents/pax
parent ~/.dotfiles
```

### `layout.sh`

Run when `twm` creates a new tmux session.

Environment variables:

- `TWM_SESSION_NAME`
- `TWM_WORKTREE_PATH`
- `TWM_REPO_ROOT`
- `TWM_REPO_NAME`
- `TWM_WORKTREE_NAME`
- `TWM_BRANCH`
- `TWM_SESSION_IS_NEW=1`

### tmux options

```tmux
set -g @twm-key 'W'
set -g @twm-popup-width '80%'
set -g @twm-popup-height '80%'
set -g @twm-version 'latest'
set -g @twm-install-mode 'auto'
set -g @twm-overwatch-enable 'off'
set -g @twm-overwatch-dir '~/.pi/overwatch'
```

- `@twm-key` — tmux binding
- `@twm-popup-width` / `@twm-popup-height` — popup size
- `@twm-version` — release version to install
- `@twm-install-mode` — `auto`, `download`, or `build`
- `@twm-overwatch-enable` — `on` or `off`
- `@twm-overwatch-dir` — Pi Overwatch state directory

## Notes

- removing the primary checkout is blocked
- removing a dirty worktree is blocked
- removing the current session's worktree is blocked
- source paths must exist, be unique, and be Git repo roots

## Development

```sh
bun install
bun run dev
bun run build
bun run compile
```
