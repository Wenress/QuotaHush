#!/usr/bin/env bash
set -euo pipefail

UNIT_DIR="$HOME/.config/systemd/user"
UNIT_FILES=(
  "$UNIT_DIR/quotahush-server.service"
  "$UNIT_DIR/quotahush-update.service"
  "$UNIT_DIR/quotahush-update.timer"
)

systemctl --user stop quotahush-server 2>/dev/null || true
systemctl --user disable quotahush-server 2>/dev/null || true
systemctl --user disable --now quotahush-update.timer 2>/dev/null || true

REMOVED=false
for UNIT_FILE in "${UNIT_FILES[@]}"; do
  if [ -f "$UNIT_FILE" ]; then
    rm -f "$UNIT_FILE"
    echo "Removed $UNIT_FILE"
    REMOVED=true
  fi
done
if [ "$REMOVED" = true ]; then
  systemctl --user daemon-reload
else
  echo "No QuotaHush unit file found."
fi
