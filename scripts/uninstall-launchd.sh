#!/usr/bin/env bash
set -euo pipefail

LABEL="com.akimixu.imessage-codex-bridge"
TARGET_PLIST="${HOME}/Library/LaunchAgents/${LABEL}.plist"

if launchctl print "gui/$(id -u)/${LABEL}" >/dev/null 2>&1; then
  launchctl bootout "gui/$(id -u)" "${TARGET_PLIST}" >/dev/null 2>&1 || true
fi

rm -f "${TARGET_PLIST}"
echo "已卸载 ${LABEL}"
