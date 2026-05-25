import logging
import os
import secrets
import time
import uuid

from aiohttp import web

import auth
import comfy_client
import db
import workflows

from server import PromptServer

log = logging.getLogger("foxy")

routes = PromptServer.instance.routes

WEB_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "web")
MAX_UPLOAD_BYTES = 12 * 1024 * 1024  # 12 MB


# -------------------- helpers --------------------

def _serve_file(path: str, ctype: str = "text/html; charset=utf-8") -> web.Response:
    with open(path, "rb") as f:
        body = f.read()
    return web.Response(body=body, content_type=ctype.split(";")[0], charset="utf-8")


def _json(data, status: int = 200) -> web.Response:
    return web.json_response(data, status=status)


def _require_user(request) -> int:
    uid = auth.user_id_from_request(request)
    if uid is None:
        raise web.HTTPUnauthorized(reason="not authenticated")
    return uid


async def _read_body_limited(request) -> bytes:
    """Read request body, refusing if larger than MAX_UPLOAD_BYTES."""
    data = bytearray()
    async for chunk in request.content.iter_chunked(64 * 1024):
        data.extend(chunk)
        if len(data) > MAX_UPLOAD_BYTES:
            raise web.HTTPRequestEntityTooLarge(
                max_size=MAX_UPLOAD_BYTES, actual_size=len(data)
            )
    return bytes(data)


# -------------------- pages --------------------

@routes.get("/foxy")
@routes.get("/foxy/")
async def page_root(request):
    return _serve_file(os.path.join(WEB_DIR, "index.html"))


@routes.get("/photostudio")
async def page_redirect_old(request):
    return web.HTTPFound("/foxy")


# -------------------- auth --------------------

@routes.post("/foxy/api/login")
async def api_login(request):
    body = await request.json()
    username = (body.get("username") or "").strip()
    password = body.get("password") or ""
    if not username or not password:
        return _json({"error": "username and password required"}, 400)
    uid = db.verify_user(username, password)
    if uid is None:
        return _json({"error": "invalid credentials"}, 401)
    token = auth.make_token(uid)
    resp = _json({"ok": True, "username": username})
    resp.set_cookie(
        auth.SESSION_COOKIE,
        token,
        max_age=auth.SESSION_MAX_AGE,
        httponly=True,
        samesite="Lax",
        path="/",
    )
    return resp


@routes.post("/foxy/api/logout")
async def api_logout(request):
    resp = _json({"ok": True})
    resp.del_cookie(auth.SESSION_COOKIE, path="/")
    return resp


@routes.get("/foxy/api/me")
async def api_me(request):
    uid = auth.user_id_from_request(request)
    if uid is None:
        return _json({"authenticated": False})
    u = db.get_user(uid)
    if not u:
        return _json({"authenticated": False})
    return _json({"authenticated": True, "id": u["id"], "username": u["username"]})


@routes.post("/foxy/api/change_password")
async def api_change_password(request):
    uid = _require_user(request)
    body = await request.json()
    old = body.get("old_password") or ""
    new = body.get("new_password") or ""
    if len(new) < 6:
        return _json({"error": "new password must be at least 6 chars"}, 400)
    u = db.get_user(uid)
    if not u or db.verify_user(u["username"], old) != uid:
        return _json({"error": "current password incorrect"}, 401)
    db.change_password(uid, new)
    return _json({"ok": True})


# -------------------- characters --------------------

@routes.get("/foxy/api/characters")
async def api_characters_list(request):
    uid = _require_user(request)
    rows = db.list_characters(uid)
    return _json([dict(r) for r in rows])


@routes.post("/foxy/api/characters")
async def api_characters_create(request):
    uid = _require_user(request)
    body = await request.json()
    name = (body.get("name") or "").strip()
    if not name:
        return _json({"error": "name required"}, 400)
    if len(name) > 60:
        return _json({"error": "name too long"}, 400)
    cid = db.create_character(uid, name)
    return _json({"id": cid, "name": name})


