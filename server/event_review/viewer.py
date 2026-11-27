import time
from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

from .config import IST, MEMBER_OK, get_settings
from .store import db
from .telegram import call, check_init_data


class Membership(Protocol):
    def is_member(self, user_id: int, chat: str) -> bool: ...


class TelegramMembership:
    def __init__(self) -> None:
        self._seen: dict = {}  # (chat, user_id) -> (is_member, checked_at)

    def is_member(self, user_id: int, chat: str) -> bool:
        member, checked_at = self._seen.get((chat, user_id), (False, 0))
        if time.time() - checked_at > 3600:
            try:
                member = call("getChatMember", chat_id=chat, user_id=user_id)["status"] in MEMBER_OK
            except Exception:
                member = False
            self._seen[(chat, user_id)] = (member, time.time())
        return member


membership: Membership = TelegramMembership()


class Denied(Exception):
    def __init__(self, status: int, error: str) -> None:
        super().__init__(error)
        self.status = status


@dataclass(frozen=True)
class Viewer:
    user_id: int
    first_name: str
    name: str


def _full_name(user: dict) -> str:
    parts = filter(None, [user.get("first_name"), user.get("last_name")])
    return " ".join(parts) or user.get("username") or str(user["id"])


def viewer_from(init_data: str) -> Viewer:
    settings = get_settings()
    user = check_init_data(init_data, settings.token, settings.max_init_age)
    if not user:
        raise Denied(401, "session expired")
    if not settings.chat or not membership.is_member(user["id"], settings.chat):
        raise Denied(403, "not a group member")
    viewer = Viewer(user["id"], user.get("first_name", ""), _full_name(user)[:80])
    with db() as connection:
        connection.execute(
            "INSERT INTO visitors VALUES (?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET name=excluded.name, "
            "username=excluded.username, last_seen=excluded.last_seen",
            (viewer.user_id, viewer.name, user.get("username", ""), datetime.now(IST).isoformat(timespec="seconds")),
        )
    return viewer
