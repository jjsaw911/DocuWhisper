#!/usr/bin/env bash
# One-shot setup: provisions models + custom nodes AND installs the Foxy app.
# Run inside the Vast.ai instance:
#   curl -fsSL https://raw.githubusercontent.com/jjsaw911/DocuWhisper/claude/vast-ai-key-n26dT/scripts/comfyui/setup.sh | bash

set -euo pipefail

BRANCH="claude/vast-ai-key-n26dT"
BASE="https://raw.githubusercontent.com/jjsaw911/DocuWhisper/${BRANCH}/scripts/comfyui"

banner() {
    printf '\n\033[1;35m====================================================\n%s\n====================================================\033[0m\n\n' "$*"
}

banner "Step 1/2: Downloading models and custom nodes (~10-15 min on first run)"
curl -fsSL "$BASE/provision.sh" | bash

banner "Step 2/2: Installing the Foxy app"
curl -fsSL "$BASE/install_foxy.sh" | bash
