import time

from conftest import init_data

from event_review import http


def test_access_needs_valid_init_data_and_membership(api) -> None:
    assert api("/api/items?kind=reject", init="") == (401, {"error": "session expired"})
    assert api("/api/items?kind=reject", init=init_data(1, age=90000))[0] == 401
    assert api("/api/items?kind=reject", init=init_data(1).replace("User1", "User2"))[0] == 401
    assert api("/api/items?kind=reject", 50) == (403, {"error": "not a group member"})
    assert api("/api/items?kind=other", 1)[0] == 400


def test_listing(api) -> None:
    code, body = api("/api/items?kind=reject", 1)
    assert code == 200 and body["me"] == "User1" and body["total"] == 5 and body["to_review"] == 5
    first, second = body["items"][:2]
    assert first["number"] == 1 and first["result"]["label"] == "Frisking" and first["subject"] == "-"
    assert first["has_video"] is False and first["cameras"] == []
    assert second["result"]["label"] == "Partial frisk" and second["result"]["missed"] == ["Neck"]
    assert second["time_ist"] == "23 Nov 2026, 03:12:18 PM" and second["actor"] == "Santosh Kumar"
    assert second["cameras"] == ["cam1", "cam2"] and second["mine"] is None and second["team"] is None
    code, body = api("/api/items?kind=bookmark", 1)
    assert [i["bookmark_name"] for i in body["items"]] == ["Suspicious bag", "Crowd at entry"]


def test_detail_hands_out_signed_clips(api) -> None:
    code, body = api("/api/item/event-0c33notfrisked", 1)
    assert code == 200 and body["number"] == 3 and body["result"]["label"] == "Not frisked"
    assert [c["camera"] for c in body["clips"]] == ["cam1", "cam2"]  # cam3 listed but not saved
    assert body["clips"][0]["url"].startswith("/api/clip/event-0c33notfrisked/cam1?exp=")
    assert body["votes"] == {
        "mine": None,
        "my_note": "",
        "my_reasons": [],
        "ok": None,
        "bad": None,
        "result": None,
        "notes": [],
    }
    assert api("/api/item/event-0b22older", 1)[1]["clips"] == []
    assert api("/api/item/..%2F..%2Fetc%2Fpasswd", 1)[0] == 404
    assert api("/api/item/event-nope", 1)[0] == 404


def test_clip_ranges_and_signature(api, get, tiny_mp4: bytes, monkeypatch) -> None:
    link = api("/api/item/event-0a11partial", 1)[1]["clips"][0]["url"]
    size = len(tiny_mp4)
    status, data, headers = get(link)  # no X-Init-Data needed
    assert status == 200 and data == tiny_mp4 and headers["Content-Type"] == "video/mp4"
    assert headers["Accept-Ranges"] == "bytes"
    status, data, headers = get(link, {"Range": "bytes=0-1"})
    assert status == 206 and data == tiny_mp4[:2] and headers["Content-Range"] == f"bytes 0-1/{size}"
    status, data, headers = get(link, {"Range": "bytes=-3"})
    assert status == 206 and data == tiny_mp4[-3:]
    assert get(link, {"Range": f"bytes={size + 5}-"})[0] == 416
    assert get(link.replace("/cam1?", "/cam2?"))[0] == 403  # a link opens only its own camera
    assert get(link.replace("event-0a11partial", "event-0e55complete"))[0] == 403
    assert get("/api/clip/event-0a11partial/cam1")[0] == 403
    assert get(link.split("&sig=")[0] + "&sig=" + "0" * 64)[0] == 403
    signed = http.clip_link("event-0a11partial", "..%2F..%2Fetc")
    assert get(signed)[0] == 404  # signed but not a listed camera
    monkeypatch.setattr(time, "time", lambda: 2e9)
    assert get(link)[0] == 403


def test_review_upsert_clear_and_team_hidden_until_mine(api) -> None:
    item = "event-0a11partial"
    code, body = api(
        "/api/review", 1, {"id": item, "verdict": "agree", "note": "guard missed neck", "reasons": ["Wrong person"]}
    )
    assert code == 200 and body["votes"]["mine"] == "agree" and body["votes"]["ok"] == 1
    code, body = api(f"/api/item/{item}", 2)
    assert body["votes"]["ok"] is None and body["votes"]["notes"] == [] and body["votes"]["result"] is None
    listed = api("/api/items?kind=reject", 2)[1]
    assert listed["to_review"] == 5 and listed["items"][1]["team"] is None
    code, body = api("/api/review", 2, {"id": item, "verdict": "disagree"})
    assert body["votes"]["ok"] == 1 and body["votes"]["bad"] == 1 and body["votes"]["result"] == "bad"  # tie: latest
    assert body["votes"]["notes"] == [
        {"name": "User1", "verdict": "agree", "note": "guard missed neck", "reasons": ["Wrong person"]}
    ]
    code, body = api("/api/review", 2, {"id": item, "verdict": "agree", "note": "changed my mind"})
    assert body["votes"]["ok"] == 2 and body["votes"]["bad"] == 0 and body["votes"]["my_note"] == "changed my mind"
    listed = api("/api/items?kind=reject", 2)[1]
    assert listed["to_review"] == 4 and listed["items"][1]["mine"] == "agree" and listed["items"][1]["team"] == "ok"
    code, body = api("/api/review", 2, {"id": item, "verdict": "clear"})
    assert body["votes"]["mine"] is None and body["votes"]["ok"] is None
    assert api("/api/items?kind=reject", 2)[1]["to_review"] == 5


def test_review_validation(api) -> None:
    assert api("/api/review", 1, {"id": "event-0a11partial", "verdict": "valid"})[0] == 400  # bookmark verdict
    assert api("/api/review", 1, {"id": "bookmark-75", "verdict": "agree"})[0] == 400
    assert api("/api/review", 1, {"id": "bookmark-75", "verdict": "valid"})[0] == 200
    assert api("/api/review", 1, {"id": "bookmark-75", "verdict": "valid", "note": "x" * 201})[0] == 400
    assert api("/api/review", 1, {"id": "bookmark-75", "verdict": "valid", "reasons": "text"})[0] == 400
    assert api("/api/review", 1, {"id": "bookmark-75", "verdict": "valid", "reasons": ["x"] * 11})[0] == 400
    assert api("/api/review", 1, {"id": "../bookmark-75", "verdict": "valid"})[0] == 404
    assert api("/api/review", 50, {"id": "bookmark-75", "verdict": "valid"})[0] == 403


def test_rate_limit() -> None:
    assert all(http.rate_ok(9) for _ in range(60)) and not http.rate_ok(9)


def test_static_frontend_only_when_enabled(get, settings, monkeypatch, tmp_path) -> None:
    assert get("/")[0] == 404
    web = tmp_path / "dist"
    (web / "assets").mkdir(parents=True)
    (web / "index.html").write_text("<html>app</html>")
    (web / "assets" / "app.js").write_text("console.log(1)")
    monkeypatch.setenv("EVENT_REVIEW_WEB_DIR", str(web))
    from event_review.config import get_settings

    get_settings.cache_clear()
    assert get("/")[1] == b"<html>app</html>"
    status, data, headers = get("/assets/app.js")
    assert data == b"console.log(1)" and "javascript" in headers["Content-Type"]
    assert get("/../../etc/passwd")[1] == b"<html>app</html>"
    assert get("/api/items?kind=reject")[0] == 401
