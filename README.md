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
- uses repo-scoped default tmux session names (`landfolk` for the primary checkout, `landfolk__checkout-flow--8f3a` for linked worktrees); assigned or renamed sessions can keep custom names
- can create, close, refresh, and remove worktrees from the UI
- validates sources and loads repositories asynchronously with bounded concurrency (three at a time), preserving configured order without freezing the popup
- matches agent panes using session indexes and per-scan canonical paths, avoiding repeated filesystem lookups while observing path changes on the next poll
- refreshes only the affected repository after creation/removal
- shows GitHub PR states and head/base stack relationships without blocking startup on network access
- shows the current `twm` version in the status line
- checks GitHub tags once per day and appends a passive update hint when a newer version is available

## Keys

### Worktrees

- `j` / `k` or arrows — move
- `h` / `l` — jump to the previous/next source group, without wrapping
- `enter` — open worktree session; twm stays open by default
- `a` — assign an existing unassigned tmux session to the selected checkout/worktree (`j/k` to pick, Enter to assign, Esc to cancel)
  - available when the checkout has no matching session; sessions matching other configured checkouts are excluded
  - links the checkout to the session without renaming it, preserving windows, panes and running processes; does not change existing pane directories, switch clients or run `layout.sh`
  - subsequent open/close/remove actions treat it as this checkout's session
- `c` — create worktree
  - accepts a short worktree name (letters, digits, dots, underscores and hyphens), optional branch name, and optional base ref
  - paste a copied Linear Git branch into the empty name field: the full branch is preserved; the editable folder suggestion uses the issue ID plus its first four slug words
  - example: `andreasdeleuran/lan-18257-add-a-way-for-owners-to-invite-collaborators-in-api` → folder `lan-18257-add-a-way-for`; no Linear API, token, or issue lookup is used
  - `tab` / Shift+Tab switches fields; leaving branch blank uses the worktree name as the branch
  - `space` toggles **Create tmux session** and **Open after creation** when focused; both default off for each new dialog
  - session creation runs the global layout hook but leaves the current client and popup alone; opening implies creating a session and respects the close-on-open preference
  - turning session creation off also turns opening off; a tmux failure leaves the created worktree intact and reports the partial result
  - text fields support left/right cursor movement, Home/End (or Ctrl+A/Ctrl+E), insertion, Backspace and forward Delete; Unicode graphemes stay intact and long fields scroll to keep the cursor visible
  - leaving base blank starts a new branch from the selected worktree's HEAD; an explicit ref supports stacked branches
  - an existing branch is opened as-is; setting a base for it is rejected to avoid silently resetting it
- Page Up / Page Down — scroll details without changing the selected worktree
- `d` — close tmux session
- `x` — remove worktree
  - blocked for the primary checkout
  - after confirmation, shows `Removing…` inline; additional removals show `Queued…` and run one at a time, with fresh safety checks before each starts
  - other worktrees can be opened while removals run; twm temporarily stays open even with close-on-open enabled so the queue can finish. Worktrees queued for removal cannot be opened or queued twice
  - create/close/assign/source changes, refresh and quitting (including Ctrl+C) wait for the queue to drain; confirmation dialogs can still be cancelled
  - a failed reconciliation skips pending removals and fences actions until `r` obtains a fresh list
- `r` — refresh
- `tab` — switch to sources
- `q` or `esc` — quit

### Sources

- `j` / `k` or arrows — move
- `a` — add repo root
- `x` — remove repo root
- `tab` — switch back
- `q` or `esc` — quit

## Native agent activity

Detection alone needs no agent configuration: `twm` recognizes a `pi`/`pax` foreground command or Node/Bun with a Pi-style `π` title. Without a live reporter it shows **detected**, not invented working/waiting state. Window activity is not used, because another pane's output says nothing about the agent.

For real runtime state, explicitly install the optional first-party reporter from this checkout (or your TPM checkout):

