#!/usr/bin/env bash
# Set up a Cloudflare Tunnel so the Foxy app is reachable via HTTPS on a
# public *.trycloudflare.com URL. Useful when the user's network blocks the
# high-numbered direct ports (50000+) Vast.ai uses.
#
# Run inside the Vast.ai instance:
#   curl -fsSL https://raw.githubusercontent.com/jjsaw911/DocuWhisper/claude/vast-ai-key-n26dT/scripts/comfyui/cloudflare_tunnel.sh | bash
#
# The tunnel URL appears in /workspace/foxy/tunnel_url.txt after ~30s.

set -euo pipefail
log() { printf '\n\033[1;36m[%s]\033[0m %s\n' "$(date +%H:%M:%S)" "$*"; }
ok()  { printf '\033[1;32m  ✓\033[0m %s\n' "$*"; }

mkdir -p /workspace/foxy

# 1. Install cloudflared if missing
if ! command -v cloudflared >/dev/null 2>&1; then
    log "Downloading cloudflared"
    curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 \
        -o /usr/local/bin/cloudflared
    chmod +x /usr/local/bin/cloudflared
fi
ok "cloudflared: $(cloudflared --version 2>&1 | head -1)"

# 2. Kill any previous tunnel
if pgrep -f "cloudflared tunnel" >/dev/null 2>&1; then
    log "Stopping previous tunnel"
    pkill -f "cloudflared tunnel" || true
    sleep 2
fi

# 3. Add supervisord program so the tunnel restarts automatically
SUPERVISOR_CONF="/etc/supervisor/conf.d/cloudflared-foxy.conf"
if [ -d /etc/supervisor/conf.d ] && command -v supervisorctl >/dev/null 2>&1; then
    log "Registering tunnel with supervisord (survives ComfyUI restarts)"
    cat > "$SUPERVISOR_CONF" <<'EOF'
[program:cloudflared-foxy]
command=/usr/local/bin/cloudflared tunnel --no-autoupdate --url http://127.0.0.1:18188 --logfile /workspace/foxy/cloudflared.log
autostart=true
autorestart=true
stdout_logfile=/workspace/foxy/cloudflared.stdout.log
stderr_logfile=/workspace/foxy/cloudflared.stderr.log
priority=900
EOF
    supervisorctl reread >/dev/null 2>&1 || true
    supervisorctl update >/dev/null 2>&1 || true
    supervisorctl start cloudflared-foxy 2>&1 | sed 's/^/  /' || true
else
    log "No supervisord; starting tunnel in background"
    nohup /usr/local/bin/cloudflared tunnel --no-autoupdate --url http://127.0.0.1:18188 \
        --logfile /workspace/foxy/cloudflared.log \
        > /workspace/foxy/cloudflared.stdout.log 2>&1 &
fi

# 4. Wait for the tunnel URL to appear in logs
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
    echo
    echo "Tunnel URL did not appear. Last 40 lines of log:"
    for f in /workspace/foxy/cloudflared.log /workspace/foxy/cloudflared.stderr.log /workspace/foxy/cloudflared.stdout.log; do
        [ -f "$f" ] && { echo "=== $f ==="; tail -40 "$f"; }
    done
    exit 1
fi

echo "$URL" > /workspace/foxy/tunnel_url.txt
ok "Tunnel URL: $URL"

echo
echo "============================================================"
echo "  Foxy is reachable at:"
echo
echo "      $URL/foxy"
echo
echo "  This URL works on any network (uses standard HTTPS on 443)."
echo "  Bookmark it. It stays the same as long as the tunnel runs."
echo
echo "  Tunnel auto-restarts if it dies (managed by supervisord)."
echo "============================================================"
