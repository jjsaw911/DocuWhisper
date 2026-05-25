#!/usr/bin/env bash
# Install the Photo Studio UI custom node into ComfyUI, restart it, and verify.
# Run inside the Vast.ai instance:
#   curl -fsSL https://raw.githubusercontent.com/jjsaw911/DocuWhisper/claude/vast-ai-key-n26dT/scripts/comfyui/install_ui.sh | bash

set -euo pipefail
log() { printf '\n\033[1;36m[%s]\033[0m %s\n' "$(date +%H:%M:%S)" "$*"; }
err() { printf '\n\033[1;31m[%s] ERROR:\033[0m %s\n' "$(date +%H:%M:%S)" "$*" >&2; }
ok()  { printf '\033[1;32m  ✓\033[0m %s\n' "$*"; }

# --- locate ComfyUI ---
COMFY_DIR="${COMFYUI_DIR:-}"
if [ -z "$COMFY_DIR" ]; then
    for cand in /opt/workspace-internal/ComfyUI /opt/ComfyUI /workspace/ComfyUI; do
        [ -d "$cand" ] && COMFY_DIR="$cand" && break
    done
fi
[ -z "$COMFY_DIR" ] && { err "could not find ComfyUI directory"; exit 1; }
log "ComfyUI at: $COMFY_DIR"

DEST="$COMFY_DIR/custom_nodes/simpleui"
mkdir -p "$DEST/web"

BASE="https://raw.githubusercontent.com/jjsaw911/DocuWhisper/claude/vast-ai-key-n26dT/scripts/comfyui/simpleui"
log "Downloading simpleui files"
curl -fsSL "$BASE/__init__.py"      -o "$DEST/__init__.py"
curl -fsSL "$BASE/web/index.html"   -o "$DEST/web/index.html"

# --- verify files landed ---
log "Verifying install"
for f in "$DEST/__init__.py" "$DEST/web/index.html"; do
    if [ -s "$f" ]; then
        ok "$(stat -c '%n (%s bytes)' "$f")"
    else
        err "missing or empty: $f"
        exit 1
    fi
done

# --- detect ComfyUI supervisor service name ---
SVC=""
if command -v supervisorctl >/dev/null 2>&1; then
    SVC=$(supervisorctl status 2>/dev/null | awk 'tolower($1) ~ /comfy/ {print $1; exit}' || true)
fi

if [ -n "$SVC" ]; then
    log "Restarting supervisor service: $SVC"
    supervisorctl restart "$SVC" 2>&1 | sed 's/^/  /' || true
else
    log "No supervisor service matched 'comfy' — falling back to SIGHUP on the ComfyUI process"
    pkill -HUP -f "ComfyUI/main.py" 2>/dev/null || pkill -f "ComfyUI/main.py" 2>/dev/null || true
fi

# --- wait for ComfyUI to come back up (poll its internal port) ---
log "Waiting for ComfyUI to respond..."
HEALTH_OK=0
for i in $(seq 1 30); do
    if curl -fs --max-time 2 "http://127.0.0.1:18188/system_stats" >/dev/null 2>&1; then
        HEALTH_OK=1
        break
    fi
    sleep 2
done

if [ "$HEALTH_OK" -eq 1 ]; then
    ok "ComfyUI is healthy"
else
    err "ComfyUI did not respond on http://127.0.0.1:18188 after 60 seconds"
    echo
    echo "Recent supervisor status:"
    supervisorctl status 2>&1 | sed 's/^/  /' || true
    echo
    echo "Try checking the ComfyUI log:"
    echo "  tail -100 /var/log/portal/comfyui.log 2>/dev/null || \\"
    echo "  tail -100 /var/log/supervisor/comfyui*.log 2>/dev/null"
    echo
    echo "You can also start ComfyUI manually:"
    echo "  cd $COMFY_DIR && python3 main.py --listen 0.0.0.0 --port 18188 --enable-cors-header"
    exit 1
fi

# --- confirm our route is registered ---
if curl -fs --max-time 5 "http://127.0.0.1:18188/photostudio" -o /dev/null; then
    ok "/photostudio route responds 200"
else
    err "/photostudio route did NOT respond - the custom node may not have loaded"
    echo "Last 30 lines of ComfyUI startup log (if available):"
    for logf in /var/log/portal/comfyui.log /var/log/supervisor/comfyui-stderr*.log /var/log/supervisor/comfyui-stdout*.log; do
        [ -f "$logf" ] && { echo "=== $logf ==="; tail -30 "$logf"; }
    done
    exit 1
fi

cat <<EOF

============================================================
DONE. Open this URL on your phone:

  http://213.163.75.246:50147/photostudio

If you tap Generate and get "Checkpoint not found" or a
missing-node error, run the model+nodes installer first:

  curl -fsSL https://raw.githubusercontent.com/jjsaw911/DocuWhisper/claude/vast-ai-key-n26dT/scripts/comfyui/provision.sh | bash
============================================================
EOF
