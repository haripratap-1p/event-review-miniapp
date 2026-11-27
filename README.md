# Event Review Mini App

Telegram Mini App for staff to validate the dashboard's **Rejected events** and **Bookmarks** on thor01: open the app,
pick a list, go through events numbered 1..n, watch all cameras in sync and answer Agree / Disagree (rejects) or
Valid / Not valid (bookmarks). Others' answers show only after you answer.

- `web/` React + Vite frontend, published to GitHub Pages.
- `server/` Python 3.10+ stdlib API on thor01 `127.0.0.1:8789`, reached through a Cloudflare quick tunnel.
- `deploy/` systemd units, install script, env example.

## Server
```
cd server
pytest -q tests                      # or from the repo root: pytest -q server/tests
python3 -m event_review serve        # API (+ proxy and pin-refresh threads)
python3 -m event_review proxies      # make missing 720p proxies once
python3 -m event_review pin          # post + pin the launcher in the group (only after approval)
```
Settings come from environment variables; see `deploy/review.env.example`:

| Variable | Default |
|---|---|
| `EVENT_REVIEW_BOT_TOKEN`, `EVENT_REVIEW_CHAT_ID` | empty (API refuses everyone) |
| `EVENT_REVIEW_BOT_USERNAME`, `EVENT_REVIEW_APP_SHORT_NAME` | empty (needed by `pin`) |
| `EVENT_REVIEW_PORT` | 8789 (bound to 127.0.0.1) |
| `EVENT_REVIEW_ORIGIN` | `https://haripratap-1p.github.io` (CORS) |
| `EVENT_REVIEW_REJECTED_DIR`, `EVENT_REVIEW_BOOKMARKED_DIR` | `~/AI-ML/Rejected_events`, `~/AI-ML/Bookmarked_events` |
| `EVENT_REVIEW_STATE_DIR` | `~/event_review` (reviews.db, proxies/, launcher_pin.json) |
| `EVENT_REVIEW_TUNNEL_LOG` | `<state>/tunnel.log` |
| `EVENT_REVIEW_MAX_INIT_AGE` | 86400 s |
| `EVENT_REVIEW_WEB_DIR` | empty; set to `web/dist` to serve the frontend at `/` (draft) |

API: `GET /api/items?kind=reject|bookmark`, `GET /api/item/<id>`, `POST /api/review {id, verdict, note, reasons}`
(`verdict` = agree/disagree for rejects, valid/invalid for bookmarks, or clear), `GET /api/clip/<id>/<camera>?exp&sig`
(Range/206/416; proxy if present).

## Web
```
cd web
export npm_config_cache=/media/ajay/1pbackup/.npm-cache
npm ci
npm run dev-clips                    # dev-only test clips (needs ffmpeg)
npm run dev                          # http://localhost:5173/?dev=1  (mock data, no Telegram)
npm run build                        # web/dist
```
API base: Telegram `start_param` = quick-tunnel name → `https://<name>.trycloudflare.com`; `?api=<name>`; in dev also
`?api=http://127.0.0.1:8789`; otherwise same origin (server serving `web/dist`). Screenshots: `docs/screens/`.

## Deploy (thor01, each step after approval)
1. Clone to `/home/thor01/event-review-miniapp`; create `/etc/event-review.env` (chmod 600) from the example.
2. `sudo deploy/install.sh`, then `sudo systemctl start event-review-tunnel.service event-review-api.service`.
3. Register the Mini App with BotFather `/newapp`, set `EVENT_REVIEW_APP_SHORT_NAME`, then
   `python3 -m event_review pin` once. Afterwards `serve` keeps the pinned button on the current tunnel host.
4. Pages: `.github/workflows/pages.yml` builds `web/` and publishes `web/dist` on push to `main`.
