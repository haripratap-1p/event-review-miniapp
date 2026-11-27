# CLAUDE.md

Event Review Mini App: `web/` (React + Vite, GitHub Pages), `server/` (thor01 API, Python stdlib), `deploy/` (systemd). See README.md.

## Rules
- Ask before every code change, commit or push; show the diff first. No AI attribution anywhere.
- Code comments: one short line max. No docstrings. Longer notes go here or in README.md.
- Server: stdlib only, settings only via `event_review.config.get_settings()`, state only under `EVENT_REVIEW_STATE_DIR`.
  Run `pytest -q server/tests` and `ruff check`/`ruff format --check` in `server/` before committing.
- Web: deps react + react-dom only. `npm run build` in `web/` before committing; keep the CSP (added at build in `vite.config.js`).
- Never commit secrets, `*.env`, `*.db`, logs, `web/dist`, `web/dev-fixtures`.

## Design notes
- Items = sidecar JSON under REJECTED_DIR / BOOKMARKED_DIR `<day>/<stem>.json`; id = stem; numbered per kind by request `ts`
  (ties by id). Client ids and cameras are only looked up in the scanned index; clip file = `<sidecar dir>/<stem>_<camera>.mp4`
  (the sidecar's absolute `file` path is ignored).
- Access: valid initData (`X-Init-Data`) and membership of `EVENT_REVIEW_CHAT_ID` (getChatMember, cached 1 h). Clip links are
  signed over `id:camera:exp` (6 h) because `<video>` can't send headers.
- Votes: one row per (item, user); a new answer replaces it, `clear` removes it. Team counts and notes are hidden until the viewer
  has answered. agree/valid count as ok, disagree/invalid as bad; majority, tie = latest answer.
- `serve` never posts to Telegram: it only re-points the button of a launcher that `pin` already posted (state file
  `launcher_pin.json`). `pin` is run by hand after approval.
- Proxies: `<state>/proxies/<id>_<camera>.mp4` (720p, crf 28, faststart), written to `.partial.mp4` then renamed; served when present.
- Web: Vite `base: './'` so the same build works on Pages (`/event-review-miniapp/`) and served at `/` by the server.
  Mock mode (`?dev=1`, `?open=<id>`) and `web/dev-fixtures` exist only in `npm run dev`.
