# AGENTS.md

Read this file first.

Work style: direct; minimal tokens; no filler.

## Agent Protocol
- Keep changes small and reviewable.
- Prefer root-cause fixes over patches.
- If behavior changes, update `README.md` in the same change.
- If runtime/config behavior changes, verify it for real.
- Don't guess. Read the code, then act.

## What this repo is

`twm` is a tmux-first Git worktree launcher and session bootstrapper.

Current shape:
- Bun + Ink terminal UI
- compiled binary target: `dist/twm`
- user config in `~/.config/twm/`
- tmux popup / TPM plugin direction

## Stable runtime surface
- CLI/binary: `twm`
- Config dir: `${XDG_CONFIG_HOME:-$HOME/.config}/twm`
- Config files:
  - `worktree-roots`
  - `layout.sh`

Do not casually rename these.

## Product guardrails
- No legacy fallback paths.
- No repo-local executable hooks.
- No layout DSL.
- Layout customization is a **global user hook** only.
- Only apply layout customization on **new session creation**.
- Re-opening an existing session must not stomp user state.

## First-boot behavior
On first boot, the app should ensure `~/.config/twm/` exists and write starter defaults if files are missing.

Expected files:
- `~/.config/twm/worktree-roots`
- `~/.config/twm/layout.sh`

If no valid sources exist, push the user straight into adding one.

## Build / run
From repo root:

```sh
bun install
bun run dev
bun run build
bun run compile
```

Compiled binary:
- `dist/twm`

Compile flags intentionally include:
- `--compile`
- `--format=esm`
- `--minify`
- `--sourcemap`
- `--bytecode`

Do not remove `--format=esm` while using `--bytecode` with the current Ink / yoga stack.

## Code guidance
Prefer:
- clearer startup behavior
- safer tmux/git handling
- better first-run UX
- TPM/plugin readiness
- simpler boundaries

Avoid:
- abstraction for its own sake
- speculative config systems
- plugin architecture inside the app
- speculative cross-platform work unless actually needed

## Validation
Before claiming a change works, prefer real checks:
- compile the binary
- run the binary
- if tmux integration changed, do a popup smoke test
- if first-run behavior changed, test with an empty `XDG_CONFIG_HOME`
- if layout/session behavior changed, verify new-session vs existing-session behavior

## Git
- Safe by default: `git status`, `git diff`, `git log`
- Don't rewrite history unless explicitly asked.
- Don't delete or rename unexpected files without intent.
- Keep the repo extraction boundary clean: dotfiles are a consumer, this repo is the product.

## Packaging direction
Target direction is TPM-friendly installation.

Bias toward:
- predictable scripts
- stable CLI/config names
- minimal tmux-facing integration glue
- a clean install/update story

## Docs
Keep docs concise and operational.
Don't write philosophy when a command or rule will do.
