#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
binary="$repo_dir/dist/twm"
install_script="$repo_dir/scripts/install.sh"

if [ -n "${TMUX:-}" ]; then
  export TWM_VERSION="$(tmux show-option -gqv @twm-version || true)"
  export TWM_INSTALL_MODE="$(tmux show-option -gqv @twm-install-mode || true)"
fi

: "${TWM_VERSION:=latest}"
: "${TWM_INSTALL_MODE:=auto}"

if [ ! -x "$binary" ]; then
  "$install_script"
fi

if [ ! -x "$binary" ]; then
  message='twm: binary missing after install attempt'
  if [ -n "${TMUX:-}" ]; then
    tmux display-message "$message"
  else
    printf '%s\n' "$message" >&2
  fi
  exit 1
fi

exec "$binary" "$@"
