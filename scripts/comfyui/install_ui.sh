#!/usr/bin/env bash
# Install the Simple UI custom node into ComfyUI and restart.
# Run inside the Vast.ai instance:
#   curl -fsSL https://raw.githubusercontent.com/jjsaw911/DocuWhisper/claude/vast-ai-key-n26dT/scripts/comfyui/install_ui.sh | bash

set -euo pipefail
log() { printf '\n\033[1;36m[%s]\033[0m %s\n' "$(date +%H:%M:%S)" "$*"; }

COMFY_DIR="${COMFYUI_DIR:-}"
if [ -z "$COMFY_DIR" ]; then
    for cand in /opt/workspace-internal/ComfyUI /opt/ComfyUI /workspace/ComfyUI; do
        [ -d "$cand" ] && COMFY_DIR="$cand" && break
    done
fi
[ -z "$COMFY_DIR" ] && { echo "FATAL: could not find ComfyUI directory"; exit 1; }
log "ComfyUI at: $COMFY_DIR"

DEST="$COMFY_DIR/custom_nodes/simpleui"
mkdir -p "$DEST/web"

BASE="https://raw.githubusercontent.com/jjsaw911/DocuWhisper/claude/vast-ai-key-n26dT/scripts/comfyui/simpleui"
log "Downloading simpleui files"
curl -fsSL "$BASE/__init__.py" -o "$DEST/__init__.py"
curl -fsSL "$BASE/web/index.html" -o "$DEST/web/index.html"

log "Restarting ComfyUI..."
if command -v supervisorctl >/dev/null 2>&1; then
    supervisorctl restart comfyui 2>&1 || supervisorctl restart all 2>&1 || true
else
    pkill -f "ComfyUI/main.py" || true
    log "Killed ComfyUI process; supervisord should restart it (or start manually)."
fi

cat <<EOF

============================================================
DONE. Open this URL in your browser:

  http://213.163.75.246:50147/extensions/simpleui/index.html

(give ComfyUI ~20 seconds to come back up after restart)
============================================================
EOF
