#!/usr/bin/env bash
set -euo pipefail

# Run inside display-popup. A private server hides helper sessions from the
# worktree server's pickers; one helper per invoking client prevents cross-talk.
repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
: "${TWM_ORIGIN_CLIENT:?popup requires invoking client identity}"
: "${TWM_ORIGIN_SESSION:?popup requires invoking session identity}"
host_socket="$(tmux display-message -p '#{socket_path}')"
helper_socket="${host_socket}.twm"
key="$(printf '%s' "$TWM_ORIGIN_CLIENT" | cksum)"
session="twm-${key%% *}"
helper=(tmux -S "$helper_socket")
created=0

if ! "${helper[@]}" has-session -t "=$session:" 2>/dev/null; then
  printf -v command 'tmux wait-for %q; exec bash %q' "$session-ready" "$repo_dir/scripts/run.sh"
  "${helper[@]}" -f /dev/null new-session -d -s "$session" \
    -e TWM_POPUP=1 -e "TWM_POPUP_SESSION=$session" \
    -e "TWM_HOST_SOCKET=$host_socket" -e "TWM_HOST_TMUX=${TMUX:?}" \
    -e "XDG_CONFIG_HOME=${XDG_CONFIG_HOME:-$HOME/.config}" \
    -e "PATH=$PATH" "$command"
  created=1
  "${helper[@]}" set-option -t "=$session:" status off
fi

# Store only bounded routing metadata, never user messages. Refresh on every
# attach; the long-lived UI reads it before actions rather than trusting env.
"${helper[@]}" set-option -t "=$session:" @twm_origin_client "$TWM_ORIGIN_CLIENT" \; \
  set-option -t "=$session:" @twm_origin_session "$TWM_ORIGIN_SESSION" \; \
  set-option -t "=$session:" @twm_popup_generation "$$-$RANDOM"
if [ "$created" = 1 ]; then "${helper[@]}" wait-for -S "$session-ready"; fi

# Do not leak the helper's TMUX into nested host-session operations.
exec env -u TMUX tmux -S "$helper_socket" attach-session -t "=$session:"
