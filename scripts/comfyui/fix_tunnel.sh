#!/usr/bin/env bash
# Fix tunnel: kill all cloudflared, make sure ComfyUI is up, find its real
# port, re-create a tunnel pointed at the right place, print the new URL.
#
# Run inside the Vast.ai instance:
#   curl -fsSL https://raw.githubusercontent.com/jjsaw911/DocuWhisper/claude/vast-ai-key-n26dT/scripts/comfyui/fix_tunnel.sh | bash

set -uo pipefail
log() { printf '\n\033[1;36m[%s]\033[0m %s\n' "$(date +%H:%M:%S)" "$*"; }
ok()  { printf '\033[1;32m  ✓\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m  ⚠\033[0m %s\n' "$*"; }

# ---------- 1. nuke any existing cloudflared ----------
log "Stopping any existing tunnels"
supervisorctl stop cloudflared-foxy 2>/dev/null || true
pkill -9 -f cloudflared 2>/dev/null || true
sleep 2

# ---------- 2. make sure ComfyUI is running and find its port ----------
log "Locating ComfyUI process"
COMFY_PROC=$(ps -ef | grep -E "ComfyUI/main\.py|comfy.*main\.py" | grep -v grep | head -1 || true)
if [ -z "$COMFY_PROC" ]; then
    warn "ComfyUI process not running - restarting via supervisor"
    SVC=$(supervisorctl status 2>/dev/null | awk 'tolower($1) ~ /comfy/ {print $1; exit}' || true)
    if [ -n "$SVC" ]; then
        supervisorctl restart "$SVC"
        sleep 10
    fi
fi

# Detect ComfyUI listening port. Try the documented one first, then scan.
log "Probing for ComfyUI's listening port"
COMFY_PORT=""
for p in 18188 8188 18288 8288; do
    if curl -fs --max-time 3 "http://127.0.0.1:$p/system_stats" 2>/dev/null | grep -q "system\|comfy\|python"; then
        COMFY_PORT="$p"; break
    fi
done

if [ -z "$COMFY_PORT" ]; then
    # Fallback: scan ports actually listening, look for one whose HTTP response mentions ComfyUI
    log "Standard ports not responding - scanning listening sockets"
    for p in $(ss -tln 2>/dev/null | awk '{print $4}' | grep -oE ':[0-9]+$' | tr -d ':' | sort -u); do
        # skip well-known non-comfy ports
        case "$p" in 22|80|443|8080|9000|10000) continue ;; esac
        if curl -fs --max-time 2 "http://127.0.0.1:$p/system_stats" 2>/dev/null | grep -q "system\|comfy"; then
            COMFY_PORT="$p"; break
        fi
    done
fi

if [ -z "$COMFY_PORT" ]; then
    printf '\033[1;31mERROR:\033[0m Could not find ComfyUI listening anywhere.\n'
    echo "Listening ports:"
    ss -tlnp 2>/dev/null | grep LISTEN | head -20 | sed 's/^/  /'
    echo "Recent ComfyUI logs:"
    for f in /var/log/portal/comfyui.log /var/log/supervisor/comfyui*.log; do
        [ -f "$f" ] && { echo "--- $f ---"; tail -20 "$f"; }
    done
    exit 1
fi
ok "ComfyUI is on port $COMFY_PORT"

# ---------- 3. confirm Foxy is loaded ----------
if curl -fs --max-time 3 "http://127.0.0.1:$COMFY_PORT/foxy/api/me" >/dev/null 2>&1; then
    ok "Foxy is registered"
else
    warn "Foxy did NOT respond - it may not have loaded. Try re-running install_foxy.sh:"
    echo "  curl -fsSL https://raw.githubusercontent.com/jjsaw911/DocuWhisper/claude/vast-ai-key-n26dT/scripts/comfyui/install_foxy.sh | bash"
    echo "Continuing with the tunnel anyway so you can access ComfyUI itself."
fi

# ---------- 4. (re)create the supervisord program ----------
log "Configuring tunnel via supervisord (port $COMFY_PORT)"
CONF=/etc/supervisor/conf.d/cloudflared-foxy.conf
cat > "$CONF" <<EOF
[program:cloudflared-foxy]
command=/usr/local/bin/cloudflared tunnel --no-autoupdate --url http://127.0.0.1:$COMFY_PORT --logfile /workspace/foxy/cloudflared.log
autostart=true
autorestart=true
stdout_logfile=/workspace/foxy/cloudflared.stdout.log
stderr_logfile=/workspace/foxy/cloudflared.stderr.log
priority=900
EOF

# Make sure cloudflared binary exists
if ! command -v cloudflared >/dev/null 2>&1; then
    log "Installing cloudflared"
    curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 \
        -o /usr/local/bin/cloudflared
    chmod +x /usr/local/bin/cloudflared
fi

# Truncate old logs so we read a fresh URL
: > /workspace/foxy/cloudflared.log
: > /workspace/foxy/cloudflared.stdout.log
: > /workspace/foxy/cloudflared.stderr.log

supervisorctl reread >/dev/null 2>&1 || true
supervisorctl update >/dev/null 2>&1 || true
supervisorctl restart cloudflared-foxy 2>&1 | sed 's/^/  /' || true

# ---------- 5. wait for the new URL ----------
log "Waiting for tunnel URL (up to 60s)..."
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
    printf '\033[1;31mERROR:\033[0m Tunnel URL did not appear. Logs:\n'
    tail -30 /workspace/foxy/cloudflared.log /workspace/foxy/cloudflared.stderr.log /workspace/foxy/cloudflared.stdout.log 2>/dev/null
    exit 1
fi

echo "$URL" > /workspace/foxy/tunnel_url.txt
echo
echo "============================================================"
echo "  TUNNEL READY (now pointing at ComfyUI on port $COMFY_PORT)"
echo
echo "  Open this on your phone/laptop:"
echo
echo "      $URL/foxy"
echo
echo "============================================================"
