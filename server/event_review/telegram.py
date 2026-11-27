import hashlib
import hmac
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Protocol

from .config import get_settings


def check_init_data(init: str, token: str, max_age: int = 86400) -> dict | None:
    # https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
    pairs = dict(urllib.parse.parse_qsl(init, keep_blank_values=True))
    got = pairs.pop("hash", "")
    if not got or not token:
        return None
    check = "\n".join(f"{k}={v}" for k, v in sorted(pairs.items()))
    secret = hmac.new(b"WebAppData", token.encode(), hashlib.sha256).digest()
    if not hmac.compare_digest(hmac.new(secret, check.encode(), hashlib.sha256).hexdigest(), got):
        return None
    auth_date = pairs.get("auth_date", "0")
    if not auth_date.isdigit() or time.time() - int(auth_date) > max_age:
        return None
    try:
        user = json.loads(pairs.get("user", "{}"))
    except ValueError:
        return None
    return user if isinstance(user, dict) and isinstance(user.get("id"), int) else None


class TelegramError(RuntimeError):
    pass


class Client(Protocol):
    def call(self, method: str, **params: Any) -> Any: ...


class HttpClient:
    base = "https://api.telegram.org"

    def call(self, method: str, **params: Any) -> Any:
        request = urllib.request.Request(
            f"{self.base}/bot{get_settings().token}/{method}",
            data=json.dumps(params).encode(),
            headers={"Content-Type": "application/json"},
        )
        for _ in range(5):
            try:
                with urllib.request.urlopen(request, timeout=30) as response:
                    return json.load(response).get("result")
            except urllib.error.HTTPError as e:
                try:
                    error = json.loads(e.read() or b"{}")
                except ValueError:
                    error = {}
                wait = (error.get("parameters") or {}).get("retry_after")
                if not wait:
                    raise TelegramError(f"{method}: {error.get('description') or e.code}") from None
                time.sleep(int(wait) + 1)
        raise TelegramError(f"{method}: still rate-limited")


client: Client = HttpClient()


def call(method: str, **params: Any) -> Any:
    return client.call(method, **params)


def keep_pinned(chat: str, state_name: str, text: str, markup: dict) -> int:
    # one message kept pinned: edit its button in place; post a new one if it's gone
    state = get_settings().state_dir / state_name
    message_id = json.loads(state.read_text())["message_id"] if state.exists() else None
    if message_id:
        try:
            call("editMessageReplyMarkup", chat_id=chat, message_id=message_id, reply_markup=markup)
            print(f"updated message {message_id}", flush=True)
        except TelegramError as e:
            if "not modified" not in str(e):
                message_id = None  # message gone, post a new one
    if not message_id:
        message_id = call("sendMessage", chat_id=chat, text=text, parse_mode="HTML", reply_markup=markup)["message_id"]
        state.write_text(json.dumps({"message_id": message_id}))
        print(f"posted message {message_id}", flush=True)
    try:
        call("pinChatMessage", chat_id=chat, message_id=message_id, disable_notification=True)
    except TelegramError:
        print(f"bot can't pin message {message_id}: make it a group admin with 'Pin messages'", flush=True)
    return message_id
