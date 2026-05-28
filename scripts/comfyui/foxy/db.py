import os
import sqlite3
import hashlib
import secrets
from contextlib import contextmanager
from typing import Iterator, Optional

DATA_DIR = os.environ.get("FOXY_DATA_DIR", "/workspace/foxy")
DB_PATH = os.path.join(DATA_DIR, "app.db")
REFS_DIR = os.path.join(DATA_DIR, "references")
OUT_DIR = os.path.join(DATA_DIR, "outputs")
INITIAL_CREDS = os.path.join(DATA_DIR, "initial_creds.txt")

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS characters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS generations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    character_id INTEGER REFERENCES characters(id) ON DELETE SET NULL,
    prompt TEXT NOT NULL,
    negative_prompt TEXT,
    seed INTEGER,
    steps INTEGER,
    width INTEGER,
    height INTEGER,
    cfg REAL,
    filename TEXT NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE INDEX IF NOT EXISTS idx_gen_user_created ON generations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chars_user ON characters(user_id);
CREATE INDEX IF NOT EXISTS idx_photos_char ON photos(character_id);
"""


def _hash(password: str, salt: str) -> str:
    return hashlib.scrypt(
        password.encode(), salt=salt.encode(), n=2**14, r=8, p=1, dklen=32
    ).hex()


@contextmanager
def conn() -> Iterator[sqlite3.Connection]:
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys = ON")
    try:
        yield c
        c.commit()
    finally:
        c.close()


def init() -> None:
    os.makedirs(REFS_DIR, exist_ok=True)
    os.makedirs(OUT_DIR, exist_ok=True)
    with conn() as c:
        c.executescript(SCHEMA)
        existing = c.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        if existing == 0:
            seed = os.environ.get("FOXY_DEFAULT_USERS", "").strip()
            pairs = []
            if seed:
                for item in seed.split(","):
                    u, _, p = item.strip().partition(":")
                    if u and p:
                        pairs.append((u, p))
            if not pairs:
                pairs = [("owner", secrets.token_urlsafe(9)), ("guest", secrets.token_urlsafe(9))]
                with open(INITIAL_CREDS, "w") as f:
                    f.write("Initial login credentials (delete this file after copying)\n\n")
                    for u, p in pairs:
                        f.write(f"  {u}: {p}\n")
                os.chmod(INITIAL_CREDS, 0o600)
            for u, p in pairs:
                salt = secrets.token_hex(16)
                c.execute(
                    "INSERT INTO users (username, password_hash, salt) VALUES (?,?,?)",
                    (u, _hash(p, salt), salt),
                )


def verify_user(username: str, password: str) -> Optional[int]:
    with conn() as c:
        row = c.execute(
            "SELECT id, password_hash, salt FROM users WHERE username = ?", (username,)
        ).fetchone()
    if not row:
        return None
    if _hash(password, row["salt"]) == row["password_hash"]:
        return row["id"]
    return None


def change_password(user_id: int, new_password: str) -> None:
    salt = secrets.token_hex(16)
    with conn() as c:
        c.execute(
            "UPDATE users SET password_hash = ?, salt = ? WHERE id = ?",
            (_hash(new_password, salt), salt, user_id),
        )


def get_user(user_id: int):
    with conn() as c:
        return c.execute("SELECT id, username FROM users WHERE id = ?", (user_id,)).fetchone()


def list_characters(user_id: int):
    with conn() as c:
        return c.execute(
            """SELECT c.id, c.name, c.created_at,
                      (SELECT COUNT(*) FROM photos p WHERE p.character_id = c.id) AS photo_count,
                      (SELECT filename FROM photos p WHERE p.character_id = c.id
                       ORDER BY p.created_at ASC LIMIT 1) AS thumb
               FROM characters c
               WHERE c.user_id = ?
               ORDER BY c.created_at DESC""",
            (user_id,),
        ).fetchall()


def get_character(character_id: int, user_id: int):
    with conn() as c:
        return c.execute(
            "SELECT id, name, created_at FROM characters WHERE id = ? AND user_id = ?",
            (character_id, user_id),
        ).fetchone()


def create_character(user_id: int, name: str) -> int:
    with conn() as c:
        cur = c.execute(
            "INSERT INTO characters (user_id, name) VALUES (?, ?)", (user_id, name)
        )
        return cur.lastrowid


def delete_character(character_id: int, user_id: int) -> bool:
    with conn() as c:
        cur = c.execute(
            "DELETE FROM characters WHERE id = ? AND user_id = ?", (character_id, user_id)
        )
        return cur.rowcount > 0


def list_photos(character_id: int):
    with conn() as c:
        return c.execute(
            "SELECT id, filename, created_at FROM photos WHERE character_id = ? ORDER BY created_at ASC",
            (character_id,),
        ).fetchall()


def add_photo(character_id: int, filename: str) -> int:
    with conn() as c:
        cur = c.execute(
            "INSERT INTO photos (character_id, filename) VALUES (?, ?)",
            (character_id, filename),
        )
        return cur.lastrowid


def get_photo(photo_id: int, user_id: int):
    """Returns photo row only if it belongs to a character owned by user_id."""
    with conn() as c:
        return c.execute(
            """SELECT p.id, p.character_id, p.filename
               FROM photos p
               JOIN characters c ON c.id = p.character_id
               WHERE p.id = ? AND c.user_id = ?""",
            (photo_id, user_id),
        ).fetchone()


def first_photo(character_id: int):
    with conn() as c:
        return c.execute(
            "SELECT id, filename FROM photos WHERE character_id = ? ORDER BY created_at ASC LIMIT 1",
            (character_id,),
        ).fetchone()


def delete_photo(photo_id: int, user_id: int) -> Optional[str]:
    """Returns the filename of the deleted photo (so caller can unlink it), or None."""
    with conn() as c:
        row = get_photo(photo_id, user_id)
        if not row:
            return None
        c.execute("DELETE FROM photos WHERE id = ?", (photo_id,))
        return row["filename"]


def insert_generation(
    user_id: int,
    character_id: Optional[int],
    prompt: str,
    negative_prompt: str,
    seed: int,
    steps: int,
    width: int,
    height: int,
    cfg: float,
    filename: str,
) -> int:
    with conn() as c:
        cur = c.execute(
            """INSERT INTO generations
               (user_id, character_id, prompt, negative_prompt, seed, steps, width, height, cfg, filename)
               VALUES (?,?,?,?,?,?,?,?,?,?)""",
            (user_id, character_id, prompt, negative_prompt, seed, steps, width, height, cfg, filename),
        )
        return cur.lastrowid


def list_generations(user_id: int, limit: int = 50, before_id: Optional[int] = None):
    with conn() as c:
        if before_id:
            return c.execute(
                """SELECT g.id, g.prompt, g.filename, g.width, g.height, g.created_at,
                          g.character_id, c.name AS character_name
                   FROM generations g
                   LEFT JOIN characters c ON c.id = g.character_id
                   WHERE g.user_id = ? AND g.deleted = 0 AND g.id < ?
                   ORDER BY g.id DESC LIMIT ?""",
                (user_id, before_id, limit),
            ).fetchall()
        return c.execute(
            """SELECT g.id, g.prompt, g.filename, g.width, g.height, g.created_at,
                      g.character_id, c.name AS character_name
               FROM generations g
               LEFT JOIN characters c ON c.id = g.character_id
               WHERE g.user_id = ? AND g.deleted = 0
               ORDER BY g.id DESC LIMIT ?""",
            (user_id, limit),
        ).fetchall()


def get_generation(gen_id: int, user_id: int):
    with conn() as c:
        return c.execute(
            "SELECT * FROM generations WHERE id = ? AND user_id = ? AND deleted = 0",
            (gen_id, user_id),
        ).fetchone()


def soft_delete_generation(gen_id: int, user_id: int) -> bool:
    with conn() as c:
        cur = c.execute(
            "UPDATE generations SET deleted = 1 WHERE id = ? AND user_id = ?",
            (gen_id, user_id),
        )
        return cur.rowcount > 0
