#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
binary="$repo_dir/dist/twm"
stamp_file="$repo_dir/dist/.install-stamp"
install_script="$repo_dir/scripts/install.sh"

if [ -n "${TMUX:-}" ]; then
  export TWM_VERSION="$(tmux show-option -gqv @twm-version || true)"
  export TWM_INSTALL_MODE="$(tmux show-option -gqv @twm-install-mode || true)"
fi

: "${TWM_VERSION:=latest}"
: "${TWM_INSTALL_MODE:=auto}"

plugin_revision() {
  if git -C "$repo_dir" rev-parse --verify HEAD >/dev/null 2>&1; then
    git -C "$repo_dir" rev-parse --verify HEAD
  else
    printf 'unknown\n'
  fi
}

desired_install_stamp() {
  printf 'version=%s\nmode=%s\nplugin_rev=%s\n' \
    "$TWM_VERSION" \
    "$TWM_INSTALL_MODE" \
    "$(plugin_revision)"
}

installed_stamp_matches() {
  [ -f "$stamp_file" ] && [ "$(cat "$stamp_file")" = "$(desired_install_stamp)" ]
}

if [ ! -x "$binary" ]; then
  "$install_script"
elif ! installed_stamp_matches; then
  TWM_FORCE_INSTALL=1 "$install_script"
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
