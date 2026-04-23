#!/usr/bin/env bash
set -euo pipefail

current_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

# Defaults
# - key is a tmux prefix binding, not a raw keypress
# - set @twm-key to an empty string to disable the default binding
# - install mode: auto | download | build

tmux set-option -gq @twm-key "W"
tmux set-option -gq @twm-popup-width "80%"
tmux set-option -gq @twm-popup-height "80%"
tmux set-option -gq @twm-version "latest"
tmux set-option -gq @twm-install-mode "auto"
tmux set-option -gq @twm-overwatch-enable "off"
tmux set-option -gq @twm-overwatch-dir "~/.pi/overwatch"

twm_key="$(tmux show-option -gqv @twm-key)"
twm_popup_width="$(tmux show-option -gqv @twm-popup-width)"
twm_popup_height="$(tmux show-option -gqv @twm-popup-height)"

if [ -n "$twm_key" ]; then
  tmux bind-key "$twm_key" display-popup \
    -w "$twm_popup_width" \
    -h "$twm_popup_height" \
    -E "$current_dir/scripts/run.sh"
fi
