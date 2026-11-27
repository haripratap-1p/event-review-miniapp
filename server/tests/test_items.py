import shutil

import pytest

from event_review import items


def test_rejects_numbered_oldest_first_skipping_other_files() -> None:
    found = items.scan("reject")
    assert [(i.number, i.id) for i in found] == [
        (1, "event-0b22older"),
        (2, "event-0a11partial"),
        (3, "event-0c33notfrisked"),
        (4, "event-0d44obstruction"),
        (5, "event-0e55complete"),
    ]
    assert [(i.number, i.id) for i in items.scan("bookmark")] == [(1, "bookmark-75"), (2, "bookmark-76")]


def test_result_rules() -> None:
    assert items.result({"event_type": "OBSTRUCTION", "frisked": None})["label"] == "Obstruction"
    assert items.result({"event_type": "FRISKING"})["label"] == "Frisking"  # older sidecar: no frisk fields
    not_frisked = items.result({"frisked": False, "checkpoints": None})
    assert not_frisked["label"] == "Not frisked" and len(not_frisked["missed"]) == 8
    assert items.result({"frisked": True, "checkpoints": None})["label"] == "Frisked"
    partial = items.result({"frisked": True, "checkpoints": {"neck": False, "hip_waist": True, "left_ankle": True}})
    assert partial == {
        "label": "Partial frisk",
        "tone": "partial",
        "missed": ["Neck"],
        "checked": ["Hip/Waist", "Left ankle"],
    }
    complete = items.result({"frisked": True, "checkpoints": dict.fromkeys(items.PARTS, True)})
    assert complete["label"] == "Complete frisk" and complete["checked"][3] == "Hip/Waist"


def test_time_is_ist_12_hour() -> None:
    assert items.time_ist(1763890938) == "23 Nov 2025, 03:12:18 PM"
    assert items.time_ist(1764738000) == "3 Dec 2025, 10:30:00 AM"


@pytest.mark.parametrize(
    "bad_id", ["../event-0a11partial", "event-0a11partial/../../x", "event-..", "/etc/passwd", "event-zzz", None, 7]
)
def test_find_only_from_index(bad_id) -> None:
    assert items.find(bad_id) is None


def test_proxies_made_once_and_preferred(settings) -> None:
    if not shutil.which("ffmpeg"):
        pytest.skip("ffmpeg missing")
    item = items.find("event-0d44obstruction")
    assert item.clip_file("cam1") == item.original("cam1")
    made = items.make_proxies()
    assert made == 12 and items.make_proxies() == 0  # 13 listed clips, one never saved; second run skips all
    assert item.clip_file("cam1") == item.proxy("cam1") and item.original("cam1").exists()
    assert not list(settings.proxies_dir.glob("*.partial.mp4"))