@routes.delete("/foxy/api/characters/{id}")
async def api_characters_delete(request):
    uid = _require_user(request)
    cid = int(request.match_info["id"])
    char = db.get_character(cid, uid)
    if not char:
        return _json({"error": "not found"}, 404)
    photos = db.list_photos(cid)
    db.delete_character(cid, uid)
    for p in photos:
        try:
            os.unlink(os.path.join(db.REFS_DIR, p["filename"]))
        except OSError:
            pass
    return _json({"ok": True})


@routes.get("/foxy/api/characters/{id}/photos")
async def api_photos_list(request):
    uid = _require_user(request)
    cid = int(request.match_info["id"])
    if not db.get_character(cid, uid):
        return _json({"error": "not found"}, 404)
    rows = db.list_photos(cid)
    return _json([dict(r) for r in rows])


@routes.post("/foxy/api/characters/{id}/photos")
async def api_photos_upload(request):
    uid = _require_user(request)
    cid = int(request.match_info["id"])
    if not db.get_character(cid, uid):
        return _json({"error": "not found"}, 404)

    reader = await request.multipart()
    saved = []
    while True:
        field = await reader.next()
        if field is None:
            break
        if field.name != "photo":
            continue
        orig = field.filename or "upload"
        ext = os.path.splitext(orig)[1].lower() or ".jpg"
        if ext not in {".jpg", ".jpeg", ".png", ".webp"}:
            return _json({"error": f"unsupported file type: {ext}"}, 400)
        new_name = f"c{cid}_{int(time.time())}_{secrets.token_hex(4)}{ext}"
        path = os.path.join(db.REFS_DIR, new_name)
        size = 0
        with open(path, "wb") as f:
            while True:
                chunk = await field.read_chunk(64 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    f.close()
                    os.unlink(path)
                    return _json({"error": "file too large"}, 413)
                f.write(chunk)
        pid = db.add_photo(cid, new_name)
        saved.append({"id": pid, "filename": new_name})
    return _json({"uploaded": saved})


@routes.delete("/foxy/api/photos/{id}")
async def api_photo_delete(request):
    uid = _require_user(request)
    pid = int(request.match_info["id"])
    fname = db.delete_photo(pid, uid)
    if not fname:
        return _json({"error": "not found"}, 404)
    try:
        os.unlink(os.path.join(db.REFS_DIR, fname))
    except OSError:
        pass
    return _json({"ok": True})


# -------------------- generation --------------------

ASPECT_RATIOS = {
    "portrait": (832, 1216),
    "square": (1024, 1024),
    "landscape": (1216, 832),
}


@routes.post("/foxy/api/generate")
async def api_generate(request):
    uid = _require_user(request)
    body = await request.json()
    prompt = (body.get("prompt") or "").strip()
    if not prompt:
        return _json({"error": "prompt required"}, 400)

    negative = body.get("negative_prompt") or workflows.DEFAULT_NEGATIVE
    aspect = body.get("aspect") or "portrait"
    if aspect not in ASPECT_RATIOS:
        return _json({"error": "invalid aspect"}, 400)
    width, height = ASPECT_RATIOS[aspect]

    try:
        steps = int(body.get("steps") or 28)
        steps = max(10, min(60, steps))
        cfg = float(body.get("cfg") or 4.5)
        cfg = max(1.0, min(10.0, cfg))
        seed = int(body.get("seed")) if body.get("seed") else secrets.randbits(53)
        face_weight = float(body.get("face_weight") or 1.0)
        face_weight = max(0.1, min(2.0, face_weight))
    except (TypeError, ValueError):
        return _json({"error": "invalid numeric parameter"}, 400)

    character_id = body.get("character_id")
    face_filename = None
    if character_id is not None:
        try:
            cid = int(character_id)
        except (TypeError, ValueError):
            return _json({"error": "invalid character_id"}, 400)
        char = db.get_character(cid, uid)
        if not char:
            return _json({"error": "character not found"}, 404)
        photo = db.first_photo(cid)
        if not photo:
            return _json({"error": "character has no reference photos"}, 400)
        # upload reference to ComfyUI's input dir
        path = os.path.join(db.REFS_DIR, photo["filename"])
        with open(path, "rb") as f:
            file_bytes = f.read()
        ct = "image/png" if path.lower().endswith(".png") else "image/jpeg"
        face_filename = await comfy_client.upload_image(
            file_bytes, photo["filename"], content_type=ct
        )
        wf = workflows.text2img_with_face(
            face_filename=face_filename,
            prompt=prompt,
            negative=negative,
            width=width,
            height=height,
            steps=steps,
            cfg=cfg,
            seed=seed,
            face_weight=face_weight,
        )
    else:
        cid = None
        wf = workflows.text2img(
            prompt=prompt,
            negative=negative,
            width=width,
            height=height,
            steps=steps,
            cfg=cfg,
            seed=seed,
        )

    client_id = f"foxy-{uid}-{uuid.uuid4().hex[:8]}"
    try:
        prompt_id = await comfy_client.submit_prompt(wf, client_id)
        outputs = await comfy_client.wait_for_result(prompt_id, timeout=300.0)
    except Exception as e:
        log.exception("generate failed")
        return _json({"error": str(e)}, 500)

    # Find first image in outputs
    out_image = None
    for node_id, out in outputs.items():
        for img in out.get("images", []) or []:
            out_image = img
            break
        if out_image:
            break
    if not out_image:
        return _json({"error": "no image in result"}, 500)

    try:
        img_bytes = await comfy_client.fetch_output(
            out_image["filename"], out_image.get("subfolder", ""), out_image.get("type", "output")
        )
    except Exception as e:
        return _json({"error": f"fetch result: {e}"}, 500)

    fname = f"gen_{int(time.time())}_{secrets.token_hex(4)}.png"
    with open(os.path.join(db.OUT_DIR, fname), "wb") as f:
        f.write(img_bytes)

    gen_id = db.insert_generation(
        uid, cid if character_id is not None else None,
        prompt, negative, seed, steps, width, height, cfg, fname,
    )
    return _json({
        "id": gen_id,
        "filename": fname,
        "prompt": prompt,
        "seed": seed,
        "width": width,
        "height": height,
    })


# -------------------- gallery --------------------

@routes.get("/foxy/api/gallery")
async def api_gallery(request):
    uid = _require_user(request)
    try:
        limit = max(1, min(100, int(request.query.get("limit", "30"))))
    except ValueError:
        limit = 30
    before_id = request.query.get("before")
    before = int(before_id) if before_id and before_id.isdigit() else None
    rows = db.list_generations(uid, limit=limit, before_id=before)
    return _json([dict(r) for r in rows])


@routes.delete("/foxy/api/generations/{id}")
async def api_gallery_delete(request):
    uid = _require_user(request)
    gid = int(request.match_info["id"])
    gen = db.get_generation(gid, uid)
    if not gen:
        return _json({"error": "not found"}, 404)
    db.soft_delete_generation(gid, uid)
    try:
        os.unlink(os.path.join(db.OUT_DIR, gen["filename"]))
    except OSError:
        pass
    return _json({"ok": True})


# -------------------- image serving --------------------

def _safe_filename(name: str) -> bool:
    return name and "/" not in name and "\\" not in name and ".." not in name


@routes.get("/foxy/img/ref/{filename}")
async def img_reference(request):
    _require_user(request)
    fname = request.match_info["filename"]
    if not _safe_filename(fname):
        return _json({"error": "bad filename"}, 400)
    path = os.path.join(db.REFS_DIR, fname)
    if not os.path.exists(path):
        return _json({"error": "not found"}, 404)
    return web.FileResponse(path)


@routes.get("/foxy/img/out/{filename}")
async def img_output(request):
    _require_user(request)
    fname = request.match_info["filename"]
    if not _safe_filename(fname):
        return _json({"error": "bad filename"}, 400)
    path = os.path.join(db.OUT_DIR, fname)
    if not os.path.exists(path):
        return _json({"error": "not found"}, 404)
    return web.FileResponse(path)
