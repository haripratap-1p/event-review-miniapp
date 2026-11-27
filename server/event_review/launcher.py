import json
import re

from .config import get_settings
from .telegram import TelegramError, call, keep_pinned

PIN_STATE = "launcher_pin.json"
LAUNCHER_TEXT = (
    "🎬 <b>Review rejected events and bookmarks</b>\nTap the button, watch every camera and say whether "
    "the human decision was right."
)


def tunnel_sub() -> str:
    # quick-tunnel host changes on every restart; read the latest one from its log
    log = get_settings().tunnel_log
    subs = re.findall(r"https://([a-z0-9-]+)\.trycloudflare\.com", log.read_text()) if log.exists() else []
    return subs[-1] if subs else ""


def launch_url(sub: str) -> str:
    settings = get_settings()
    return f"https://t.me/{settings.bot_username}/{settings.app_short_name}?startapp={sub}&mode=fullscreen"


def _button(sub: str) -> dict:
    return {"inline_keyboard": [[{"text": "🎬 Open review", "url": launch_url(sub)}]]}


def pin_launcher() -> int:
    # run by hand after approval: posts the launcher once, later runs only re-point its button
    settings = get_settings()
    sub = tunnel_sub()
    if not (settings.token and settings.chat and settings.bot_username and settings.app_short_name and sub):
        raise SystemExit("set bot token, chat id, bot username, app short name, and start the tunnel first")
    return keep_pinned(settings.chat, PIN_STATE, LAUNCHER_TEXT, _button(sub))


def refresh_pin(last_sub: str) -> str:
    # serve only edits the button of a launcher that pin already posted; it never posts one
    settings = get_settings()
    state = settings.state_dir / PIN_STATE
    sub = tunnel_sub()
    if not (settings.token and settings.chat and state.exists() and sub) or sub == last_sub:
        return last_sub
    message_id = json.loads(state.read_text())["message_id"]
    try:
        call("editMessageReplyMarkup", chat_id=settings.chat, message_id=message_id, reply_markup=_button(sub))
        print(f"launcher {message_id} -> {sub}", flush=True)
    except TelegramError as e:
        if "not modified" not in str(e):
            print(f"launcher edit failed, run `pin` again: {e}", flush=True)
    return sub
