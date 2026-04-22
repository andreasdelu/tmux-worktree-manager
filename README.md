# tmux-worktree-manager

`twm` is a tmux popup for jumping between Git worktrees and opening them in ready-to-use tmux sessions.

It is built for the common flow:
- keep a few repo roots configured
- see linked worktrees across those repos
- hit one key to jump into the right session
- create, close, or remove worktrees without leaving tmux
- customize new-session layout with `~/.config/twm/layout.sh`

## Install with TPM

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

On first launch it installs the `twm` binary if needed.

## First run

Press:

- `prefix + W`

If you have no repo roots configured yet, `twm` opens the add-source flow immediately.

On first boot, `twm` also creates:

- `~/.config/twm/worktree-roots`
- `~/.config/twm/layout.sh`

`layout.sh` is the hook you can edit to customize what a brand-new tmux session looks like when you open a worktree.

Add a repo root such as:

```txt
~/Documents/pax
~/Documents/landfolk
~/.dotfiles
```

Use the actual **git repo root**, not a child directory inside it.

`twm` uses `git worktree list` from each configured repo root and shows linked worktrees from there. The primary checkout is hidden on purpose so the picker stays focused on worktrees.

## Everyday use

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
- You can customize that new-session behavior in `~/.config/twm/layout.sh`.
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

Source validation is strict:
- missing paths are rejected
- duplicates are rejected
- non-repo roots are rejected

## Config

`twm` stores its user config in:

```txt
${XDG_CONFIG_HOME:-$HOME/.config}/twm/
```

On first boot it creates:

- `worktree-roots`
- `layout.sh`

### `worktree-roots`

One repo root per line.

Example:

```txt
parent ~/Documents/landfolk
parent ~/Documents/pax
parent ~/.dotfiles
```

## Layout customization

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

Use `layout.sh` only if you want to customize that behavior further.

## Plugin options

Defaults:

```tmux
set -g @twm-key 'W'
set -g @twm-popup-width '80%'
set -g @twm-popup-height '80%'
set -g @twm-version 'latest'
set -g @twm-install-mode 'auto'
```

### `@twm-key`

The tmux prefix binding for opening `twm`.

Set it to an empty string to disable the default binding.

### `@twm-popup-width` / `@twm-popup-height`

Popup size passed to `tmux display-popup`.

### `@twm-version`

Which GitHub release to install.

Defaults to:

- `latest`

### `@twm-install-mode`

Install behavior for the binary:

- `auto` — try release download first, then local Bun build fallback
- `download` — only try release download
- `build` — only try local Bun build

Most people should leave this at:

- `auto`

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

Release downloads use compressed `.gz` assets.

If you want to force one path while debugging:

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

## Notes for contributors

Current compile flags intentionally include:

- `--compile`
- `--format=esm`
- `--minify`
- `--sourcemap`
- `--bytecode`

Do not remove `--format=esm` while using `--bytecode` with the current Ink / yoga-layout stack.
