import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEV_OPEN, INIT, MOCK, USER_ID, loadItem, loadList, sendReview } from "./api.js";
import { createSession } from "./session.js";
import { nextUnreviewed } from "./logic.js";
import { haptic, setBackButton, setClosingConfirmation } from "./telegram.js";
import { verdictLabel } from "./components/VerdictBar.jsx";
import Event from "./screens/Event.jsx";
import Home from "./screens/Home.jsx";
import List, { filterItems } from "./screens/List.jsx";

const KINDS = ["reject", "bookmark"];
const wideQuery = matchMedia("(min-width: 1000px)");
const kindOf = (id) => (id.startsWith("bookmark-") ? "bookmark" : "reject");

function useWide() {
  const [wide, setWide] = useState(wideQuery.matches);
  useEffect(() => {
    const update = () => setWide(wideQuery.matches);
    wideQuery.addEventListener("change", update);
    return () => wideQuery.removeEventListener("change", update);
  }, []);
  return wide;
}

function Message({ title, text, retry }) {
  return (
    <main className="message">
      <h1>{title}</h1>
      <p>{text}</p>
      {retry && <button onClick={retry}>Try again</button>}
    </main>
  );
}

function errorMessage(e, retry) {
  if (e.status === 401) return <Message title="Session expired" text="Close this window and open it again from the pinned message in the group." />;
  if (e.status === 403) return <Message title="Not allowed" text="Only members of the review group can open this." />;
  if (e.status === 0) return <Message title="No connection" text="Can't reach the review server. Check your internet and try again." retry={retry} />;
  return <Message title="Something went wrong" text="The review server couldn't load this. Try again in a minute." retry={retry} />;
}

// my answer applied before the server confirms; team parts stay hidden until it does
function applyMine(votes, review) {
  if (review.verdict === "clear") return { ...votes, mine: null, my_note: "", my_reasons: [], ok: null, bad: null, result: null, notes: [] };
  return { ...votes, mine: review.verdict, my_note: review.note, my_reasons: review.reasons, ok: null, bad: null, result: null, notes: [] };
}

function applyToList(listing, id, mine, team) {
  if (!listing) return listing;
  const items = listing.items.map((i) => (i.id === id ? { ...i, mine, team } : i));
  return { ...listing, items, to_review: items.filter((i) => !i.mine).length };
}