```sh
bash scripts/install-reporter.sh pi   # plain Pi
bash scripts/install-reporter.sh pax  # Pax instead
# Then /reload in each desired tmux-hosted agent.
```

Run the same command after updating twm to refresh both reporter files. Files are replaced individually, not as an atomic pair; if installation fails or is interrupted, rerun it successfully before `/reload` or starting a new agent. Pi uses `${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/extensions/twm`; Pax uses `${PAX_RUNTIME_DIR:-${PAX_HOME:-$HOME/.pax}/cache/pi-packages}/extensions/twm`. Choose the runtime explicitly so an inherited Pi directory from Pax cannot accidentally choose the wrong destination. The script needs only Bash and standard filesystem tools, installs no dependencies, changes no settings, and never reloads running agents. Copies are independent of the checkout; tests/helpers are not exposed as extension entrypoints. Remove that `twm` directory and `/reload` to uninstall. Avoid loading a second copy via `--extension` or package settings.

For a one-off Pi session without installing:

```sh
pi --extension /path/to/tmux-worktree-manager/extensions/pi.ts
```

The reporter emits owner PID, heartbeat, typed state, bounded tool names/count and run timestamps into pane-local `@twm_pi`. Tool names describe operations, not arguments or the task's meaning. The separate bordered Agent status panel below Details identifies each pane, then shows **You** with the latest interactive prompt and **Agent** with live activity while work is running, or the latest completed reply once settled. Previews are limited to 320 characters each and one visible line; live activity, needs-input, failure, stopped and unknown/unavailable status take precedence over an older reply. Empty rows explain whether no message has been observed, live reporting is unavailable, or an old reporter needs updating and `/reload`; this distinguishes missing data from clipped content. Only public events observed after loading are used, not transcript/history reads, thinking, images/attachments, tool arguments/results, argv, raw live titles or pane scraping. Terminal controls are stripped; secrets are **not** automatically redacted. No Overwatch or SDK dependency is required, and the extension is never installed automatically.

`/twm-report off` disables the entire reporter for this runtime, unsubscribes observers and clears activity/messages from tmux. `/twm-report on` restarts with empty previews, without history backfill. There is no separate message switch. Reporting starts enabled on extension load; disabling is not persisted across `/reload` or process restart.

Encoded previews live in `@twm_pi_messages`. Encoding protects command framing, not confidentiality. twm fetches previews only for the selected worktree, never writes them to the startup cache, and hides them after 15 seconds without fresh matching ownership. Shutdown, session switching and explicit disable clear owned options; after a crash stale encoded text may remain in tmux until the pane closes or a replacement reporter clears/overwrites it.

The sidebar keeps the `π` agent marker with icons and colors only, with status symbols directly adjacent (`π✓`, `π?`): an animated cyan icon for busy, yellow `?` for input, green `✓` for finished, red `!` for failure, and gray `■` for stopped/exited. Idle/detected uses gray `π` alone. Busy agents animate in the Agent status panel too. The agent panel shows **working**, **thinking**, **responding**, concrete tool activity and elapsed run time. Settled runs show a green **Finished** checkmark, **Run failed**, or **Stopped** until the next run; Finished means the runtime settled, not that the requested task succeeded. Idle means no run has been observed since the reporter loaded. Needs input refers to explicit extension dialogs, not a natural-language question in an assistant response. Parent status describes that pane's Pi runtime. For Pax's `pax_subagent`, the reporter also listens through Pi's general `pi.events` bus to `pax:subagent-activity`: active children keep the sidebar icon busy even after the parent finishes. In the Agent status panel, a dedicated animated cyan **Subagents working** row sits indented below **Agent**, only while children are active. Inactive children add no row and do not imply success; uncertain observations remain explicit on the Agent line as **Subagent status unknown**. Each group's height includes the extra row while active; expired, malformed or mismatched child observations show unknown instead of a Finished checkmark. The event supplies only aggregate active/inactive, not counts, individual states or success/failure. Loading or enabling the reporter with `pax_subagent` available starts at `children unknown` until an activity event arrives, because Pax exposes no initial snapshot query. Inactive children do not prove task success. Other subagent providers are not yet tracked; Pi has no universal child-status contract. Child activity uses owner-bound, expiring `@twm_pi_children` metadata, cleared along with reporting on shutdown/off. Existing v1 reporters keep coarse status until you update their copied files and reload. Missing/malformed reports, failed runtime observations, and reports at least 15 seconds old show **status unavailable**; an expired report never claims idle. Detection remains heuristic, and no match does not prove absence.

