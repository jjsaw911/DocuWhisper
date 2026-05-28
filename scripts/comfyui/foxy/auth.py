import base64
import hmac
import hashlib
import os
import secrets
import time
from typing import Optional

import db

SESSION_COOKIE = "foxy_session"
SESSION_MAX_AGE = 30 * 86400  # 30 days
SECRET_PATH = os.path.join(db.DATA_DIR, "session.key")


def _secret() -> bytes:
    if not os.path.exists(SECRET_PATH):
        os.makedirs(os.path.dirname(SECRET_PATH), exist_ok=True)
        with open(SECRET_PATH, "wb") as f:
            f.write(secrets.token_bytes(32))
        os.chmod(SECRET_PATH, 0o600)
    with open(SECRET_PATH, "rb") as f:
        return f.read()


def make_token(user_id: int) -> str:
    payload = f"{user_id}:{int(time.time())}"
    sig = hmac.new(_secret(), payload.encode(), hashlib.sha256).hexdigest()[:24]
    raw = f"{payload}:{sig}".encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def parse_token(token: str) -> Optional[int]:
    try:
        padded = token + "=" * (-len(token) % 4)
        decoded = base64.urlsafe_b64decode(padded).decode()
        user_id_s, ts_s, sig = decoded.rsplit(":", 2)
        payload = f"{user_id_s}:{ts_s}"
        expected = hmac.new(_secret(), payload.encode(), hashlib.sha256).hexdigest()[:24]
        if not hmac.compare_digest(sig, expected):
            return None
        if int(time.time()) - int(ts_s) > SESSION_MAX_AGE:
            return None
        return int(user_id_s)
    except Exception:
        return None


def user_id_from_request(request) -> Optional[int]:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        return None
    return parse_token(token)
