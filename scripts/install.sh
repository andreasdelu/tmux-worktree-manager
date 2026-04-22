#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
binary="$repo_dir/dist/twm"
release_repo="${TWM_RELEASE_REPO:-andreasdelu/tmux-worktree-manager}"
version="${TWM_VERSION:-latest}"
install_mode="${TWM_INSTALL_MODE:-auto}"

if [ -x "$binary" ]; then
  exit 0
fi

platform() {
  case "$(uname -s)" in
    Darwin) printf 'darwin' ;;
    Linux) printf 'linux' ;;
    *) return 1 ;;
  esac
}

arch() {
  case "$(uname -m)" in
    arm64|aarch64) printf 'arm64' ;;
    x86_64|amd64) printf 'x64' ;;
    *) return 1 ;;
  esac
}

download_binary() {
  local os cpu asset url tmp

  os="$(platform)" || {
    printf 'twm: unsupported platform for binary download\n' >&2
    return 1
  }

  cpu="$(arch)" || {
    printf 'twm: unsupported architecture for binary download\n' >&2
    return 1
  }

  if ! command -v curl >/dev/null 2>&1; then
    printf 'twm: curl is required for release-binary download\n' >&2
    return 1
  fi

  asset="twm-${os}-${cpu}"
  if [ "$version" = "latest" ]; then
    url="https://github.com/${release_repo}/releases/latest/download/${asset}"
  else
    url="https://github.com/${release_repo}/releases/download/${version}/${asset}"
  fi

  mkdir -p "$repo_dir/dist"
  tmp="$(mktemp "${TMPDIR:-/tmp}/twm-download.XXXXXX")"

  printf 'twm: downloading %s\n' "$url" >&2
  if ! curl -fsSL "$url" -o "$tmp"; then
    rm -f "$tmp"
    return 1
  fi

  chmod +x "$tmp"
  mv "$tmp" "$binary"
}

build_binary() {
  if ! command -v bun >/dev/null 2>&1; then
    printf 'twm: bun is required for local build fallback\n' >&2
    return 1
  fi

  cd "$repo_dir"

  if [ ! -d node_modules ]; then
    bun install
  fi

  bun run compile
}

case "$install_mode" in
  download)
    download_binary
    ;;
  build)
    build_binary
    ;;
  auto)
    if ! download_binary; then
      printf 'twm: release download failed, trying local build fallback\n' >&2
      build_binary
    fi
    ;;
  *)
    printf 'twm: invalid install mode: %s\n' "$install_mode" >&2
    printf 'twm: expected one of: auto, download, build\n' >&2
    exit 1
    ;;
esac

if [ ! -x "$binary" ]; then
  printf 'twm: install finished without a runnable binary\n' >&2
  exit 1
fi