While the popup is open, tmux metadata is polled every three seconds. Panes match by twm session identity first, then by current directory within a worktree. Closing the popup stops its polling, not the agent's reporter.

## Performance checks

```sh
bun run scripts/benchmark.ts     # discovery time and subprocess counts
bun run scripts/performance.ts   # repeated local discovery/poll timings and synthetic ownership scale probes
bun run compile
bun run scripts/startup-smoke.ts # cached first paint and safety with deliberately delayed Git
bun run scripts/smoke.ts         # compiled popup behavior, including assignment and session preservation
```

Timing scripts use the tmux server's PATH when available, matching the popup rather than coding-harness Git wrappers. Scale probes are synthetic, not normal-workload claims. The performance script polls metadata only, without fetching message previews.

## Cached startup

After a successful discovery, twm saves a private, versioned `startup-cache.json` beside its config files. On reopening it paints the previous worktree list and visited Git/PR details before discovery completes, then shows **Syncing…** while refreshing in the background. Navigation works immediately; open/create/close/remove wait for the first fresh discovery, so cached paths and flags never authorize an action. Fresh Git/tmux safety checks still run at execution time. Cached Git/PR details stay explicitly labelled until their own refresh finishes.

The snapshot never stores live agent/session state or message previews. Changed `worktree-roots`, invalid/oversized snapshots and snapshots older than seven days are ignored; missing/corrupt caches use normal startup. Cache writes are atomic, best-effort and require no daemon or database. Delete the file to discard display history. This speeds warm first paint, not the Bun/Ink runtime startup itself.

## PR and merge visibility

Install and authenticate GitHub CLI (`gh auth login`) for GitHub.com repositories whose `origin` identifies the PR base repository. PR reads run in the background and are cached for 60 seconds. `r` retries/refetches for the selected repository.

- The worktree list uses right-aligned indicators: `π` for agents, a colored `●` for PR state and `T` for an existing tmux session. PR numbers appear only in Details to keep the list compact.
- PR numbers in Details and circles in the list carry status color instead of a status word: purple for merged, amber/yellow for open, grey for draft, red for closed. Amber means open, not a verified review decision; review requests/approvals are not queried.
- Details show the compact worktree header, PR stack and Git overview. Agent activity/messages occupy their own bordered panel below Details, keeping live context visible while scrolling Git/PR information. Labels align and clean state appears once. Parent/current/child PR head/base relationships appear inline, without repeating the current PR. A matched PR without relatives still shows its head/base row. There is no separate stack overlay or stack shortcut.
- Details scroll with Page Up / Page Down for long stacks; the Agent status panel stays fixed. Each agent has its own pane-identified prompt/activity-or-reply group, separated by one blank row. The panel grows to fit those groups while retaining a minimum Details area. When multiple agents cannot fit, it shows complete groups plus a remaining-agent count instead of silently clipping another agent; enlarge the terminal to see more. A single agent's rows may still clip at minimum terminal height. Very short stacked layouts omit panel titles to keep both panels usable. The worktree panel uses 38% of split-view width to leave room for shortened issue names and activity badges.
- Closed/merged PRs do not become active stack dependencies. Fork branch-name collisions are excluded.
- History is bounded to 300 recently updated PRs; missing matches in truncated results mean **no PR in recent history**, not proof that no PR exists.
- Offline, authentication and unsupported-remote failures show **unknown**, never “no PR”.
- Git ancestry is not displayed. GitHub PR state describes the PR, not containment in local Git history.

