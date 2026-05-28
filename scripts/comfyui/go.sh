#!/usr/bin/env bash
# Final all-in-one: install foxy if not present, restart ComfyUI, fresh tunnel.
# Designed to be idempotent and safe to re-run.

set -uo pipefail
log() { printf '\n\033[1;36m[%s]\033[0m %s\n' "$(date +%H:%M:%S)" "$*"; }
ok()  { printf '\033[1;32m  ✓\033[0m %s\n' "$*"; }
err() { printf '\n\033[1;31mERR:\033[0m %s\n' "$*" >&2; }

BRANCH="claude/vast-ai-key-n26dT"
BASE="https://raw.githubusercontent.com/jjsaw911/DocuWhisper/${BRANCH}/scripts/comfyui/foxy"
COMFY_DIR="/workspace/ComfyUI"
FOXY_DIR="$COMFY_DIR/custom_nodes/foxy"

# ---------- 1. kill ALL cloudflared ----------
log "Stopping all existing cloudflared tunnels"
supervisorctl stop cloudflared-foxy 2>/dev/null || true
pkill -9 -f cloudflared 2>/dev/null || true
sleep 2
ok "no cloudflared running"

# ---------- 2. install foxy files (idempotent) ----------
log "Installing Foxy files to $FOXY_DIR"
mkdir -p "$FOXY_DIR/web"
for f in __init__.py db.py auth.py comfy_client.py workflows.py routes.py; do
    curl -fsSL "$BASE/$f" -o "$FOXY_DIR/$f"
done
for f in index.html styles.css app.js; do
    curl -fsSL "$BASE/web/$f" -o "$FOXY_DIR/web/$f"
done
# Sanity check
[ -s "$FOXY_DIR/__init__.py" ] || { err "foxy/__init__.py missing"; exit 1; }
[ -s "$FOXY_DIR/web/index.html" ] || { err "foxy/web/index.html missing"; exit 1; }
ok "foxy files present ($(find "$FOXY_DIR" -type f | wc -l) files)"

# ---------- 3. restart ComfyUI ----------
log "Restarting ComfyUI (supervisorctl restart comfyui)"
supervisorctl restart comfyui 2>&1 | sed 's/^/  /'

log "Waiting for ComfyUI to come up..."
for i in $(seq 1 60); do
    sleep 2
    if curl -fs --max-time 2 "http://127.0.0.1:18188/system_stats" >/dev/null 2>&1; then
        ok "ComfyUI up after ${i}*2 seconds"
        break
    fi
    if [ $i -eq 60 ]; then
        err "ComfyUI did not come up in 120s"
        tail -50 /workspace/ComfyUI/user/comfyui.log 2>/dev/null
        exit 1
    fi
done

# ---------- 4. verify foxy loaded ----------
sleep 3
log "Verifying Foxy routes registered"
FOXY_RESP=$(curl -fs --max-time 5 "http://127.0.0.1:18188/foxy/api/me" 2>&1 || true)
if echo "$FOXY_RESP" | grep -q "authenticated"; then
    ok "Foxy is registered: $FOXY_RESP"
else
    err "Foxy did NOT register. ComfyUI log tail:"
    tail -80 /workspace/ComfyUI/user/comfyui.log 2>/dev/null | grep -E "foxy|error|Error|ERROR|Traceback|ImportError" -A 3 || tail -50 /workspace/ComfyUI/user/comfyui.log 2>/dev/null
    echo "---"
    echo "Will continue with tunnel anyway."
fi

# ---------- 5. install cloudflared if needed ----------
if ! command -v cloudflared >/dev/null 2>&1; then
    log "Downloading cloudflared binary"
    curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 \
        -o /usr/local/bin/cloudflared
    chmod +x /usr/local/bin/cloudflared
fi
ok "cloudflared: $(/usr/local/bin/cloudflared --version 2>&1 | head -1)"

# ---------- 6. supervisord-managed tunnel ----------
log "Configuring supervisord to manage cloudflared-foxy"
cat > /etc/supervisor/conf.d/cloudflared-foxy.conf <<'EOF'
[program:cloudflared-foxy]
command=/usr/local/bin/cloudflared tunnel --no-autoupdate --url http://127.0.0.1:18188 --logfile /workspace/foxy/cloudflared.log
autostart=true
autorestart=true
stopwaitsecs=10
stdout_logfile=/workspace/foxy/cloudflared.stdout.log
stderr_logfile=/workspace/foxy/cloudflared.stderr.log
priority=900
EOF

# Truncate old logs
: > /workspace/foxy/cloudflared.log 2>/dev/null || true
: > /workspace/foxy/cloudflared.stdout.log 2>/dev/null || true
: > /workspace/foxy/cloudflared.stderr.log 2>/dev/null || true
mkdir -p /workspace/foxy

supervisorctl reread 2>&1 | sed 's/^/  /'
supervisorctl update 2>&1 | sed 's/^/  /'
supervisorctl restart cloudflared-foxy 2>&1 | sed 's/^/  /'

# ---------- 7. capture URL ----------
log "Waiting for tunnel URL"
URL=""
for i in $(seq 1 30); do
    for f in /workspace/foxy/cloudflared.log /workspace/foxy/cloudflared.stderr.log /workspace/foxy/cloudflared.stdout.log; do
        if [ -f "$f" ]; then
            U=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$f" 2>/dev/null | head -1 || true)
            if [ -n "$U" ]; then URL="$U"; break 2; fi
        fi
    done
    sleep 2
done

if [ -z "$URL" ]; then
    err "Tunnel URL never appeared. cloudflared logs:"
    tail -30 /workspace/foxy/cloudflared.log /workspace/foxy/cloudflared.stderr.log /workspace/foxy/cloudflared.stdout.log 2>/dev/null
    exit 1
fi

echo "$URL" > /workspace/foxy/tunnel_url.txt

# ---------- 8. final report ----------
echo
echo "================================================================"
echo "  ✓ Foxy is running and reachable."
echo
echo "  Open: $URL/foxy"
echo
if [ -f /workspace/foxy/initial_creds.txt ]; then
    echo "  Initial credentials:"
    sed 's/^/    /' /workspace/foxy/initial_creds.txt
fi
echo "================================================================"
