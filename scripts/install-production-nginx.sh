#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONF_SOURCE="$SCRIPT_DIR/docuwhisper.com.nginx.conf"
CONF_TARGET="/etc/nginx/sites-available/docuwhisper.com"
LINK_TARGET="/etc/nginx/sites-enabled/docuwhisper.com"

if [[ ! -f "$CONF_SOURCE" ]]; then
  echo "Missing nginx config template: $CONF_SOURCE" >&2
  exit 1
fi

sudo install -m 644 "$CONF_SOURCE" "$CONF_TARGET"
sudo ln -sf "$CONF_TARGET" "$LINK_TARGET"
sudo nginx -t
sudo systemctl reload nginx

cat <<'EOF'

Production HTTP proxy is installed.

If DNS for docuwhisper.com and www.docuwhisper.com now points to this VM,
finish TLS with:

  sudo certbot --nginx -d docuwhisper.com -d www.docuwhisper.com

Then verify:

  sudo nginx -t
  sudo systemctl reload nginx
  curl -I https://docuwhisper.com
  curl -I https://www.docuwhisper.com

EOF
