import hashlib
import hmac
import json
import os
import shutil
import subprocess
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable, Iterator
from http.server import ThreadingHTTPServer
from pathlib import Path

import pytest

from event_review import http, items, telegram, viewer
from event_review.config import Settings, get_settings
from event_review.http import Handler

TOKEN = "123:abc"
CHAT = "-1001"
FIXTURES = Path(__file__).parent / "fixtures"
MISSING_CLIP = "event-0c33notfrisked_cam3.mp4"  # listed in its sidecar, file never saved


class FakeTelegram:
    def __init__(self) -> None:
        self.calls: list = []  # (method, params)
        self.fail: dict = {}  # method -> error description raised once
        self.next_id = 100

    def call(self, method: str, **params: object) -> object:
        self.calls.append((method, params))
        if method in self.fail:
            raise telegram.TelegramError(f"{method}: {self.fail.pop(method)}")
        if method == "sendMessage":
            self.next_id += 1
            return {"message_id": self.next_id}
        return True

    def methods(self) -> list:
        return [m for m, _ in self.calls]


class FakeMembership:
    def __init__(self) -> None:
        self.members: set = set(range(1, 10))

    def is_member(self, user_id: int, chat: str) -> bool:
        return chat == CHAT and user_id in self.members


@pytest.fixture(scope="session")
def tiny_mp4(tmp_path_factory: pytest.TempPathFactory) -> bytes:
    # a real 2 s clip when ffmpeg exists, else plain bytes (range tests only need bytes)
    target = tmp_path_factory.mktemp("clip") / "tiny.mp4"
    if shutil.which("ffmpeg"):
        command = ["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=320x180:rate=25", "-t", "2"]
        subprocess.run([*command, "-pix_fmt", "yuv420p", str(target)], check=True)
        return target.read_bytes()
    return bytes(range(256)) * 40


@pytest.fixture(autouse=True)
def settings(tmp_path: Path, tiny_mp4: bytes, monkeypatch: pytest.MonkeyPatch) -> Iterator[Settings]:
    for name in list(os.environ):
        if name.startswith("EVENT_REVIEW_"):
            monkeypatch.delenv(name)
    shutil.copytree(FIXTURES, tmp_path / "data")
    for sidecar in (tmp_path / "data").glob("*/*/*.json"):
        try:
            clips = json.loads(sidecar.read_text())["clips"]
        except ValueError:
            continue
        for clip in clips:
            name = f"{sidecar.stem}_{clip['camera']}.mp4"
            if name != MISSING_CLIP:
                (sidecar.parent / name).write_bytes(tiny_mp4)
    monkeypatch.setenv("EVENT_REVIEW_REJECTED_DIR", str(tmp_path / "data/Rejected_events"))
    monkeypatch.setenv("EVENT_REVIEW_BOOKMARKED_DIR", str(tmp_path / "data/Bookmarked_events"))
    monkeypatch.setenv("EVENT_REVIEW_STATE_DIR", str(tmp_path / "state"))
    monkeypatch.setenv("EVENT_REVIEW_BOT_TOKEN", TOKEN)
    monkeypatch.setenv("EVENT_REVIEW_CHAT_ID", CHAT)
    monkeypatch.setenv("EVENT_REVIEW_BOT_USERNAME", "test_bot")
    monkeypatch.setenv("EVENT_REVIEW_APP_SHORT_NAME", "review")
    get_settings.cache_clear()
    monkeypatch.setattr(viewer, "membership", FakeMembership())
    monkeypatch.setattr(telegram, "client", FakeTelegram())
    http._writes.clear()
    items._cache.clear()
    yield get_settings()
    get_settings.cache_clear()


@pytest.fixture
def fake_telegram() -> FakeTelegram:
    return telegram.client


def sign(fields: dict, token: str = TOKEN) -> str:
    check = "\n".join(f"{k}={v}" for k, v in sorted(fields.items()))
    secret = hmac.new(b"WebAppData", token.encode(), hashlib.sha256).digest()
    return urllib.parse.urlencode({**fields, "hash": hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()})


def init_data(user_id: int, age: int = 0, token: str = TOKEN) -> str:
    user = json.dumps({"id": user_id, "first_name": f"User{user_id}"})
    return sign({"auth_date": str(int(time.time()) - age), "query_id": "q", "user": user}, token)


@pytest.fixture
def server(settings: Settings) -> Iterator[int]:
    srv = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=srv.serve_forever, args=(0.05,), daemon=True).start()
    yield srv.server_port
    srv.shutdown()
    srv.server_close()


@pytest.fixture
def get(server: int) -> Callable[..., tuple]:
    # raw request: (status, body bytes, headers)
    def request(path: str, headers: dict | None = None, body: dict | None = None) -> tuple:
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(f"http://127.0.0.1:{server}{path}", data, headers or {})
        try:
            with urllib.request.urlopen(req) as response:
                return response.status, response.read(), response.headers
        except urllib.error.HTTPError as e:
            return e.code, e.read(), e.headers

    return request


@pytest.fixture
def api(get: Callable[..., tuple]) -> Callable[..., tuple]:
    # signed-in JSON call as a user: (status, json)
    def call(path: str, user_id: int = 1, body: dict | None = None, init: str | None = None) -> tuple:
        status, data, _ = get(path, {"X-Init-Data": init if init is not None else init_data(user_id)}, body)
        return status, json.loads(data or b"null")

    return call
