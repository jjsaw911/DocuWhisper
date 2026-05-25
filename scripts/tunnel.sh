#!/usr/bin/env bash

set -euo pipefail

# Open an SSH tunnel to the DocuWhisper dev/staging host, forwarding the
# remote app port to the same port on this machine.
#
# Run from your local machine (not from a CI/cloud sandbox) so that
# http://localhost:${LOCAL_PORT} resolves in your browser.
#
# Overridable via env vars:
#   SSH_USER       (default: root)
#   SSH_HOST       (default: 213.163.75.246)
#   SSH_PORT       (default: 50306)
#   LOCAL_PORT     (default: 8080)
#   REMOTE_PORT    (default: 8080)
#   REMOTE_BIND    (default: localhost  -- bound on the remote side)

SSH_USER="${SSH_USER:-root}"
SSH_HOST="${SSH_HOST:-213.163.75.246}"
SSH_PORT="${SSH_PORT:-50306}"
LOCAL_PORT="${LOCAL_PORT:-8080}"
REMOTE_PORT="${REMOTE_PORT:-8080}"
REMOTE_BIND="${REMOTE_BIND:-localhost}"

exec ssh \
  -p "$SSH_PORT" \
  -L "${LOCAL_PORT}:${REMOTE_BIND}:${REMOTE_PORT}" \
  "${SSH_USER}@${SSH_HOST}"
