#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="/Users/akimixu/Desktop/Projects/imessage-codex-bridge"
LABEL="com.akimixu.imessage-codex-bridge"
SOURCE_PLIST="${PROJECT_DIR}/deploy/launchd/${LABEL}.plist"
TARGET_PLIST="${HOME}/Library/LaunchAgents/${LABEL}.plist"
VOLTA_BIN="/opt/homebrew/bin/volta"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${HOME}/.volta/bin:/Applications/Codex.app/Contents/Resources"

cd "${PROJECT_DIR}"

if [[ ! -x "${VOLTA_BIN}" ]]; then
  echo "缺少 Volta: ${VOLTA_BIN}" >&2
  exit 1
fi

mkdir -p "${PROJECT_DIR}/logs" "${PROJECT_DIR}/data/attachments" "${HOME}/Library/LaunchAgents"
chmod +x "${PROJECT_DIR}/scripts/run-production.sh"

echo "运行生产自检..."
if ! "${VOLTA_BIN}" run npm run doctor; then
  echo "自检未通过，已停止安装 launchd 服务。请先修复上面的 FAIL 项。" >&2
  exit 1
fi

if launchctl print "gui/$(id -u)/${LABEL}" >/dev/null 2>&1; then
  launchctl bootout "gui/$(id -u)" "${TARGET_PLIST}" >/dev/null 2>&1 || true
fi

cp "${SOURCE_PLIST}" "${TARGET_PLIST}"
chmod 644 "${TARGET_PLIST}"
launchctl bootstrap "gui/$(id -u)" "${TARGET_PLIST}"
launchctl enable "gui/$(id -u)/${LABEL}"
launchctl kickstart -k "gui/$(id -u)/${LABEL}"

echo "已安装并启动 ${LABEL}"
echo "查看状态: launchctl print gui/$(id -u)/${LABEL}"
echo "查看日志: tail -f ${PROJECT_DIR}/logs/bridge.out.log ${PROJECT_DIR}/logs/bridge.err.log"
