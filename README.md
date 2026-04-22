# tmux-worktree-manager

A tmux-first Git worktree launcher and session bootstrapper.

## What it does

`twm` lets you:
- browse Git worktrees from configured repo roots
- open a worktree into a tmux session
- create a new worktree
- close the matching tmux session
- remove a clean linked worktree

## TPM install

Add the plugin to your tmux config:

```tmux
set -g @plugin 'andreasdelu/tmux-worktree-manager'
```

Then reload tmux / install via TPM.

Current TPM flow:
- `plugin.tmux` is the tmux entrypoint
- `scripts/run.sh` launches the binary
- `scripts/install.sh` installs the binary if missing

Current install behavior:
- `auto` mode tries a GitHub release binary first
- if that fails, it falls back to local build when Bun is available
- intended long-term path: release binaries for end users, Bun only for contributors

Release binaries are published by the tag-driven GitHub Actions workflow in:
- `.github/workflows/release.yml`

Push a tag like `v0.1.0` to build and upload release assets.

### Plugin options

Defaults:
- `@twm-key` = `W`
- `@twm-popup-width` = `80%`
- `@twm-popup-height` = `80%`
- `@twm-version` = `latest`
- `@twm-install-mode` = `auto`

`@twm-install-mode` values:
- `auto` — try release download, then local build fallback
- `download` — only try release download
- `build` — only try local build with Bun

Example:

```tmux
set -g @twm-key 'W'
set -g @twm-popup-width '80%'
set -g @twm-popup-height '80%'
set -g @twm-version 'latest'
set -g @twm-install-mode 'auto'
```

Set `@twm-key` to an empty string to disable the default binding.

## Local dev

```sh
bun install
bun run dev
```

Build JS bundle:

```sh
bun run build
```

Build compiled binary:

```sh
bun run compile
```

Outputs:
- `dist/twm.js`
- `dist/twm`

## Config

Config dir:

- `${XDG_CONFIG_HOME:-$HOME/.config}/twm/`

Files:
- `${XDG_CONFIG_HOME:-$HOME/.config}/twm/worktree-roots`
- `${XDG_CONFIG_HOME:-$HOME/.config}/twm/layout.sh`

On first boot, `twm` creates the config dir and starter files if they are missing.

If no valid repo roots exist, `twm` opens the add-source flow immediately.

### `worktree-roots`

One repo root per line.

Example:

```txt
parent ~/Documents/landfolk
parent ~/Documents/pax
parent ~/.dotfiles
```

## Layout customization

On **new session creation only**, `twm` runs an optional global hook at:

- `${XDG_CONFIG_HOME:-$HOME/.config}/twm/layout.sh`

Hook env:
- `TWM_SESSION_NAME`
- `TWM_WORKTREE_PATH`
- `TWM_REPO_ROOT`
- `TWM_REPO_NAME`
- `TWM_WORKTREE_NAME`
- `TWM_BRANCH`
- `TWM_SESSION_IS_NEW=1`

Rules:
- global hook only
- no repo-local execution
- no rerun when re-opening an existing session

## Release asset naming

Current install script expects release assets named like:
- `twm-darwin-arm64`
- `twm-darwin-x64`
- `twm-linux-arm64`
- `twm-linux-x64`

## Compile note

Current compile flags intentionally include:
- `--compile`
- `--format=esm`
- `--minify`
- `--sourcemap`
- `--bytecode`

Do not remove `--format=esm` while using `--bytecode` with the current Ink / yoga stack.
