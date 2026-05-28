#!/usr/bin/env bash
# ComfyUI extra provisioning: custom nodes + NSFW-capable photorealistic checkpoints +
# face-consistency models (IP-Adapter FaceID + ReActor face swap).
#
# Run this INSIDE the Vast.ai instance, via the Jupyter terminal:
#   bash /workspace/comfy_provision.sh
# It is idempotent - safe to re-run.

set -euo pipefail

log() { printf '\n\033[1;36m[%s]\033[0m %s\n' "$(date +%H:%M:%S)" "$*"; }

# --- locate ComfyUI ---
COMFY_DIR="${COMFYUI_DIR:-}"
if [ -z "$COMFY_DIR" ]; then
    for cand in /opt/workspace-internal/ComfyUI /opt/ComfyUI /workspace/ComfyUI; do
        [ -d "$cand" ] && COMFY_DIR="$cand" && break
    done
fi
[ -z "$COMFY_DIR" ] && { echo "FATAL: could not find ComfyUI directory"; exit 1; }
log "ComfyUI at: $COMFY_DIR"

NODES_DIR="$COMFY_DIR/custom_nodes"
MODELS_DIR="$COMFY_DIR/models"
mkdir -p "$NODES_DIR" "$MODELS_DIR"/{checkpoints,vae,loras,ipadapter,insightface/models,controlnet,upscale_models,clip_vision,reactor/faces}

# --- wait for default provisioning to release apt/pip locks (if still running) ---
log "Waiting for any in-flight provisioning to settle..."
for _ in $(seq 1 30); do
    if ! pgrep -f "provisioning_scripts/default.sh" >/dev/null 2>&1; then break; fi
    sleep 5
done

# --- python env: vastai/comfy uses a venv at /venv/main typically ---
PIP="pip"
if [ -x /venv/main/bin/pip ]; then PIP="/venv/main/bin/pip"; fi
log "Using pip: $PIP"

# --- install custom nodes ---
clone_node() {
    local url="$1" dest_name
    dest_name="$(basename "$url" .git)"
    local dest="$NODES_DIR/$dest_name"
    if [ -d "$dest/.git" ]; then
        log "Updating $dest_name"
        git -C "$dest" pull --ff-only 2>&1 | tail -3 || true
    else
        log "Cloning $dest_name"
        git clone --depth 1 "$url" "$dest"
    fi
    if [ -f "$dest/requirements.txt" ]; then
        log "  installing requirements for $dest_name"
        $PIP install --no-cache-dir -r "$dest/requirements.txt" 2>&1 | tail -3 || true
    fi
}

clone_node https://github.com/cubiq/ComfyUI_IPAdapter_plus.git
clone_node https://github.com/cubiq/ComfyUI_InstantID.git
clone_node https://github.com/Gourieff/ComfyUI-ReActor.git
clone_node https://github.com/ltdrdata/ComfyUI-Impact-Pack.git
clone_node https://github.com/pythongosssss/ComfyUI-Custom-Scripts.git
clone_node https://github.com/rgthree/rgthree-comfy.git
clone_node https://github.com/Fannovel16/comfyui_controlnet_aux.git
clone_node https://github.com/WASasquatch/was-node-suite-comfyui.git

# Impact Pack has an install.py that pulls subpack
if [ -f "$NODES_DIR/ComfyUI-Impact-Pack/install.py" ]; then
    log "Running Impact Pack install.py"
    (cd "$NODES_DIR/ComfyUI-Impact-Pack" && python3 install.py 2>&1 | tail -5) || true
fi

# --- download models ---
dl() {
    # dl <url> <dest_path>  - skip if file exists and is non-empty
    local url="$1" dest="$2"
    if [ -s "$dest" ]; then log "Skip (exists): $(basename "$dest")"; return; fi
    log "Downloading $(basename "$dest") ($url)"
    mkdir -p "$(dirname "$dest")"
    # Prefer aria2c if available for speed
    if command -v aria2c >/dev/null 2>&1; then
        aria2c -x 8 -s 8 -k 1M --console-log-level=warn -o "$(basename "$dest")" -d "$(dirname "$dest")" "$url"
    else
        wget --content-disposition -q --show-progress -O "$dest" "$url"
    fi
}

# RealVisXL V5.0 - photorealistic SDXL, NSFW-capable (Hugging Face, no login)
dl https://huggingface.co/SG161222/RealVisXL_V5.0/resolve/main/RealVisXL_V5.0_fp16.safetensors \
   "$MODELS_DIR/checkpoints/RealVisXL_V5.0_fp16.safetensors"

