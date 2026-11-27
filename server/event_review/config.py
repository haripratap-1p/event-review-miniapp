import os
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from zoneinfo import ZoneInfo

IST = ZoneInfo("Asia/Kolkata")
MAX_BODY = 32768
MAX_NOTE = 200
MEMBER_OK = {"creator", "administrator", "member", "restricted"}
KINDS = ("reject", "bookmark")
VERDICTS = {"reject": ("agree", "disagree"), "bookmark": ("valid", "invalid")}


@dataclass(frozen=True)
class Settings:
    token: str = field(repr=False)
    chat: str
    bot_username: str
    app_short_name: str
    port: int
    origin: str
    rejected_dir: Path
    bookmarked_dir: Path
    state_dir: Path
    max_init_age: int
    web_dir: Path | None  # set = also serve the built frontend at /
    tunnel_log: Path

    @property
    def db(self) -> Path:
        return self.state_dir / "reviews.db"

    @property
    def proxies_dir(self) -> Path:
        return self.state_dir / "proxies"

    def base_dir(self, kind: str) -> Path:
        return self.rejected_dir if kind == "reject" else self.bookmarked_dir

    @classmethod
    def from_env(cls) -> "Settings":
        env = os.environ
        state = Path(env.get("EVENT_REVIEW_STATE_DIR") or Path.home() / "event_review")
        web = env.get("EVENT_REVIEW_WEB_DIR", "")
        return cls(
            token=env.get("EVENT_REVIEW_BOT_TOKEN", ""),
            chat=env.get("EVENT_REVIEW_CHAT_ID", ""),
            bot_username=env.get("EVENT_REVIEW_BOT_USERNAME", ""),
            app_short_name=env.get("EVENT_REVIEW_APP_SHORT_NAME", ""),
            port=int(env.get("EVENT_REVIEW_PORT") or 8789),
            origin=env.get("EVENT_REVIEW_ORIGIN") or "https://haripratap-1p.github.io",
            rejected_dir=Path(env.get("EVENT_REVIEW_REJECTED_DIR") or Path.home() / "AI-ML/Rejected_events"),
            bookmarked_dir=Path(env.get("EVENT_REVIEW_BOOKMARKED_DIR") or Path.home() / "AI-ML/Bookmarked_events"),
            state_dir=state,
            max_init_age=int(env.get("EVENT_REVIEW_MAX_INIT_AGE") or 86400),
            web_dir=Path(web) if web else None,
            tunnel_log=Path(env.get("EVENT_REVIEW_TUNNEL_LOG") or state / "tunnel.log"),
        )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings.from_env()
