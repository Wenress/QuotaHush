#!/usr/bin/env bash
# Bootstrap a per-user QuotaHush installation from GitHub.
set -euo pipefail

REPOSITORY="Wenress/QuotaHush"
REF="${QUOTAHUSH_REF:-latest}"
DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
INSTALL_ROOT="$DATA_HOME/quotahush"
APP_DIR="$INSTALL_ROOT/app"
CONFIG_FILE="${XDG_CONFIG_HOME:-$HOME/.config}/quotahush/.var.env"

for command in curl tar python3 systemctl sha256sum; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Required command not found: $command" >&2
    exit 1
  fi
done

if ! python3 -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 11) else 1)'; then
  echo "QuotaHush requires Python 3.11 or newer." >&2
  exit 1
fi

if [ "${QUOTAHUSH_SCHEDULED_UPDATE:-0}" = "1" ] && [ -f "$CONFIG_FILE" ]; then
  AUTO_UPDATE="$(sed -n 's/^[[:space:]]*QUOTAHUSH_AUTO_UPDATE[[:space:]]*=[[:space:]]*//p' "$CONFIG_FILE" | tail -n 1 | tr '[:upper:]' '[:lower:]' | tr -d '\r\"' | xargs)"
  case "$AUTO_UPDATE" in
    0|false|no|off|disabled)
      echo "QuotaHush automatic updates are disabled in $CONFIG_FILE"
      exit 0
      ;;
  esac
fi

if [ "$REF" = "latest" ]; then
  RELEASE_URL="$(curl --proto '=https' --tlsv1.2 -fsSL -o /dev/null -w '%{url_effective}' "https://github.com/$REPOSITORY/releases/latest")"
  REF="${RELEASE_URL##*/}"
fi

case "$REF" in
  v[0-9]*.[0-9]*.[0-9]*) ;;
  *)
    echo "QUOTAHUSH_REF must be 'latest' or a stable version tag such as 'v0.1.4'." >&2
    exit 1
    ;;
esac

VERSION="${REF#v}"
if ! printf '%s' "$VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "Refusing non-stable release tag: $REF" >&2
  exit 1
fi

if [ "${QUOTAHUSH_FORCE_INSTALL:-0}" != "1" ] && [ -f "$APP_DIR/VERSION" ] && [ "$(tr -d '\r\n' < "$APP_DIR/VERSION")" = "$VERSION" ]; then
  echo "QuotaHush $VERSION is already installed."
  exit 0
fi

ARCHIVE_NAME="quotahush-linux-$VERSION.tar.gz"
RELEASE_BASE="https://github.com/$REPOSITORY/releases/download/$REF"
ARCHIVE_URL="$RELEASE_BASE/$ARCHIVE_NAME"
CHECKSUMS_URL="$RELEASE_BASE/SHA256SUMS.txt"

TEMP_DIR="$(mktemp -d)"
cleanup() { rm -rf "$TEMP_DIR"; }
trap cleanup EXIT

echo "Downloading QuotaHush $REF..."
curl --proto '=https' --tlsv1.2 -fsSL "$ARCHIVE_URL" -o "$TEMP_DIR/$ARCHIVE_NAME"
curl --proto '=https' --tlsv1.2 -fsSL "$CHECKSUMS_URL" -o "$TEMP_DIR/SHA256SUMS.txt"

EXPECTED_HASH="$(awk -v name="$ARCHIVE_NAME" '$2 == name || $2 == "*" name { print $1; exit }' "$TEMP_DIR/SHA256SUMS.txt")"
if ! printf '%s' "$EXPECTED_HASH" | grep -Eq '^[0-9a-fA-F]{64}$'; then
  echo "The release checksum file does not contain $ARCHIVE_NAME." >&2
  exit 1
fi
ACTUAL_HASH="$(sha256sum "$TEMP_DIR/$ARCHIVE_NAME" | awk '{print $1}')"
if [ "${ACTUAL_HASH,,}" != "${EXPECTED_HASH,,}" ]; then
  echo "The downloaded archive failed SHA-256 verification." >&2
  exit 1
fi

mkdir -p "$TEMP_DIR/source"
tar -xzf "$TEMP_DIR/$ARCHIVE_NAME" -C "$TEMP_DIR/source"
if [ "$(tr -d '\r\n' < "$TEMP_DIR/source/VERSION")" != "$VERSION" ]; then
  echo "The downloaded archive version does not match $REF." >&2
  exit 1
fi

systemctl --user disable --now quotahush-server 2>/dev/null || true
mkdir -p "$INSTALL_ROOT"
rm -rf "$TEMP_DIR/app"
mv "$TEMP_DIR/source" "$TEMP_DIR/app"
rm -rf "$APP_DIR"
mv "$TEMP_DIR/app" "$APP_DIR"
cp "$APP_DIR/install.sh" "$INSTALL_ROOT/update.sh"
chmod 700 "$INSTALL_ROOT/update.sh"

bash "$APP_DIR/server/install_linux.sh"

echo
echo "QuotaHush was installed in $APP_DIR"
echo "Configuration: ${XDG_CONFIG_HOME:-$HOME/.config}/quotahush/.var.env"
