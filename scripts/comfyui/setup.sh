#!/usr/bin/env bash
# One-shot setup: runs provisioning (models + custom nodes) AND installs the
# Photo Studio UI. Designed to be the ONLY command the user needs to paste.
#
# Usage (inside Vast.ai instance):
#   curl -fsSL https://raw.githubusercontent.com/jjsaw911/DocuWhisper/claude/vast-ai-key-n26dT/scripts/comfyui/setup.sh | bash

set -euo pipefail

BRANCH="claude/vast-ai-key-n26dT"
BASE="https://raw.githubusercontent.com/jjsaw911/DocuWhisper/${BRANCH}/scripts/comfyui"

banner() {
    printf '\n\033[1;35m'
    printf '====================================================\n'
    printf '%s\n' "$*"
    printf '====================================================\033[0m\n\n'
}

banner "Step 1/2: Downloading models and custom nodes (~10-15 min)"
curl -fsSL "$BASE/provision.sh" | bash

banner "Step 2/2: Installing the Photo Studio UI"
curl -fsSL "$BASE/install_ui.sh" | bash

banner "ALL DONE"
cat <<EOF
Open this URL on your phone or laptop:

    http://213.163.75.246:50147/photostudio

That's the upload-photo + prompt + generate page.
EOF
