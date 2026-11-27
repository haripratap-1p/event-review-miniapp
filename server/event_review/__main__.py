import sys
import threading
import time
from http.server import ThreadingHTTPServer

from .config import get_settings
from .http import Handler
from .items import make_proxies
from .launcher import pin_launcher, refresh_pin, tunnel_sub


def proxy_loop() -> None:
    while True:
        try:
            make_proxies()
        except Exception as e:
            print(f"proxies failed: {e}", flush=True)
        time.sleep(300)


def pin_loop() -> None:
    # the tunnel host is known after the tunnel starts; keep the pinned button on the current one
    last_sub = ""
    while True:
        try:
            last_sub = refresh_pin(last_sub)
        except Exception as e:
            print(f"pin refresh failed: {e}", flush=True)
        time.sleep(60)


def main(argv: list[str]) -> None:
    command = argv[0] if argv else ""
    if command == "pin":
        pin_launcher()
    elif command == "proxies":
        print(f"made {make_proxies()} proxies", flush=True)
    elif command == "serve":
        settings = get_settings()
        print(f"event review api on 127.0.0.1:{settings.port} (tunnel: {tunnel_sub() or 'none yet'})", flush=True)
        threading.Thread(target=proxy_loop, daemon=True).start()
        threading.Thread(target=pin_loop, daemon=True).start()
        ThreadingHTTPServer(("127.0.0.1", settings.port), Handler).serve_forever()
    else:
        raise SystemExit("usage: python -m event_review serve | pin | proxies")


if __name__ == "__main__":
    main(sys.argv[1:])
