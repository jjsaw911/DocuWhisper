import asyncio
import time
from typing import Optional

import aiohttp

COMFY_URL = "http://127.0.0.1:18188"


async def upload_image(file_bytes: bytes, filename: str, content_type: str = "image/png") -> str:
    async with aiohttp.ClientSession() as s:
        form = aiohttp.FormData()
        form.add_field("image", file_bytes, filename=filename, content_type=content_type)
        form.add_field("overwrite", "true")
        async with s.post(f"{COMFY_URL}/upload/image", data=form) as r:
            text = await r.text()
            if r.status != 200:
                raise RuntimeError(f"upload {r.status}: {text[:300]}")
            import json
            return json.loads(text)["name"]


async def submit_prompt(workflow: dict, client_id: str) -> str:
    async with aiohttp.ClientSession() as s:
        async with s.post(
            f"{COMFY_URL}/prompt",
            json={"prompt": workflow, "client_id": client_id},
        ) as r:
            text = await r.text()
            if r.status != 200:
                raise RuntimeError(f"prompt {r.status}: {text[:500]}")
            import json
            return json.loads(text)["prompt_id"]


async def wait_for_result(prompt_id: str, timeout: float = 300.0) -> dict:
    start = time.time()
    async with aiohttp.ClientSession() as s:
        while time.time() - start < timeout:
            async with s.get(f"{COMFY_URL}/history/{prompt_id}") as r:
                if r.status == 200:
                    data = await r.json()
                    if prompt_id in data:
                        item = data[prompt_id]
                        status = item.get("status", {})
                        if status.get("status_str") == "error":
                            msgs = status.get("messages", [])
                            err = next((m[1] for m in msgs if m[0] == "execution_error"), None)
                            raise RuntimeError(f"execution error: {err or 'unknown'}")
                        if item.get("outputs"):
                            return item["outputs"]
            await asyncio.sleep(1.2)
    raise TimeoutError(f"generation did not complete in {timeout:.0f}s")


async def fetch_output(filename: str, subfolder: str = "", img_type: str = "output") -> bytes:
    async with aiohttp.ClientSession() as s:
        params = {"filename": filename, "subfolder": subfolder, "type": img_type}
        async with s.get(f"{COMFY_URL}/view", params=params) as r:
            if r.status != 200:
                raise RuntimeError(f"fetch {r.status}")
            return await r.read()


async def queue_position(prompt_id: str) -> Optional[int]:
    async with aiohttp.ClientSession() as s:
        async with s.get(f"{COMFY_URL}/queue") as r:
            if r.status != 200:
                return None
            data = await r.json()
            for x in data.get("queue_running", []):
                if x[1] == prompt_id:
                    return 0
            for i, x in enumerate(data.get("queue_pending", [])):
                if x[1] == prompt_id:
                    return i + 1
            return None