# SDXL VAE (fixed fp16) - useful fallback
dl https://huggingface.co/madebyollin/sdxl-vae-fp16-fix/resolve/main/sdxl_vae.safetensors \
   "$MODELS_DIR/vae/sdxl_vae_fp16_fix.safetensors"

# CLIP Vision (required by IP-Adapter)
dl https://huggingface.co/h94/IP-Adapter/resolve/main/models/image_encoder/model.safetensors \
   "$MODELS_DIR/clip_vision/CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors"
dl https://huggingface.co/h94/IP-Adapter/resolve/main/sdxl_models/image_encoder/model.safetensors \
   "$MODELS_DIR/clip_vision/CLIP-ViT-bigG-14-laion2B-39B-b160k.safetensors"

# IP-Adapter FaceID Plus v2 SDXL - single-image face consistency
dl https://huggingface.co/h94/IP-Adapter-FaceID/resolve/main/ip-adapter-faceid-plusv2_sdxl.bin \
   "$MODELS_DIR/ipadapter/ip-adapter-faceid-plusv2_sdxl.bin"
dl https://huggingface.co/h94/IP-Adapter-FaceID/resolve/main/ip-adapter-faceid-plusv2_sdxl_lora.safetensors \
   "$MODELS_DIR/loras/ip-adapter-faceid-plusv2_sdxl_lora.safetensors"

# IP-Adapter base SDXL (for general style/composition reference)
dl https://huggingface.co/h94/IP-Adapter/resolve/main/sdxl_models/ip-adapter-plus_sdxl_vit-h.safetensors \
   "$MODELS_DIR/ipadapter/ip-adapter-plus_sdxl_vit-h.safetensors"

# InstantID models (alternative face consistency, often better than FaceID)
dl https://huggingface.co/InstantX/InstantID/resolve/main/ip-adapter.bin \
   "$MODELS_DIR/instantid/ip-adapter.bin"
dl https://huggingface.co/InstantX/InstantID/resolve/main/ControlNetModel/diffusion_pytorch_model.safetensors \
   "$MODELS_DIR/controlnet/instantid_controlnet.safetensors"

# InsightFace antelopev2 (required by InstantID + IP-Adapter FaceID + ReActor)
ANTELOPE_DIR="$MODELS_DIR/insightface/models/antelopev2"
if [ ! -d "$ANTELOPE_DIR" ] || [ -z "$(ls -A "$ANTELOPE_DIR" 2>/dev/null)" ]; then
    log "Downloading antelopev2"
    mkdir -p "$ANTELOPE_DIR"
    cd /tmp
    wget -q -O antelopev2.zip "https://huggingface.co/MonsterMMORPG/tools/resolve/main/antelopev2.zip"
    unzip -oq antelopev2.zip -d "$MODELS_DIR/insightface/models/"
    rm -f antelopev2.zip
    # The zip extracts to antelopev2/antelopev2 sometimes; flatten
    if [ -d "$MODELS_DIR/insightface/models/antelopev2/antelopev2" ]; then
        mv "$MODELS_DIR/insightface/models/antelopev2/antelopev2"/* "$MODELS_DIR/insightface/models/antelopev2/"
    fi
fi

# ReActor face swap model
dl https://huggingface.co/datasets/Gourieff/ReActor/resolve/main/models/inswapper_128.onnx \
   "$NODES_DIR/ComfyUI-ReActor/models/inswapper/inswapper_128.onnx"

# GFPGAN face restoration (used by ReActor for upscaling)
dl https://huggingface.co/datasets/Gourieff/ReActor/resolve/main/models/facerestore_models/GFPGANv1.4.pth \
   "$MODELS_DIR/facerestore_models/GFPGANv1.4.pth"

# 4x upscaler (general purpose)
dl https://huggingface.co/Acly/Omost/resolve/main/4x_NMKD-Siax_200k.pth \
   "$MODELS_DIR/upscale_models/4x_NMKD-Siax_200k.pth" || true

log "DONE. Restart ComfyUI to pick up new nodes:"
log "  supervisorctl restart comfyui"
log "...or via the Instance Portal: kill the ComfyUI process; supervisord will restart it."
echo
echo "Models installed under: $MODELS_DIR"
echo "Custom nodes under:     $NODES_DIR"
echo
echo "Recommended next step: open ComfyUI Manager (top-right button in ComfyUI UI)"
echo "  -> Install Models, search 'detailer' or 'face' if you want more options"
