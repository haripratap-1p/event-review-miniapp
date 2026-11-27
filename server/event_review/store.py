import sqlite3

from .config import get_settings

SCHEMA = """
CREATE TABLE IF NOT EXISTS reviews (
    item_id TEXT, kind TEXT, user_id INTEGER, user_name TEXT, verdict TEXT, note TEXT, reasons TEXT, ts TEXT,
    PRIMARY KEY (item_id, user_id));
CREATE TABLE IF NOT EXISTS visitors (user_id INTEGER PRIMARY KEY, name TEXT, username TEXT, last_seen TEXT);
"""


def db() -> sqlite3.Connection:
    get_settings().state_dir.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(get_settings().db, timeout=10)
    connection.executescript(SCHEMA)
    connection.row_factory = sqlite3.Row
    return connection


def reviews(kind: str | None = None, item_id: str | None = None) -> list[dict]:
    query, args = "SELECT * FROM reviews WHERE 1=1", []
    if kind:
        query, args = query + " AND kind=?", [*args, kind]
    if item_id:
        query, args = query + " AND item_id=?", [*args, item_id]
    with db() as connection:
        return [dict(row) for row in connection.execute(query, args)]
