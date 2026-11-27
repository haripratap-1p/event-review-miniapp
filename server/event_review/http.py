import hashlib
import hmac
import json
import mimetypes
import re
import sys
import time
import urllib.parse
from datetime import datetime
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from typing import Any

from . import items
from .config import IST, KINDS, MAX_BODY, get_settings
from .viewer import Denied, Viewer, viewer_from

_writes: dict = {}  # user_id -> recent write timestamps
CLIP_TTL = 6 * 3600  # a clip link from the detail response works this long


def _clip_signature(item_id: str, camera: str, expires: int) -> str:
    key = hashlib.sha256(b"clip:" + get_settings().token.encode()).digest()
    return hmac.new(key, f"{item_id}:{camera}:{expires}".encode(), hashlib.sha256).hexdigest()


def clip_link(item_id: str, camera: str) -> str:
    # the video element can't send X-Init-Data, so the checked detail response hands out signed links
    expires = int(time.time()) + CLIP_TTL
    return f"/api/clip/{item_id}/{camera}?exp={expires}&sig={_clip_signature(item_id, camera, expires)}"


def rate_ok(user_id: int, limit: int = 60, window: int = 60) -> bool:
    now = time.time()
    recent = [t for t in _writes.get(user_id, []) if now - t < window]
    _writes[user_id] = [*recent, now]
    return len(recent) < limit


class Handler(BaseHTTPRequestHandler):
    def _head(self, code: int, content_type: str, length: int, extra: dict | None = None) -> None:
        extra = dict(extra or {})
        self.send_response(code)
        self.send_header("Access-Control-Allow-Origin", get_settings().origin)
        self.send_header("Access-Control-Allow-Headers", "X-Init-Data, Content-Type, Range")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Expose-Headers", "Content-Range, Accept-Ranges, Content-Length")
        self.send_header("Access-Control-Max-Age", "600")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Cache-Control", extra.pop("Cache-Control", "no-store"))
        self.send_header("Content-Type", content_type)
        for name, value in extra.items():
            self.send_header(name, value)
        self.send_header("Content-Length", str(length))
        self.end_headers()

    def _json(self, code: int, body: Any) -> None:
        data = json.dumps(body, ensure_ascii=False).encode()
        self._head(code, "application/json", len(data))
        self.wfile.write(data)

    def _viewer(self) -> Viewer | None:
        try:
            return viewer_from(self.headers.get("X-Init-Data", ""))
        except Denied as e:
            self._json(e.status, {"error": str(e)})
            return None

    def _stream(self, path: Path, content_type: str, cache: str) -> None:
        # byte ranges so playback and seeking start before the whole file arrives
        size = path.stat().st_size
        start, end, code, extra = 0, size - 1, 200, {"Accept-Ranges": "bytes", "Cache-Control": cache}
        match = re.fullmatch(r"bytes=(\d*)-(\d*)", self.headers.get("Range", "").strip())
        if match and (match[1] or match[2]):
            if match[1]:
                start, end = int(match[1]), int(match[2] or size - 1)
            else:
                start, end = max(0, size - int(match[2])), size - 1
            end = min(end, size - 1)
            if start > end:
                return self._head(416, "text/plain", 0, {"Content-Range": f"bytes */{size}"})
            code, extra["Content-Range"] = 206, f"bytes {start}-{end}/{size}"
        self._head(code, content_type, end - start + 1, extra)
        if self.command == "HEAD":
            return
        try:
            with path.open("rb") as handle:
                handle.seek(start)
                left = end - start + 1
                while left > 0 and (chunk := handle.read(min(65536, left))):
                    self.wfile.write(chunk)
                    left -= len(chunk)
        except (BrokenPipeError, ConnectionResetError):
            pass  # the player dropped this range for another one

    def _clip(self, item_id: str, camera: str, query: str) -> None:
        params = urllib.parse.parse_qs(query)
        expires, signature = params.get("exp", [""])[0], params.get("sig", [""])[0]
        valid = expires.isdigit() and int(expires) > time.time()
        if not (valid and hmac.compare_digest(signature, _clip_signature(item_id, camera, int(expires)))):
            return self._json(403, {"error": "clip link expired, reopen the event"})
        item = items.find(item_id)
        path = item.clip_file(camera) if item else None
        if not path:
            return self._json(404, {"error": "no video"})
        self._stream(path, "video/mp4", "private, max-age=3600")

    def _static(self, url_path: str) -> None:
        # the built frontend, for the same-origin draft; never outside web_dir
        root = get_settings().web_dir.resolve()
        target = (root / urllib.parse.unquote(url_path).lstrip("/")).resolve()
        if not target.is_relative_to(root) or not target.is_file():
            target = root / "index.html"
        if not target.is_file():
            return self._json(404, {"error": "not found"})
        content_type = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        cache = "no-cache" if target.name == "index.html" else "public, max-age=86400"
        self._stream(target, content_type, cache)

    def log_message(self, format: str, *args: Any) -> None:
        # no query strings (clip signatures) or initData in the log
        status = args[1] if len(args) > 1 else ""
        sys.stderr.write(f"[{datetime.now(IST):%F %T}] {self.command} {self.path.split('?')[0]} {status}\n")

    def do_OPTIONS(self) -> None:
        self._head(204, "text/plain", 0)

    def do_HEAD(self) -> None:
        self.do_GET()

    def do_GET(self) -> None:
        url = urllib.parse.urlparse(self.path)
        parts = url.path.strip("/").split("/")
        if parts[:2] == ["api", "clip"] and len(parts) == 4:
            return self._clip(parts[2], parts[3], url.query)
        if not url.path.startswith("/api/"):
            if get_settings().web_dir:
                return self._static(url.path)
            return self._json(404, {"error": "not found"})
        viewer = self._viewer()
        if not viewer:
            return
        if url.path == "/api/items":
            kind = urllib.parse.parse_qs(url.query).get("kind", [""])[0]
            if kind not in KINDS:
                return self._json(400, {"error": "bad kind"})
            return self._json(200, items.listing(kind, viewer))
        if parts[:2] == ["api", "item"] and len(parts) == 3:
            item = items.find(parts[2])
            if not item:
                return self._json(404, {"error": "not found"})
            return self._json(200, items.detail(item, viewer, clip_link))
        self._json(404, {"error": "not found"})

    def do_POST(self) -> None:
        viewer = self._viewer()
        if not viewer:
            return
        if urllib.parse.urlparse(self.path).path != "/api/review":
            return self._json(404, {"error": "not found"})
        size = int(self.headers.get("Content-Length", "0") or 0)
        if size > MAX_BODY:
            return self._json(413, {"error": "too large"})
        if not rate_ok(viewer.user_id):
            return self._json(429, {"error": "too many answers, wait a minute"})
        try:
            body = json.loads(self.rfile.read(size) or b"{}")
        except ValueError:
            return self._json(400, {"error": "bad request"})
        if not isinstance(body, dict):
            return self._json(400, {"error": "bad request"})
        try:
            votes = items.vote(viewer, body.get("id"), body.get("verdict"), body.get("note", ""), body.get("reasons"))
        except items.Rejected as e:
            return self._json(e.status, {"error": str(e)})
        self._json(200, {"id": body["id"], "votes": votes})
