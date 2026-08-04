#!/bin/sh
set -eu

CDN_BASE="${STARRY_CLI_CDN_BASE:-https://cdn1.platform-test-cdn.allstarunion.com/static/upload}"
CDN_BASE="${CDN_BASE%/}"
BIN_NAME="starry-cli"

err() {
  printf '%s\n' "$*" >&2
}

detect_os() {
  case "$(uname -s)" in
    Darwin) printf 'darwin' ;;
    Linux) printf 'linux' ;;
    *)
      err "error: unsupported OS: $(uname -s)"
      exit 1
      ;;
  esac
}

detect_arch() {
  case "$(uname -m)" in
    x86_64|amd64) printf 'amd64' ;;
    arm64|aarch64) printf 'arm64' ;;
    *)
      err "error: unsupported architecture: $(uname -m)"
      exit 1
      ;;
  esac
}

default_bin_dir() {
  _os="$1"
  if [ -z "${HOME:-}" ]; then
    err "error: HOME is not set; set STARRY_CLI_BIN_DIR to choose an install directory"
    exit 1
  fi

  case "$_os" in
    darwin) printf '%s/.local/bin' "$HOME" ;;
    linux) printf '%s/.local/bin' "$HOME" ;;
  esac
}

download_to() {
  _download_url="$1"
  _download_dest="$2"

  if command -v curl >/dev/null 2>&1; then
    curl --fail --silent --show-error --location --retry 3 --retry-delay 2 -o "$_download_dest" "$_download_url"
    return
  fi
  if command -v wget >/dev/null 2>&1; then
    wget --tries=3 --waitretry=2 -qO "$_download_dest" "$_download_url"
    return
  fi

  err "error: neither curl nor wget is available; cannot download starry-cli"
  exit 1
}

dir_name() {
  _path="$1"
  case "$_path" in
    */*) printf '%s\n' "${_path%/*}" ;;
    *) printf '.\n' ;;
  esac
}

artifact_url() {
  _os="$1"
  _arch="$2"
  _artifact="$BIN_NAME-$_os-$_arch"

  if [ -n "${STARRY_CLI_CACHE_BUSTER:-}" ]; then
    printf '%s/%s?v=%s\n' "$CDN_BASE" "$_artifact" "$STARRY_CLI_CACHE_BUSTER"
    return
  fi

  _ts="$(date +%s)"
  printf '%s/%s?t=%s\n' "$CDN_BASE" "$_artifact" "$_ts"
}

path_contains_dir() {
  _want="$1"
  _old_ifs="$IFS"
  IFS=:
  for _dir in ${PATH:-}; do
    IFS="$_old_ifs"
    if [ "$_dir" = "$_want" ]; then
      return 0
    fi
    IFS=:
  done
  IFS="$_old_ifs"
  return 1
}

print_path_hint() {
  _dir="$1"
  if path_contains_dir "$_dir"; then
    return
  fi

  err ""
  err "提示：$_dir 当前不在 PATH 中。"
  err "如果希望在终端里直接执行 starry-cli，请把下面这一行加入你的 shell 配置："
  err "  export PATH=\"$_dir:\$PATH\""
}

install_binary() {
  _dest="$1"
  _os="$2"
  _arch="$3"
  _action="$4"
  _dest_dir="$(dir_name "$_dest")"

  mkdir -p "$_dest_dir"
  TMP_FILE="$(mktemp "${TMPDIR:-/tmp}/starry-cli.XXXXXX")"
  trap 'rm -f "$TMP_FILE"' EXIT

  URL="$(artifact_url "$_os" "$_arch")"
  err "${_action}：${URL}"
  download_to "$URL" "$TMP_FILE"
  if [ ! -s "$TMP_FILE" ]; then
    err "错误：下载的 starry-cli 文件为空：$URL"
    exit 1
  fi
  chmod 0755 "$TMP_FILE" || {
    print_permission_fix "$TMP_FILE"
    exit 126
  }
  mv "$TMP_FILE" "$_dest"
  trap - EXIT
  err "starry-cli 已安装到：$_dest"
  print_path_hint "$_dest_dir"
}

print_permission_fix() {
  _path="$1"
  err "错误：starry-cli 没有可执行权限：$_path"
  err ""
  err "请复制执行下面的命令后重试："
  err "  chmod +x \"$_path\""
  err ""
  err "如果上面的命令提示 Permission denied，请复制执行这个需要 sudo 的命令："
  err "  sudo chmod +x \"$_path\""
}

print_quarantine_fix() {
  _path="$1"
  err "错误：macOS 阻止了 starry-cli 运行，文件带有 quarantine 隔离属性：$_path"
  err "这通常会表现为系统提示无法验证开发者、签名或安全性。"
  err ""
  err "请复制执行下面的命令后重试："
  err "  xattr -d com.apple.quarantine \"$_path\""
  err ""
  err "如果上面的命令提示 Permission denied，请复制执行这个需要 sudo 的命令："
  err "  sudo xattr -d com.apple.quarantine \"$_path\""
  err ""
  err "如果仍然提示签名或 Gatekeeper 问题，可复制执行下面的诊断命令查看原因："
  err "  spctl --assess --type execute --verbose \"$_path\""
  err "  codesign --verify --deep --strict --verbose=2 \"$_path\""
}

ensure_runnable() {
  _path="$1"
  _os="$2"

  if [ ! -f "$_path" ]; then
    return 1
  fi

  if [ "$_os" = "darwin" ] && command -v xattr >/dev/null 2>&1; then
    if xattr -p com.apple.quarantine "$_path" >/dev/null 2>&1; then
      print_quarantine_fix "$_path"
      exit 126
    fi
  fi

  if [ ! -x "$_path" ]; then
    print_permission_fix "$_path"
    exit 126
  fi

  return 0
}

OS="$(detect_os)"
ARCH="$(detect_arch)"
BIN_DIR="${STARRY_CLI_BIN_DIR:-$(default_bin_dir "$OS")}"
BIN_PATH="$BIN_DIR/$BIN_NAME"

if [ "${1:-}" = "upgrade" ]; then
  TARGET_PATH="$BIN_PATH"
  if [ -z "${STARRY_CLI_BIN_DIR:-}" ] && command -v "$BIN_NAME" >/dev/null 2>&1; then
    PATH_BIN="$(command -v "$BIN_NAME")"
    TARGET_PATH="$PATH_BIN"
  fi
  install_binary "$TARGET_PATH" "$OS" "$ARCH" "正在升级 starry-cli"
  exit 0
fi

if command -v "$BIN_NAME" >/dev/null 2>&1; then
  PATH_BIN="$(command -v "$BIN_NAME")"
  if ensure_runnable "$PATH_BIN" "$OS"; then
    exec "$PATH_BIN" "$@"
  fi
fi

if ! ensure_runnable "$BIN_PATH" "$OS"; then
  install_binary "$BIN_PATH" "$OS" "$ARCH" "未找到 starry-cli，正在下载"
fi

ensure_runnable "$BIN_PATH" "$OS"
exec "$BIN_PATH" "$@"
