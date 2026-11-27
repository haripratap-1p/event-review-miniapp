import json
import os
import re
import subprocess
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

from .config import IST, KINDS, MAX_NOTE, VERDICTS, get_settings
from .store import db, reviews
from .viewer import Viewer

PARTS = {
    "neck": "Neck",
    "shoulders": "Shoulders",
    "underarms": "Underarms",
    "hip_waist": "Hip/Waist",
    "left_knee": "Left knee",
    "right_knee": "Right knee",
    "left_ankle": "Left ankle",
    "right_ankle": "Right ankle",
}
STEM = {"reject": re.compile(r"event-[\w-]+"), "bookmark": re.compile(r"bookmark-[\w-]+")}
CAMERA = re.compile(r"\w{1,32}")
MAX_REASONS, MAX_REASON = 10, 60
_cache: dict = {}  # sidecar path -> (mtime, parsed json)


class Rejected(Exception):
    def __init__(self, error: str, status: int = 400) -> None:
        super().__init__(error)
        self.status = status


@dataclass(frozen=True)
class Item:
    id: str
    kind: str
    number: int
    folder: Path
    request: dict
    cameras: tuple
    clips: tuple

    @property
    def ts(self) -> float:
        return float(self.request.get("ts") or 0)

    def original(self, camera: str) -> Path:
        return self.folder / f"{self.id}_{camera}.mp4"

    def proxy(self, camera: str) -> Path:
        return get_settings().proxies_dir / f"{self.id}_{camera}.mp4"

    def clip_file(self, camera: str) -> Path | None:
        # 720p proxy when made, else the original; only cameras listed in the sidecar
        if camera not in self.cameras:
            return None
        return next((f for f in (self.proxy(camera), self.original(camera)) if f.is_file()), None)


def _read(path: Path) -> dict | None:
    try:
        mtime = path.stat().st_mtime
        if path not in _cache or _cache[path][0] != mtime:
            _cache[path] = (mtime, json.loads(path.read_text()))
        data = _cache[path][1]
    except (OSError, ValueError):
        return None
    return data if isinstance(data, dict) and isinstance(data.get("request"), dict) else None


def scan(kind: str) -> list[Item]:
    found = []
    for path in get_settings().base_dir(kind).glob("*/*.json"):
        data = _read(path) if STEM[kind].fullmatch(path.stem) else None
        if not data:
            continue
        clips = tuple(
            c for c in data.get("clips") or [] if isinstance(c, dict) and CAMERA.fullmatch(str(c.get("camera")))
        )
        found.append((path, data["request"], clips))
    found.sort(key=lambda f: (float(f[1].get("ts") or 0), f[0].stem))
    return [
        Item(path.stem, kind, number, path.parent, request, tuple(c["camera"] for c in clips), clips)
        for number, (path, request, clips) in enumerate(found, 1)
    ]


def find(item_id: Any) -> Item | None:
    # ids are looked up in the scanned index only; nothing from the client becomes a path
    if not isinstance(item_id, str):
        return None
    kind = next((k for k in KINDS if STEM[k].fullmatch(item_id)), None)
    return next((i for i in scan(kind) if i.id == item_id), None) if kind else None


def time_ist(ts: float) -> str:
    moment = datetime.fromtimestamp(ts, IST)
    return f"{moment.day} {moment:%b %Y, %I:%M:%S %p}"


def result(request: dict) -> dict:
    # same wording as the Telegram captions
    frisked, points = request.get("frisked"), request.get("checkpoints") or {}
    if frisked is None:
        label = str(request.get("event_type") or "-").replace("_", " ").capitalize()
        return {"label": label, "tone": "neutral", "missed": [], "checked": []}
    if frisked is False:
        return {"label": "Not frisked", "tone": "not_frisked", "missed": list(PARTS.values()), "checked": []}
    if not points:
        return {"label": "Frisked", "tone": "neutral", "missed": [], "checked": []}
    missed = [label for key, label in PARTS.items() if points.get(key) is False]
    checked = [label for key, label in PARTS.items() if points.get(key) is True]
    if missed:
        return {"label": "Partial frisk", "tone": "partial", "missed": missed, "checked": checked}
    return {"label": "Complete frisk", "tone": "complete", "missed": [], "checked": checked}


def majority(votes: list) -> str | None:
    # majority of reviewers; a tie goes to the latest vote
    if not votes:
        return None
    ok = sum(_is_ok(v["verdict"]) for v in votes)
    bad = len(votes) - ok
    if ok != bad:
        return "ok" if ok > bad else "bad"
    return "ok" if _is_ok(max(votes, key=lambda v: v["ts"])["verdict"]) else "bad"


def _is_ok(verdict: str) -> bool:
    return verdict in ("agree", "valid")


