#!/usr/bin/env bash
# Bootstrap a per-user QuotaHush installation from GitHub.
set -euo pipefail

REPOSITORY="Wenress/QuotaHush"
REF="${QUOTAHUSH_REF:-main}"
DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
INSTALL_ROOT="$DATA_HOME/quotahush"
APP_DIR="$INSTALL_ROOT/app"

for command in curl tar python3 systemctl; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Required command not found: $command" >&2
    exit 1
  fi
done

if ! python3 -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 11) else 1)'; then
  echo "QuotaHush requires Python 3.11 or newer." >&2
  exit 1
fi

case "$REF" in
  main) ARCHIVE_URL="https://github.com/$REPOSITORY/archive/refs/heads/main.tar.gz" ;;
  v[0-9]*) ARCHIVE_URL="https://github.com/$REPOSITORY/archive/refs/tags/$REF.tar.gz" ;;
  *)
    echo "QUOTAHUSH_REF must be 'main' or a version tag such as 'v0.1.0'." >&2
    exit 1
    ;;
esac

TEMP_DIR="$(mktemp -d)"
cleanup() { rm -rf "$TEMP_DIR"; }
trap cleanup EXIT

echo "Downloading QuotaHush $REF..."
curl --proto '=https' --tlsv1.2 -fsSL "$ARCHIVE_URL" -o "$TEMP_DIR/quotahush.tar.gz"
mkdir -p "$TEMP_DIR/source"
tar -xzf "$TEMP_DIR/quotahush.tar.gz" -C "$TEMP_DIR/source" --strip-components=1

systemctl --user disable --now quotahush-server 2>/dev/null || true
mkdir -p "$INSTALL_ROOT"
rm -rf "$TEMP_DIR/app"
mv "$TEMP_DIR/source" "$TEMP_DIR/app"
rm -rf "$APP_DIR"
mv "$TEMP_DIR/app" "$APP_DIR"

bash "$APP_DIR/server/install_linux.sh"

echo
echo "QuotaHush was installed in $APP_DIR"
echo "Configuration: ${XDG_CONFIG_HOME:-$HOME/.config}/quotahush/.var.env"
