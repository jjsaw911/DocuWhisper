"""ComfyUI workflow JSON builders."""

CHECKPOINT = "RealVisXL_V5.0_fp16.safetensors"

DEFAULT_NEGATIVE = (
    "cartoon, 3d, anime, illustration, painting, drawing, sketch, blurry, "
    "low quality, deformed face, bad anatomy, extra fingers, watermark, "
    "signature, text, jpeg artifacts"
)

POSITIVE_SUFFIX = (
    ", photorealistic, RAW photo, detailed skin texture, sharp focus, 8k uhd, "
    "dslr, professional photography"
)


def text2img(
    prompt: str,
    *,
    negative: str = DEFAULT_NEGATIVE,
    width: int = 832,
    height: int = 1216,
    steps: int = 28,
    cfg: float = 4.5,
    seed: int = 0,
) -> dict:
    return {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": CHECKPOINT}},
        "2": {"class_type": "CLIPSetLastLayer", "inputs": {"clip": ["1", 1], "stop_at_clip_layer": -2}},
        "3": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt + POSITIVE_SUFFIX, "clip": ["2", 0]}},
        "4": {"class_type": "CLIPTextEncode", "inputs": {"text": negative, "clip": ["2", 0]}},
        "5": {"class_type": "EmptyLatentImage", "inputs": {"width": width, "height": height, "batch_size": 1}},
        "6": {"class_type": "KSampler", "inputs": {
            "model": ["1", 0],
            "seed": seed,
            "steps": steps,
            "cfg": cfg,
            "sampler_name": "dpmpp_2m_sde",
            "scheduler": "karras",
            "denoise": 1.0,
            "positive": ["3", 0],
            "negative": ["4", 0],
            "latent_image": ["5", 0],
        }},
        "7": {"class_type": "VAEDecode", "inputs": {"samples": ["6", 0], "vae": ["1", 2]}},
        "8": {"class_type": "SaveImage", "inputs": {"images": ["7", 0], "filename_prefix": "foxy"}},
    }


def text2img_with_face(
    face_filename: str,
    prompt: str,
    *,
    negative: str = DEFAULT_NEGATIVE,
    width: int = 832,
    height: int = 1216,
    steps: int = 28,
    cfg: float = 4.5,
    seed: int = 0,
    face_weight: float = 1.0,
) -> dict:
    return {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": CHECKPOINT}},
        "2": {"class_type": "CLIPSetLastLayer", "inputs": {"clip": ["1", 1], "stop_at_clip_layer": -2}},
        "3": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt + POSITIVE_SUFFIX, "clip": ["2", 0]}},
        "4": {"class_type": "CLIPTextEncode", "inputs": {"text": negative, "clip": ["2", 0]}},
        "5": {"class_type": "EmptyLatentImage", "inputs": {"width": width, "height": height, "batch_size": 1}},
        "6": {"class_type": "LoadImage", "inputs": {"image": face_filename}},
        "7": {"class_type": "IPAdapterUnifiedLoaderFaceID", "inputs": {
            "model": ["1", 0],
            "preset": "FACEID PLUS V2",
            "lora_strength": 0.6,
            "provider": "CUDA",
        }},
        "8": {"class_type": "IPAdapterFaceID", "inputs": {
            "model": ["7", 0],
            "ipadapter": ["7", 1],
            "image": ["6", 0],
            "weight": face_weight,
            "weight_faceidv2": face_weight,
            "weight_type": "linear",
            "combine_embeds": "concat",
            "start_at": 0.0,
            "end_at": 1.0,
            "embeds_scaling": "V only",
        }},
        "9": {"class_type": "KSampler", "inputs": {
            "model": ["8", 0],
            "seed": seed,
            "steps": steps,
            "cfg": cfg,
            "sampler_name": "dpmpp_2m_sde",
            "scheduler": "karras",
            "denoise": 1.0,
            "positive": ["3", 0],
            "negative": ["4", 0],
            "latent_image": ["5", 0],
        }},
        "10": {"class_type": "VAEDecode", "inputs": {"samples": ["9", 0], "vae": ["1", 2]}},
        "11": {"class_type": "SaveImage", "inputs": {"images": ["10", 0], "filename_prefix": "foxy"}},
    }
