#!/usr/bin/env bash
# Install the Foxy app (custom node) into ComfyUI and restart.
# Run inside the Vast.ai instance:
#   curl -fsSL https://raw.githubusercontent.com/jjsaw911/DocuWhisper/claude/vast-ai-key-n26dT/scripts/comfyui/install_foxy.sh | bash

set -euo pipefail
log() { printf '\n\033[1;36m[%s]\033[0m %s\n' "$(date +%H:%M:%S)" "$*"; }
err() { printf '\n\033[1;31m[%s] ERROR:\033[0m %s\n' "$(date +%H:%M:%S)" "$*" >&2; }
ok()  { printf '\033[1;32m  ✓\033[0m %s\n' "$*"; }

BRANCH="claude/vast-ai-key-n26dT"
BASE="https://raw.githubusercontent.com/jjsaw911/DocuWhisper/${BRANCH}/scripts/comfyui/foxy"

# --- locate ComfyUI ---
COMFY_DIR="${COMFYUI_DIR:-}"
if [ -z "$COMFY_DIR" ]; then
    for cand in /opt/workspace-internal/ComfyUI /opt/ComfyUI /workspace/ComfyUI; do
        [ -d "$cand" ] && COMFY_DIR="$cand" && break
    done
fi
[ -z "$COMFY_DIR" ] && { err "could not find ComfyUI directory"; exit 1; }
log "ComfyUI at: $COMFY_DIR"

# --- clean up old simpleui (superseded) ---
if [ -d "$COMFY_DIR/custom_nodes/simpleui" ]; then
    log "Removing old simpleui custom node"
    rm -rf "$COMFY_DIR/custom_nodes/simpleui"
fi

DEST="$COMFY_DIR/custom_nodes/foxy"
mkdir -p "$DEST/web"

# --- download files ---
log "Downloading foxy files"
for f in __init__.py db.py auth.py comfy_client.py workflows.py routes.py; do
    curl -fsSL "$BASE/$f" -o "$DEST/$f"
    ok "$f"
done
for f in index.html styles.css app.js; do
    curl -fsSL "$BASE/web/$f" -o "$DEST/web/$f"
    ok "web/$f"
done

# --- ensure persistent data dir exists with right perms ---
mkdir -p /workspace/foxy/{references,outputs}

# --- detect ComfyUI supervisor service name ---
SVC=""
if command -v supervisorctl >/dev/null 2>&1; then
    SVC=$(supervisorctl status 2>/dev/null | awk 'tolower($1) ~ /comfy/ {print $1; exit}' || true)
fi

if [ -n "$SVC" ]; then
    log "Restarting supervisor service: $SVC"
    supervisorctl restart "$SVC" 2>&1 | sed 's/^/  /' || true
else
    log "Restarting via process kill (no supervisor service found)"
    pkill -f "ComfyUI/main.py" 2>/dev/null || true
fi

# --- wait for ComfyUI to come back up ---
log "Waiting for ComfyUI to respond (up to 90s)..."
HEALTH_OK=0
for i in $(seq 1 45); do
    if curl -fs --max-time 2 "http://127.0.0.1:18188/system_stats" >/dev/null 2>&1; then
        HEALTH_OK=1
        break
    fi
    sleep 2
done
if [ "$HEALTH_OK" -ne 1 ]; then
    err "ComfyUI did not come back up. Check logs:"
    for logf in /var/log/portal/comfyui.log /var/log/supervisor/comfyui*; do
        [ -f "$logf" ] && { echo "=== $logf ==="; tail -40 "$logf"; }
    done
    exit 1
fi
ok "ComfyUI is up"

# --- check foxy registered its routes ---
if curl -fs --max-time 5 "http://127.0.0.1:18188/foxy/api/me" >/dev/null 2>&1; then
    ok "/foxy routes registered"
else
    err "/foxy did not respond; foxy custom node may have failed to import"
    for logf in /var/log/portal/comfyui.log /var/log/supervisor/comfyui-stderr*.log; do
        [ -f "$logf" ] && { echo "=== $logf ==="; tail -30 "$logf"; }
    done
    exit 1
fi

# --- show initial credentials if first install ---
CREDS="/workspace/foxy/initial_creds.txt"
echo
echo "============================================================"
echo "  Foxy is live."
echo "============================================================"
echo
echo "  Open on your phone:"
echo "      http://213.163.75.246:50147/foxy"
echo
if [ -f "$CREDS" ]; then
    echo "  Initial login credentials (change after first login):"
    sed 's/^/    /' "$CREDS"
    echo
    echo "  (creds file path: $CREDS)"
else
    echo "  (Existing users preserved. If you've forgotten your password,"
    echo "   delete /workspace/foxy/app.db and re-run this installer to start fresh.)"
fi
echo
echo "  NOTE: For face-consistent generation you also need the models."
echo "  If you haven't run it yet:"
echo "      curl -fsSL https://raw.githubusercontent.com/jjsaw911/DocuWhisper/${BRANCH}/scripts/comfyui/provision.sh | bash"
echo "============================================================"