def _summary(item: Item) -> dict:
    request = item.request
    out = {
        "id": item.id,
        "kind": item.kind,
        "number": item.number,
        "ts": item.ts,
        "time_ist": time_ist(item.ts),
        "actor": request.get("actor_name") or "-",
        "cameras": list(item.cameras),
        "has_video": any(item.original(c).is_file() or item.proxy(c).is_file() for c in item.cameras),
    }
    if item.kind == "reject":
        return {
            **out,
            "event_type": request.get("event_type") or "-",
            "result": result(request),
            "subject": request.get("subject_name") or "-",
            "performer": request.get("performer_name") or "-",
            "reason": request.get("reason") or "-",
        }
    return {**out, "bookmark_name": request.get("bookmark_name") or "-"}


def _votes(rows: list, viewer: Viewer) -> dict:
    # team counts and notes stay hidden until this viewer has answered (no copying)
    mine = next((r for r in rows if r["user_id"] == viewer.user_id), None)
    out = {
        "mine": mine["verdict"] if mine else None,
        "my_note": mine["note"] if mine else "",
        "my_reasons": json.loads(mine["reasons"] or "[]") if mine else [],
        "ok": None,
        "bad": None,
        "result": None,
        "notes": [],
    }
    if mine:
        ok = sum(_is_ok(r["verdict"]) for r in rows)
        notes = [
            {
                "name": r["user_name"],
                "verdict": r["verdict"],
                "note": r["note"],
                "reasons": json.loads(r["reasons"] or "[]"),
            }
            for r in sorted(rows, key=lambda r: r["ts"])
            if r["note"] or r["reasons"] not in (None, "[]")
        ]
        out.update(ok=ok, bad=len(rows) - ok, result=majority(rows), notes=notes)
    return out


def listing(kind: str, viewer: Viewer) -> dict:
    by_item: dict = {}
    for row in reviews(kind=kind):
        by_item.setdefault(row["item_id"], []).append(row)
    items = []
    for item in scan(kind):
        rows = by_item.get(item.id, [])
        mine = next((r["verdict"] for r in rows if r["user_id"] == viewer.user_id), None)
        items.append({**_summary(item), "mine": mine, "team": majority(rows) if mine else None})
    return {
        "me": viewer.first_name,
        "kind": kind,
        "items": items,
        "total": len(items),
        "to_review": sum(1 for i in items if not i["mine"]),
    }


def detail(item: Item, viewer: Viewer, clip_link: Any) -> dict:
    request = item.request
    clips = [
        {"camera": c["camera"], "url": clip_link(item.id, c["camera"]), "start": c.get("start"), "end": c.get("end")}
        for c in item.clips
        if item.clip_file(c["camera"])
    ]
    return {
        **_summary(item),
        "event_id": request.get("event_id") or request.get("bookmark_id") or item.id,
        "description": request.get("description") or "",
        "clips": clips,
        "votes": _votes(reviews(item_id=item.id), viewer),
    }


def vote(viewer: Viewer, item_id: Any, verdict: Any, note: Any = "", reasons: Any = None) -> dict:
    # one answer per person and item; a later answer replaces it, "clear" removes it
    item = find(item_id)
    if not item:
        raise Rejected("not found", 404)
    if verdict not in (*VERDICTS[item.kind], "clear"):
        raise Rejected("bad verdict")
    reasons = [] if reasons is None else reasons
    if not isinstance(note, str) or len(note) > MAX_NOTE:
        raise Rejected("bad note")
    if (
        not isinstance(reasons, list)
        or len(reasons) > MAX_REASONS
        or not all(isinstance(r, str) and 0 < len(r) <= MAX_REASON for r in reasons)
    ):
        raise Rejected("bad reasons")
    with db() as connection:
        if verdict == "clear":
            connection.execute("DELETE FROM reviews WHERE item_id=? AND user_id=?", (item.id, viewer.user_id))
        else:
            connection.execute(
                "INSERT OR REPLACE INTO reviews VALUES (?,?,?,?,?,?,?,?)",
                (
                    item.id,
                    item.kind,
                    viewer.user_id,
                    viewer.name,
                    verdict,
                    note.strip(),
                    json.dumps(reasons, ensure_ascii=False),
                    datetime.now(IST).isoformat(),
                ),
            )
    return _votes(reviews(item_id=item.id), viewer)


def make_proxies() -> int:
    # 720p copies for phones over the tunnel; originals untouched, existing proxies skipped
    proxies = get_settings().proxies_dir
    proxies.mkdir(parents=True, exist_ok=True)
    made = 0
    for kind in KINDS:
        for item in scan(kind):
            for camera in item.cameras:
                source, target = item.original(camera), item.proxy(camera)
                if target.exists() or not source.is_file():
                    continue
                partial = target.with_name(f"{target.stem}.partial.mp4")
                command = ["nice", "-n", "19", "ffmpeg", "-y", "-loglevel", "error", "-i", str(source)]
                command += ["-vf", "scale=-2:720", "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-an"]
                command += ["-movflags", "+faststart", str(partial)]
                try:
                    subprocess.run(command, check=True)
                    os.replace(partial, target)
                    made += 1
                except (OSError, subprocess.CalledProcessError) as e:
                    print(f"proxy failed for {target.name}: {e}", flush=True)
                finally:
                    partial.unlink(missing_ok=True)
    return made
