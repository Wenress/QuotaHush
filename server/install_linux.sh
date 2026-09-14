#!/usr/bin/env bash
# Installs the QuotaHush local server as a systemd --user service so it
# starts automatically at login (no root needed).
set -euo pipefail

SERVER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_PYTHON="$SERVER_DIR/.venv/bin/python3"
UNIT_DIR="$HOME/.config/systemd/user"
UNIT_NAME="quotahush-server"
UNIT_FILE="$UNIT_DIR/$UNIT_NAME.service"
CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/quotahush"
ENV_FILE="$CONFIG_DIR/.var.env"

mkdir -p "$CONFIG_DIR"
chmod 700 "$CONFIG_DIR"
if [ ! -f "$ENV_FILE" ]; then
  cp "$SERVER_DIR/../.var.env.example" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
fi

if [ -x "$VENV_PYTHON" ] && ! "$VENV_PYTHON" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 11) else 1)' 2>/dev/null; then
  echo "The existing Python environment is unusable and will be rebuilt." >&2
  rm -rf "$SERVER_DIR/.venv"
fi

if [ ! -x "$VENV_PYTHON" ]; then
  if command -v uv >/dev/null 2>&1; then
    echo "Creating the Python environment with uv..."
    (cd "$SERVER_DIR" && uv sync)
  else
    QUOTAHUSH_PYTHON_BIN="$(command -v python3 || true)"
    if [ -z "$QUOTAHUSH_PYTHON_BIN" ]; then
      echo "Python 3.11 or newer was not found. Install Python or uv, then retry." >&2
      exit 1
    fi
    if ! "$QUOTAHUSH_PYTHON_BIN" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 11) else 1)'; then
      echo "Python 3.11 or newer is required. Install it or install uv, then retry." >&2
      exit 1
    fi
    echo "uv was not found; creating the environment with Python's built-in venv module..."
    if ! "$QUOTAHUSH_PYTHON_BIN" -m venv "$SERVER_DIR/.venv"; then
      echo "Could not create the virtual environment. Your distribution may require its python3-venv package." >&2
      exit 1
    fi
  fi
fi

systemctl --user disable --now "$UNIT_NAME" 2>/dev/null || true
rm -f "$UNIT_FILE"

mkdir -p "$UNIT_DIR"
cat > "$UNIT_FILE" <<EOF
[Unit]
Description=QuotaHush local usage server (Claude Code / Codex / DeepSeek / Z.AI)
After=network.target

[Service]
Type=simple
Environment="QUOTAHUSH_ENV_FILE=$ENV_FILE"
ExecStart="$VENV_PYTHON" "$SERVER_DIR/run_server.pyw"
WorkingDirectory="$SERVER_DIR"
Restart=on-failure
RestartSec=3

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now "$UNIT_NAME"

echo "Installed and started. Check status with:"
echo "  systemctl --user status $UNIT_NAME"
echo "  curl http://127.0.0.1:8765/health"
