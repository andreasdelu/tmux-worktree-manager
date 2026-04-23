# tmux-worktree-manager

```text
████████╗██╗    ██╗███╗   ███╗
╚══██╔══╝██║    ██║████╗ ████║
   ██║   ██║ █╗ ██║██╔████╔██║
   ██║   ██║███╗██║██║╚██╔╝██║
   ██║   ╚███╔███╔╝██║ ╚═╝ ██║
   ╚═╝    ╚══╝╚══╝ ╚═╝     ╚═╝
```

`twm` is a tmux popup for browsing Git worktrees and jumping into ready-to-use tmux sessions.

## Features

- tmux popup UI
- multi-repo worktree browser
- create / close / remove worktrees from the picker
- auto-create or attach tmux sessions per worktree
- global `layout.sh` hook for new sessions only
- optional Pi Overwatch integration for agent visibility

## Install

### Via TPM

Add the plugin to your tmux config:

```tmux
set -g @plugin 'tmux-plugins/tpm'
set -g @plugin 'andreasdelu/tmux-worktree-manager'
```

Reload tmux, then install plugins with TPM (`prefix + I`) or run:

```sh
tmux source-file ~/.tmux.conf
~/.tmux/plugins/tpm/bin/install_plugins
```

By default, `twm` binds:

- `prefix + W`

On first launch, `twm` installs the binary if needed.

After that, launching `twm` also refreshes the installed binary automatically when:

- the plugin checkout changed
- `@twm-version` changed
- `@twm-install-mode` changed

## Quick start

1. Press `prefix + W`
2. If you have no repo roots configured yet, `twm` opens the add-source flow immediately
3. Add a repo root such as:

```txt
~/twm
```

Use the actual **git repo root**, not a child directory inside it.

On first boot, `twm` creates:

- `~/.config/twm/worktree-roots`
- `~/.config/twm/layout.sh`

`twm` uses `git worktree list` from each configured repo root and shows linked worktrees from there.
The primary checkout is hidden.

If a repo has no linked worktrees yet, `twm` shows an empty state.

## Usage

### Worktrees view

Keys:

- `j` / `k` or arrow keys — move
- `enter` — open or attach to the matching tmux session
- `c` — create a new worktree
- `d` — close the matching tmux session
- `x` — remove the linked worktree
- `r` — refresh details
- `tab` — switch to Sources view
- `q` or `esc` — quit

Behavior:

- Opening a worktree switches to its tmux session if it already exists.
- If no session exists yet, `twm` creates one and applies the default layout.
- When creating the first worktree from a repo root, `twm` uses a sibling container by default, like `../repo-worktrees/<branch>`.
- If you want a different location, create one worktree there manually first. After that, `twm` inherits that directory for later worktrees from the same repo.
- Removing a worktree is guarded:
  - it will not remove the primary checkout
  - it will not remove a dirty worktree
  - it will not remove the current session's worktree

### Sources view

Keys:

- `j` / `k` or arrow keys — move
- `a` — add repo root
- `x` — remove repo root
- `tab` — switch back to Worktrees view
- `q` or `esc` — quit

Source validation:

- missing paths are rejected
- duplicates are rejected
- non-repo roots are rejected

## Pi Overwatch integration

`twm` can optionally show Pi agent activity for the selected worktree.

When enabled, it adds:

- a lightweight Pi badge in the worktree list
- a dedicated **Pi Overwatch** box in the details column

### What it reads

`twm` reads Pi Overwatch agent state from:

```txt
~/.pi/overwatch/agents/*.json
```

or from whatever path you set via `@twm-overwatch-dir`.

This only does anything if your Pi sessions are already writing state there via `pi-overwatch`.

Install that separately, for example:

```bash
pi install npm:pi-overwatch
```

### Matching rules

Matching:

1. exact worktree cwd match
2. exact tmux session name match

If multiple agents match, `twm` shows them as peer instances in the Pi Overwatch table and only pushes offline ones to the bottom in gray.

### Sidebar badge behavior

The worktree list badge:

- `π` + spinner when any matched online agent is working
- `π✓` when all matched online agents are done
- plain `π` when matched online agents exist but are neither all-done nor actively working
- no badge when only offline agents are present

### Refresh behavior

When enabled, `twm` refreshes Pi Overwatch badges and details at a low frequency while the Worktrees view is open.

## Configuration

`twm` stores its user config in:

```txt
${XDG_CONFIG_HOME:-$HOME/.config}/twm/
```

### User config files

#### `worktree-roots`

One repo root per line.

Example:

```txt
parent ~/Documents/landfolk
parent ~/Documents/pax
parent ~/.dotfiles
```

#### `layout.sh`

When `twm` creates a **brand-new tmux session**, it can run:

```txt
${XDG_CONFIG_HOME:-$HOME/.config}/twm/layout.sh
```

This hook runs only for new sessions, not when re-opening an existing one.

Available environment variables:

- `TWM_SESSION_NAME`
- `TWM_WORKTREE_PATH`
- `TWM_REPO_ROOT`
- `TWM_REPO_NAME`
- `TWM_WORKTREE_NAME`
- `TWM_BRANCH`
- `TWM_SESSION_IS_NEW=1`

The built-in default layout already gives you:

- a `code` window
- a split main layout
- a `shell` window

Edit `layout.sh` if you want to customize that behavior.

### tmux plugin options

Defaults:

```tmux
set -g @twm-key 'W'
set -g @twm-popup-width '80%'
set -g @twm-popup-height '80%'
set -g @twm-version 'latest'
set -g @twm-install-mode 'auto'
set -g @twm-overwatch-enable 'off'
set -g @twm-overwatch-dir '~/.pi/overwatch'
```

#### `@twm-key`

The tmux prefix binding for opening `twm`.

Set it to an empty string to disable the default binding.

#### `@twm-popup-width` / `@twm-popup-height`

Popup size passed to `tmux display-popup`.

#### `@twm-version`

Which GitHub release to install.

Defaults to:

- `latest`

If you change this value, the next `prefix + W` refreshes the installed binary.

#### `@twm-install-mode`

Install behavior for the binary:

- `auto` — try release download first, then local Bun build fallback
- `download` — only try release download
- `build` — only try local Bun build

Most people should leave this at:

- `auto`

#### `@twm-overwatch-enable`

Opt-in Pi Overwatch integration.

Values:

- `off` — default
- `on` — enable Pi badge + Pi Overwatch details box

#### `@twm-overwatch-dir`

Where `twm` looks for Pi Overwatch state files.

Defaults to:

- `~/.pi/overwatch`

Example:

```tmux
set -g @twm-overwatch-enable 'on'
set -g @twm-overwatch-dir '~/.pi/overwatch'
```

## Troubleshooting

### Nothing opens when I press `prefix + W`

Check that:

- TPM is installed
- the plugin is listed in `.tmux.conf`
- plugins were installed with `prefix + I`
- tmux config was reloaded

### Adding a source says it's not a git repo root

Add the top-level repo directory itself, not a nested folder inside it.

### The binary install fails

`auto` mode downloads a compressed release binary first. If that fails and Bun is available, it falls back to a local build.

If you just updated the plugin or changed `@twm-version`, `prefix + W` tries to refresh the installed binary automatically.

Release downloads use compressed `.gz` assets.

To force one path while debugging:

```tmux
set -g @twm-install-mode 'download'
```

or:

```tmux
set -g @twm-install-mode 'build'
```

## Local development

```sh
bun install
bun run dev
```

Build the JS bundle:

```sh
bun run build
```

Build the compiled binary:

```sh
bun run compile
```

Outputs:

- `dist/twm.js`
- `dist/twm`

