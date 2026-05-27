"""ComfyUI admin custom node.

Lives at the root of the DocuWhisper repo so ComfyUI Manager can install it
via `https://github.com/jjsaw911/DocuWhisper` (clone-the-whole-repo). The
non-ComfyUI side of this repo is JavaScript/Node, so a stray __init__.py
at the root is inert there.

Exposes a few HTTP endpoints under /admin/* used to inspect and clean up the
Vast.ai instance's disk remotely — no shell needed.

Endpoints (all gated by Vast.ai's outer Caddy basic auth):
  GET  /admin/df              - overall disk free
  GET  /admin/du?path=<p>     - directory size, sorted
  GET  /admin/ls?path=<p>     - directory listing with sizes
  POST /admin/rm              - delete file/dir (allowlisted paths only)
  GET  /admin/version         - sanity check

This module deliberately avoids exposing arbitrary shell exec. File deletion
is restricted to a safelist of directories.
"""
import json
import os
import shutil
from typing import Optional

try:
    from aiohttp import web
    from server import PromptServer
    _COMFY = True
except Exception:
    _COMFY = False

NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}
__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"]


# Paths writes/deletes are restricted to these prefixes.
ALLOWED_RM_PREFIXES = (
    "/workspace/",
    "/root/.cache/",
    "/tmp/",
    "/var/log/",
    "/opt/workspace-internal/",
)


def _is_safe_path(p: str) -> bool:
    try:
        resolved = os.path.realpath(p)
    except Exception:
        return False
    # No following symlinks out of allowed prefixes
    return any(resolved.startswith(prefix) for prefix in ALLOWED_RM_PREFIXES)


def _dir_size(path: str) -> int:
    total = 0
    try:
        for entry in os.scandir(path):
            try:
                if entry.is_symlink():
                    continue
                if entry.is_file(follow_symlinks=False):
                    total += entry.stat(follow_symlinks=False).st_size
                elif entry.is_dir(follow_symlinks=False):
                    total += _dir_size(entry.path)
            except (OSError, PermissionError):
                continue
    except (OSError, PermissionError):
        pass
    return total


def _humanize(b: int) -> str:
    for unit in ("B", "K", "M", "G", "T"):
        if abs(b) < 1024.0:
            return f"{b:.1f}{unit}"
        b /= 1024.0
    return f"{b:.1f}P"


if _COMFY:
    routes = PromptServer.instance.routes

    @routes.get("/admin/version")
    async def _admin_version(request):
        return web.json_response({"ok": True, "version": "1"})

    @routes.get("/admin/df")
    async def _admin_df(request):
        out = {}
        for mount in ("/", "/workspace", "/tmp", "/root"):
            try:
                s = shutil.disk_usage(mount)
                out[mount] = {
                    "total_gb": round(s.total / 1e9, 2),
                    "used_gb": round(s.used / 1e9, 2),
                    "free_gb": round(s.free / 1e9, 2),
                    "percent_used": round(s.used / s.total * 100, 1),
                }
            except (OSError, FileNotFoundError):
                continue
        return web.json_response(out)

    @routes.get("/admin/du")
    async def _admin_du(request):
        path = request.query.get("path", "/workspace")
        if not os.path.isdir(path):
            return web.json_response({"error": f"not a directory: {path}"}, status=400)
        items = []
        try:
            for entry in os.scandir(path):
                try:
                    if entry.is_symlink():
                        items.append({"name": entry.name, "size": 0, "type": "symlink"})
                        continue
                    if entry.is_file(follow_symlinks=False):
                        sz = entry.stat(follow_symlinks=False).st_size
                        items.append({"name": entry.name, "size": sz, "size_h": _humanize(sz), "type": "file"})
                    elif entry.is_dir(follow_symlinks=False):
                        sz = _dir_size(entry.path)
                        items.append({"name": entry.name, "size": sz, "size_h": _humanize(sz), "type": "dir"})
                except (OSError, PermissionError):
                    continue
        except (OSError, PermissionError) as e:
            return web.json_response({"error": str(e)}, status=403)
        items.sort(key=lambda x: -x["size"])
        return web.json_response({"path": path, "items": items, "total": sum(x["size"] for x in items)})

    @routes.get("/admin/ls")
    async def _admin_ls(request):
        path = request.query.get("path", "/workspace")
        if not os.path.exists(path):
            return web.json_response({"error": f"does not exist: {path}"}, status=404)
        if os.path.isfile(path):
            try:
                st = os.stat(path)
                return web.json_response({"type": "file", "size": st.st_size, "size_h": _humanize(st.st_size)})
            except OSError as e:
                return web.json_response({"error": str(e)}, status=500)
        # Directory listing
        items = []
        try:
            for entry in os.scandir(path):
                try:
                    st = entry.stat(follow_symlinks=False)
                    items.append({
                        "name": entry.name,
                        "is_dir": entry.is_dir(follow_symlinks=False),
                        "is_symlink": entry.is_symlink(),
                        "size": st.st_size if not entry.is_dir(follow_symlinks=False) else None,
                        "mtime": int(st.st_mtime),
                    })
                except (OSError, PermissionError):
                    continue
        except (OSError, PermissionError) as e:
            return web.json_response({"error": str(e)}, status=403)
        items.sort(key=lambda x: x["name"])
        return web.json_response({"path": path, "items": items})

    @routes.post("/admin/rm")
    async def _admin_rm(request):
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"error": "invalid JSON"}, status=400)
        target = body.get("path")
        if not target or not isinstance(target, str):
            return web.json_response({"error": "path required"}, status=400)
        if ".." in target.split("/"):
            return web.json_response({"error": "no traversal"}, status=400)
        if not _is_safe_path(target):
            return web.json_response({
                "error": f"path not in allowlist: {target}",
                "allowlist": list(ALLOWED_RM_PREFIXES),
            }, status=403)
        if not os.path.exists(target):
            return web.json_response({"error": "does not exist"}, status=404)
        try:
            if os.path.isfile(target) or os.path.islink(target):
                os.unlink(target)
                return web.json_response({"ok": True, "removed": target, "type": "file"})
            elif os.path.isdir(target):
                # Compute size before delete for the response
                sz = _dir_size(target)
                shutil.rmtree(target)
                return web.json_response({"ok": True, "removed": target, "type": "dir", "freed_bytes": sz, "freed_h": _humanize(sz)})
            else:
                return web.json_response({"error": "unsupported type"}, status=400)
        except (OSError, PermissionError) as e:
            return web.json_response({"error": str(e)}, status=500)
