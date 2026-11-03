#!/usr/bin/env bash
set -euo pipefail

usage() {
  printf 'Usage: bash scripts/install-reporter.sh pi|pax\n'
  printf 'Installs or updates the reporter; run /reload in the desired agents afterward.\n'
}

case "${1:-}" in
  --help|-h) usage; exit 0 ;;
  pi|pax) [ "$#" -eq 1 ] || { usage >&2; exit 2; } ;;
  *) usage >&2; exit 2 ;;
esac

repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
case "$1" in
  pi) runtime_dir="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}" ;;
  pax) runtime_dir="${PAX_RUNTIME_DIR:-${PAX_HOME:-$HOME/.pax}/cache/pi-packages}" ;;
esac
case "$runtime_dir" in
  '~') runtime_dir="$HOME" ;;
  '~/'*) runtime_dir="$HOME/${runtime_dir#\~/}" ;;
esac
dest="$runtime_dir/extensions/twm"

# Do not follow a destination entrypoint/helper symlink into unrelated files.
for target in "$dest" "$dest/index.ts" "$dest/pi-reporter.ts"; do
  if [ -L "$target" ] || { [ -e "$target" ] && [ "$target" != "$dest" ] && [ ! -f "$target" ]; }; then
    printf 'twm: refusing non-regular or symlinked reporter destination: %s\n' "$target" >&2
    exit 1
  fi
done

mkdir -p "$dest"
tmp_dir="$(mktemp -d "$dest/.install.XXXXXX")"
trap 'status=$?; rm -rf -- "$tmp_dir"; if [ "$status" -ne 0 ]; then printf "twm: install incomplete; rerun the same command before /reload.\n" >&2; fi' EXIT
cp "$repo_dir/extensions/pi-reporter.ts" "$tmp_dir/pi-reporter.ts"
cp "$repo_dir/extensions/pi.ts" "$tmp_dir/index.ts"
chmod 644 "$tmp_dir/index.ts" "$tmp_dir/pi-reporter.ts"
# Rename complete files, helper first. No settings edits or runtime reloads.
mv -f "$tmp_dir/pi-reporter.ts" "$dest/pi-reporter.ts"
mv -f "$tmp_dir/index.ts" "$dest/index.ts"
printf 'twm: installed/updated %s reporter at %s\n' "$1" "$dest"
printf 'Next: run /reload in each desired tmux-hosted %s agent.\n' "$1"
printf 'Previews start with new messages; existing history is not read.\n'