## Config

### Session names and assignments

Session names are defaults, not worktree identity. `a` links an existing unassigned session without renaming it. You can rename a linked or newly-created twm session with `tmux rename-session -t "$SESSION_ID" 'my session'`; twm follows the association on its next poll or refresh. Details shows the actual session name.

The association is an encoded canonical worktree path in the session-local `@twm_worktree` option. It survives popup restarts and session renames, but ends when the tmux session is destroyed. No extra config mapping is written. Opening after the session is destroyed uses the default name again. Untagged sessions still match the default naming convention; tag them by assigning first if you want renames tracked. Explicit associations take precedence, and a session tagged for another checkout is not silently reused. Duplicate explicit associations are an error.

### `preferences.json`

Opening a worktree keeps twm open by default. There is no UI toggle. To opt into closing after opening, set `{"closeOnOpen":true}` in the config directory's `preferences.json`. Existing explicit settings are respected; missing, invalid or non-boolean values keep twm open. Use `false` or remove the key to restore the default. Restart twm after editing.

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

`twm` starts that session as a single default tmux window in the worktree. The generated `layout.sh` is a starter example you can edit or replace if you want to split panes, rename windows, open an editor, or add more windows.

Environment variables:

- `TWM_SESSION_NAME`
- `TWM_WORKTREE_PATH`
- `TWM_REPO_ROOT`
- `TWM_REPO_NAME`
- `TWM_WORKTREE_NAME`
- `TWM_BRANCH`
- `TWM_SESSION_IS_NEW=1`

Panes already start in the worktree via tmux's `-c` flag. Avoid sending shell commands with interpolated paths; custom hooks must quote shell input safely.

### tmux options

```tmux
set -g @twm-key 'W'
set -g @twm-popup-width '80%'
set -g @twm-popup-height '80%'
set -g @twm-version 'latest'
set -g @twm-install-mode 'auto'
```

- `@twm-key` — tmux binding
- `@twm-popup-width` / `@twm-popup-height` — popup size
- `@twm-version` — release version to install
- `@twm-install-mode` — `auto`, `download`, or `build`

## Notes

- removing the primary checkout is blocked
- removing a dirty worktree is blocked
- removing the current session's worktree is blocked; the TPM binding captures the originating session and client. Both the launch-origin session and that exact client's current session are protected, including after opening with close-on-open off
- tmux session lookup uses exact names, never prefix matching
- failed safety checks block removal; failed Git removal retains the tmux session
- missing registered worktrees are shown as unavailable and cannot be opened/created from/removed; twm does not auto-prune
- source paths must exist, be unique, and be Git repo roots
- dialog inputs support paste
- update checks are cached in `${XDG_CONFIG_HOME:-$HOME/.config}/twm/update-check.json`
- worktree details are loaded after a short navigation idle delay to keep scrolling responsive

## UI components

`twm` uses Ink primitives and local components. The shortcut footer adapts InkUI's MIT-licensed `KeyHint` source, using twm's theme and wrapping between complete hints so keys stay beside their actions. No InkUI runtime package is installed; input and focus remain owned by twm. Text inputs and the loading spinner also adapt InkUI source. Input dispatch stays in twm so cursor editing cannot bypass dialog focus, paste handling or mutation safety. The confirmation action row borrows InkUI's presentation, but retains the responsive Ink border and requires explicit `y`; Enter cancels rather than selecting a destructive default. Attribution is in `vendor/inkui/LICENSE`.

## Development

```sh
bun install
bun run dev
bun run build
bun run compile
bun test
bun scripts/smoke.ts
bun scripts/benchmark.ts [path-to-baseline-checkout]
```

The smoke script uses disposable repositories and an isolated tmux server. The benchmark measures source validation/list readiness and refresh, not the entire popup or checkout I/O.
