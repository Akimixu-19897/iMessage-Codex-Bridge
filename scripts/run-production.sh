#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="/Users/akimixu/Desktop/Projects/imessage-codex-bridge"
VOLTA_BIN="/opt/homebrew/bin/volta"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${HOME}/.volta/bin:/Applications/Codex.app/Contents/Resources"
export BRIDGE_CONFIG_PATH="${BRIDGE_CONFIG_PATH:-${PROJECT_DIR}/config/bridge.local.yaml}"
export BRIDGE_STATE_PATH="${BRIDGE_STATE_PATH:-${PROJECT_DIR}/data/bridge-state.json}"
export BRIDGE_USE_SQLITE="${BRIDGE_USE_SQLITE:-1}"
export BRIDGE_DB_PATH="${BRIDGE_DB_PATH:-${PROJECT_DIR}/data/bridge.db}"
export BRIDGE_ATTACHMENT_DIR="${BRIDGE_ATTACHMENT_DIR:-${PROJECT_DIR}/data/attachments}"
export BRIDGE_LOG_LEVEL="${BRIDGE_LOG_LEVEL:-info}"
export BRIDGE_PREVENT_SLEEP="${BRIDGE_PREVENT_SLEEP:-1}"
export BRIDGE_JOB_RETENTION_DAYS="${BRIDGE_JOB_RETENTION_DAYS:-30}"
export BRIDGE_MAX_COMPLETED_JOBS="${BRIDGE_MAX_COMPLETED_JOBS:-200}"

cd "${PROJECT_DIR}"
mkdir -p "$(dirname "${BRIDGE_STATE_PATH}")" "$(dirname "${BRIDGE_DB_PATH}")" "${BRIDGE_ATTACHMENT_DIR}"

if [[ "${BRIDGE_PREVENT_SLEEP}" == "1" ]]; then
  exec /usr/bin/caffeinate -i "${VOLTA_BIN}" run npm run dev
fi

exec "${VOLTA_BIN}" run npm run dev
