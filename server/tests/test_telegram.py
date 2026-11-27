import json

from conftest import CHAT, TOKEN, init_data

from event_review import launcher
from event_review.telegram import check_init_data


def test_init_data_valid_expired_forged() -> None:
    assert check_init_data(init_data(5), TOKEN)["id"] == 5
    assert check_init_data(init_data(5, age=90000), TOKEN) is None
    assert check_init_data(init_data(5, age=50), TOKEN, max_age=10) is None
    assert check_init_data(init_data(5, token="999:other"), TOKEN) is None
    assert check_init_data(init_data(5).replace("User5", "User6"), TOKEN) is None
    assert check_init_data("", TOKEN) is None and check_init_data(init_data(5), "") is None


def test_pin_posts_once_then_edits(settings, fake_telegram) -> None:
    settings.state_dir.mkdir(parents=True)
    settings.tunnel_log.write_text("x https://old-host-one.trycloudflare.com\ny https://new-host-two.trycloudflare.com")
    launcher.pin_launcher()
    assert fake_telegram.methods() == ["sendMessage", "pinChatMessage"]
    button = fake_telegram.calls[0][1]["reply_markup"]["inline_keyboard"][0][0]
    assert button["url"] == "https://t.me/test_bot/review?startapp=new-host-two&mode=fullscreen"
    assert fake_telegram.calls[0][1]["chat_id"] == CHAT
    launcher.pin_launcher()
    assert fake_telegram.methods()[2:] == ["editMessageReplyMarkup", "pinChatMessage"]


def test_serve_refresh_never_posts(settings, fake_telegram) -> None:
    settings.state_dir.mkdir(parents=True)
    settings.tunnel_log.write_text("https://first-host.trycloudflare.com")
    assert launcher.refresh_pin("") == "" and fake_telegram.calls == []  # no launcher pinned yet
    (settings.state_dir / launcher.PIN_STATE).write_text(json.dumps({"message_id": 42}))
    assert launcher.refresh_pin("") == "first-host"
    assert fake_telegram.methods() == ["editMessageReplyMarkup"] and fake_telegram.calls[0][1]["message_id"] == 42
    assert launcher.refresh_pin("first-host") == "first-host" and len(fake_telegram.calls) == 1
    fake_telegram.fail["editMessageReplyMarkup"] = "message to edit not found"
    settings.tunnel_log.write_text("https://second-host.trycloudflare.com")
    assert launcher.refresh_pin("first-host") == "second-host"
    assert "sendMessage" not in fake_telegram.methods()