export default function App() {
  const wide = useWide();
  const [lists, setLists] = useState({});
  const [details, setDetails] = useState({});
  const [screen, setScreen] = useState(DEV_OPEN ? "event" : "home");
  const [kind, setKind] = useState(DEV_OPEN ? kindOf(DEV_OPEN) : "reject");
  const [filter, setFilter] = useState("todo");
  const [currentId, setCurrentId] = useState(DEV_OPEN || null);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState("");
  const [undo, setUndo] = useState(null);
  const session = useRef(null);

  const markList = useCallback((id, mine, team) => {
    setLists((all) => ({ ...all, [kindOf(id)]: applyToList(all[kindOf(id)], id, mine, team) }));
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      const loaded = await Promise.all(KINDS.map(loadList));
      let next = Object.fromEntries(KINDS.map((k, i) => [k, loaded[i]]));
      for (const review of session.current.pending()) {
        const k = kindOf(review.id);
        next = { ...next, [k]: applyToList(next[k], review.id, review.verdict === "clear" ? null : review.verdict, null) };
      }
      setLists(next);
      session.current.start();
    } catch (e) {
      setError(e);
    }
  }, []);

  useEffect(() => {
    let storage = null;
    try { storage = localStorage; } catch {}
    session.current = createSession({
      send: sendReview, storage, userId: USER_ID,
      onEvent: (event) => {
        if (event.saved) {
          const { id } = event.saved;
          setDetails((all) => (all[id] ? { ...all, [id]: { ...all[id], votes: event.votes } } : all));
          markList(id, event.votes.mine, event.votes.mine ? event.votes.result : null);
        }
        if (event.rollback) {
          setDetails((all) => { const copy = { ...all }; delete copy[event.rollback.id]; return copy; });
          load();
        }
        if (event.toast) setToast(event.toast);
        if (event.expired) setError({ status: 401 });
        if (event.pending !== undefined) setClosingConfirmation(event.pending > 0);
      },
    });
    if (INIT || MOCK) load();
  }, [load, markList]);

  useEffect(() => {
    if (!undo) return undefined;
    const timer = setTimeout(() => setUndo(null), 5000);
    return () => clearTimeout(timer);
  }, [undo]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(""), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  const listing = lists[kind];
  const shown = useMemo(() => filterItems(listing, filter), [listing, filter]);
  const ordered = listing ? listing.items : [];

  // laptop: the event pane always shows something once a list is open
  useEffect(() => {
    if (wide && screen !== "home" && !currentId && shown.length) setCurrentId(shown[0].id);
  }, [wide, screen, currentId, shown]);

  useEffect(() => {
    if (!currentId || details[currentId]) return;
    loadItem(currentId)
      .then((d) => {
        const unsent = session.current.pending().filter((r) => r.id === currentId).pop();
        setDetails((all) => ({ ...all, [currentId]: unsent ? { ...d, votes: applyMine(d.votes, unsent) } : d }));
      })
      .catch((e) => setError(e));
  }, [currentId, details]);

  const goHome = useCallback(() => { setScreen("home"); setCurrentId(null); }, []);
  const goList = useCallback(() => setScreen("list"), []);
  useEffect(() => {
    if (screen === "home") return setBackButton(null);
    return setBackButton(screen === "event" && !wide ? goList : goHome);
  }, [screen, wide, goHome, goList]);

  if (!INIT && !MOCK) return <Message title="Open from Telegram" text="Open this page from the pinned Review message in the Telegram group." />;
  if (error) return errorMessage(error, () => { setDetails({}); load(); });

  function openKind(k) { setKind(k); setFilter("todo"); setCurrentId(null); setScreen("list"); }
  function openItem(id) { setCurrentId(id); setScreen("event"); window.scrollTo(0, 0); }
  function answer(detail, verdict, reasons, note) {
    const review = { id: detail.id, verdict, note, reasons };
    setDetails((all) => ({ ...all, [detail.id]: { ...all[detail.id], votes: applyMine(all[detail.id].votes, review) } }));
    markList(detail.id, verdict === "clear" ? null : verdict, null);
    if (verdict !== "clear") haptic("success");
    session.current.submit(review);
  }

  // after a swipe: offer undo for 5 s and open the next event nobody answered yet
  function advance(detail, verdict) {
    setUndo({ id: detail.id, label: verdictLabel(verdict) });
    const next = nextUnreviewed(ordered, detail.id);
    if (next) openItem(next.id);
    else goList();
  }
  function undoLast() {
    const back = details[undo.id];
    setUndo(null);
    if (!back) return;
    answer(back, "clear", [], "");
    openItem(back.id);
  }

  const position = ordered.findIndex((i) => i.id === currentId);
  const neighbour = (step) => (position >= 0 && ordered[position + step] ? () => openItem(ordered[position + step].id) : null);
  const event = currentId && (
    <Event key={currentId} detail={details[currentId]} onAnswer={answer} onAdvance={advance} onPrev={neighbour(-1)} onNext={neighbour(1)} onList={wide ? null : goList} />
  );
  const list = (
    <List kind={kind} listing={listing} filter={filter} onFilter={setFilter} currentId={currentId} onOpen={openItem} onHome={goHome} />
  );

  let body;
  if (screen === "home") body = <Home lists={lists} onOpen={openKind} />;
  else if (wide) body = (
    <div className="desk">
      <aside className="side">{list}</aside>
      <main className="wrap">{event || <p className="empty">Pick an event on the left.</p>}</main>
    </div>
  );
  else body = <main className="wrap">{screen === "event" ? event : list}</main>;

  return (
    <>
      {body}
      {toast && <div className="toast" role="status">{toast}</div>}
      {undo && <div className="toast undo" role="status">Saved: {undo.label}<button onClick={undoLast}>Undo</button></div>}
    </>
  );
}
