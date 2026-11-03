#!/usr/bin/env bash
set -euo pipefail

current_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

# Prefix binding; an empty key disables it.
tmux set-option -goq @twm-key "W"
tmux set-option -goq @twm-popup-width "80%"
tmux set-option -goq @twm-popup-height "80%"
tmux set-option -goq @twm-version "latest"
tmux set-option -goq @twm-install-mode "auto"

twm_key="$(tmux show-option -gqv @twm-key)"
twm_popup_width="$(tmux show-option -gqv @twm-popup-width)"
twm_popup_height="$(tmux show-option -gqv @twm-popup-height)"

if [ -n "$twm_key" ]; then
  printf -v run_script '%q' "$current_dir/scripts/run.sh"
  printf -v popup_width '%q' "$twm_popup_width"
  printf -v popup_height '%q' "$twm_popup_height"
  # run-shell expands formats in the invoking client's context; display-popup
  # does not expand environment values. Preserve origin even if tmux's MRU changes.
  tmux bind-key "$twm_key" run-shell -b \
    "tmux display-popup -c #{q:client_name} -e TWM_ORIGIN_SESSION='#{session_id}' -e TWM_ORIGIN_CLIENT=#{q:client_name} -w $popup_width -h $popup_height -E bash $run_script"
fi
