#!/usr/bin/env bash

set -euo pipefail

# Install the public keys in scripts/authorized_keys onto the SSH host so
# that holders of the matching private keys can connect (and run
# scripts/tunnel.sh) without a password.
#
# Run this once, against a host where you can currently authenticate.
# Defaults match scripts/tunnel.sh; override via env vars if needed.
#
#   SSH_USER       (default: root)
#   SSH_HOST       (default: 213.163.75.246)
#   SSH_PORT       (default: 50306)
#   REMOTE_USER    (default: $SSH_USER -- whose ~/.ssh/authorized_keys to write)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KEYS_SOURCE="$SCRIPT_DIR/authorized_keys"

if [[ ! -f "$KEYS_SOURCE" ]]; then
  echo "Missing keys file: $KEYS_SOURCE" >&2
  exit 1
fi

SSH_USER="${SSH_USER:-root}"
SSH_HOST="${SSH_HOST:-213.163.75.246}"
SSH_PORT="${SSH_PORT:-50306}"
REMOTE_USER="${REMOTE_USER:-$SSH_USER}"

# Append-and-dedupe so existing keys are preserved.
ssh -p "$SSH_PORT" "${SSH_USER}@${SSH_HOST}" "
  set -euo pipefail
  install -d -m 700 ~${REMOTE_USER}/.ssh
  touch ~${REMOTE_USER}/.ssh/authorized_keys
  chmod 600 ~${REMOTE_USER}/.ssh/authorized_keys
  cat >> ~${REMOTE_USER}/.ssh/authorized_keys
  sort -u -o ~${REMOTE_USER}/.ssh/authorized_keys ~${REMOTE_USER}/.ssh/authorized_keys
" < "$KEYS_SOURCE"

echo "Installed $(wc -l < "$KEYS_SOURCE") key(s) to ${REMOTE_USER}@${SSH_HOST}:~/.ssh/authorized_keys"
