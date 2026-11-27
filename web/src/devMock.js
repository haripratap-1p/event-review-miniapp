// dev-only stand-in for the review server (?dev=1); never part of the production build
const PARTS = ["Neck", "Shoulders", "Underarms", "Hip/Waist", "Left knee", "Right knee", "Left ankle", "Right ankle"];
const CLIPS = ["testsrc", "testsrc2", "smptebars"];
const neutral = (label) => ({ label, tone: "neutral", missed: [], checked: [] });

const rejects = [
  ["event-0b22older", "23 Nov 2026, 10:40:00 AM", neutral("Frisking"), "-", "-", "Santosh Kumar", "not a customer", 0],
  ["event-0a11partial", "23 Nov 2026, 03:12:18 PM", { label: "Partial frisk", tone: "partial", missed: ["Neck"], checked: PARTS.slice(1) }, "Test Subject A", "Test Guard B", "Santosh Kumar", "complet frisk", 2],
  ["event-0c33notfrisked", "24 Nov 2026, 12:00:05 PM", { label: "Not frisked", tone: "not_frisked", missed: PARTS, checked: [] }, "Test Subject C", "-", "Asha Rao", "he was frisked", 3],
  ["event-0d44obstruction", "24 Nov 2026, 12:30:00 PM", neutral("Obstruction"), "-", "-", "Asha Rao", "camera was clear", 1],
  ["event-0e55complete", "24 Nov 2026, 01:45:40 PM", { label: "Complete frisk", tone: "complete", missed: [], checked: PARTS }, "Test Subject D", "Test Guard E", "Santosh Kumar", "wrong person", 2],
].map(([id, time_ist, result, subject, performer, actor, reason, cams], i) => ({
  id, kind: "reject", number: i + 1, ts: 0, time_ist, event_type: result.label === "Obstruction" ? "OBSTRUCTION" : "FRISKING",
  result, subject, performer, actor, reason, cameras: CLIPS.slice(0, cams).map((_, c) => `cam${c + 1}`), has_video: cams > 0,
}));

const bookmarks = [
  ["bookmark-75", "23 Nov 2026, 03:30:00 PM", "Suspicious bag", "Asha Rao", 3],
  ["bookmark-76", "23 Nov 2026, 05:00:00 PM", "Crowd at entry", "Asha Rao", 2],
].map(([id, time_ist, bookmark_name, actor, cams], i) => ({
  id, kind: "bookmark", number: i + 1, ts: 0, time_ist, bookmark_name, actor,
  cameras: CLIPS.slice(0, cams).map((_, c) => `cam${c + 1}`), has_video: true,
}));

const votes = new Map([["event-0b22older", [{ user: "other", name: "Ravi", verdict: "disagree", note: "Reason does not match the clip", reasons: [] }]]]);

function tally(id) {
  const rows = votes.get(id) || [];
  const mine = rows.find((r) => r.user === "dev");
  const out = { mine: mine ? mine.verdict : null, my_note: mine ? mine.note : "", my_reasons: mine ? mine.reasons : [], ok: null, bad: null, result: null, notes: [] };
  if (!mine) return out;
  const ok = rows.filter((r) => r.verdict === "agree" || r.verdict === "valid").length;
  return { ...out, ok, bad: rows.length - ok, result: ok >= rows.length - ok ? "ok" : "bad", notes: rows.filter((r) => r.note || r.reasons.length).map(({ name, verdict, note, reasons }) => ({ name, verdict, note, reasons })) };
}

const all = () => [...rejects, ...bookmarks];
const withMine = (item) => { const t = tally(item.id); return { ...item, mine: t.mine, team: t.mine ? t.result : null }; };

export async function handle(path, options = {}) {
  await new Promise((resolve) => setTimeout(resolve, 150));
  const url = new URL(path, location.origin);
  if (url.pathname === "/api/items") {
    const kind = url.searchParams.get("kind");
    const items = (kind === "reject" ? rejects : bookmarks).map(withMine);
    return { me: "Dev", kind, items, total: items.length, to_review: items.filter((i) => !i.mine).length };
  }
  if (url.pathname.startsWith("/api/item/")) {
    const item = all().find((i) => i.id === decodeURIComponent(url.pathname.slice(10)));
    return { ...withMine(item), event_id: item.id, description: "", clips: item.cameras.map((camera, c) => ({ camera, url: `/dev-clips/${CLIPS[c]}.mp4` })), votes: tally(item.id) };
  }
  const body = JSON.parse(options.body);
  const rows = (votes.get(body.id) || []).filter((r) => r.user !== "dev");
  if (body.verdict !== "clear") rows.push({ user: "dev", name: "Dev", verdict: body.verdict, note: body.note || "", reasons: body.reasons || [] });
  votes.set(body.id, rows);
  return { id: body.id, votes: tally(body.id) };
}
