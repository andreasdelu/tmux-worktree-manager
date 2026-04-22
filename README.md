# tmux-worktree-manager

A tmux-first Git worktree launcher and session bootstrapper.

## Install

```sh
bun install
```

## Run

```sh
twm
```

For local development from a checkout:

```sh
bun run src/index.tsx
```

## Build

Bundle to JS:

```sh
bun run build
```

Compile a standalone binary:

```sh
bun run compile
```

This writes:

- `dist/twm.js`
- `dist/twm`

## Config

`twm` stores its user config in:

- `${XDG_CONFIG_HOME:-$HOME/.config}/twm/`

On first run, `twm` auto-creates this directory with starter defaults if it doesn't exist:

- `${XDG_CONFIG_HOME:-$HOME/.config}/twm/worktree-roots`
- `${XDG_CONFIG_HOME:-$HOME/.config}/twm/layout.sh`

Edit those files to taste.

Example `worktree-roots`:

```txt
parent ~/Documents/landfolk
parent ~/Documents/pax
parent ~/.dotfiles
```

## tmux integration

Example tmux popup binding:

```tmux
bind W display-popup -w 80% -h 80% -E "twm"
```

## Layout customization

On **new session creation only**, `twm` will run an optional global hook at:

- `${XDG_CONFIG_HOME:-$HOME/.config}/twm/layout.sh`

That hook receives:

- `TWM_SESSION_NAME`
- `TWM_WORKTREE_PATH`
- `TWM_REPO_ROOT`
- `TWM_REPO_NAME`
- `TWM_WORKTREE_NAME`
- `TWM_BRANCH`
- `TWM_SESSION_IS_NEW=1`

This is intentionally a **global user hook**, not a repo-local script. Re-opening an existing session does not re-run layout customization.

A starter hook is created automatically at:

- `${XDG_CONFIG_HOME:-$HOME/.config}/twm/layout.sh`
