#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="/Users/akimixu/Desktop/Projects/imessage-codex-bridge"
VOLTA_BIN="/opt/homebrew/bin/volta"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${HOME}/.volta/bin:/Applications/Codex.app/Contents/Resources"
export BRIDGE_CONFIG_PATH="${BRIDGE_CONFIG_PATH:-${PROJECT_DIR}/config/bridge.local.yaml}"
export BRIDGE_STATE_PATH="${BRIDGE_STATE_PATH:-${PROJECT_DIR}/data/bridge-state.json}"
export BRIDGE_ATTACHMENT_DIR="${BRIDGE_ATTACHMENT_DIR:-${PROJECT_DIR}/data/attachments}"
export BRIDGE_LOG_LEVEL="${BRIDGE_LOG_LEVEL:-info}"

cd "${PROJECT_DIR}"
mkdir -p "$(dirname "${BRIDGE_STATE_PATH}")" "${BRIDGE_ATTACHMENT_DIR}"

exec "${VOLTA_BIN}" run npm run dev
