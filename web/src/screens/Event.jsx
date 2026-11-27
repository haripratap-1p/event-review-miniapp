import { useEffect, useRef, useState } from "react";
import EventCard from "../components/EventCard.jsx";
import Player from "../components/Player.jsx";
import ReasonSheet from "../components/ReasonSheet.jsx";
import ThemeButton from "../components/ThemeButton.jsx";
import VerdictBar, { VERDICTS, verdictLabel } from "../components/VerdictBar.jsx";
import { tg } from "../telegram.js";
import useSwipe from "../useSwipe.js";

const sentence = (text) => (text ? text.charAt(0).toUpperCase() + text.slice(1).toLowerCase().replace(/_/g, " ") : "");

function Team({ kind, votes }) {
  if (!votes.mine) return null;
  if (votes.ok == null) return <section className="card team"><h2>Team answers</h2><p className="muted">Saving your answer…</p></section>;
  const [yes, no] = VERDICTS[kind];
  return (
    <section className="card team">
      <h2>Team answers</h2>
      <p className="counts">{yes.label} {votes.ok} · {no.label} {votes.bad}</p>
      {votes.notes.length > 0 && (
        <ul>
          {votes.notes.map((n, i) => (
            <li key={i}><b>{n.name}</b> ({verdictLabel(n.verdict)}): {[...n.reasons, n.note].filter(Boolean).join(", ")}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function Event({ detail, onAnswer, onAdvance, onPrev, onNext, onList }) {
  const [picking, setPicking] = useState(null);
  const area = useRef(null);
  const open = !!detail && !detail.votes.mine && !picking;
  const [yes, no] = VERDICTS[detail ? detail.kind : "reject"];
  const drag = useSwipe(area, { enabled: open, onCommit: swipe });

  // swipe or arrow key: right = first choice, left = second; saved at once, reasons are optional
  function swipe(side) {
    const choice = side === "right" ? yes : no;
    onAnswer(detail, choice.value, [], "");
    setPicking({ verdict: choice.value, swiped: true });
  }
  useEffect(() => {
    if (!open) return undefined;
    const arrows = (e) => {
      if (e.repeat || (e.key !== "ArrowLeft" && e.key !== "ArrowRight") || e.target.closest("input, textarea, .player")) return;
      swipe(e.key === "ArrowRight" ? "right" : "left");
    };
    window.addEventListener("keydown", arrows);
    return () => window.removeEventListener("keydown", arrows);
  });

  if (!detail) return <div className="skeleton" aria-busy="true" aria-label="Loading"><span /><span /><span /></div>;
  const votes = detail.votes;
  const ratio = Math.min(1, Math.abs(drag.dx) / ((area.current ? area.current.clientWidth : 400) * 0.35));
  const cardStyle = drag.mode === "idle" ? undefined : { transform: `translateX(${drag.dx}px) rotate(${drag.dx / 25}deg)`, transition: drag.mode === "drag" ? "none" : "transform 0.18s ease-out" };

  function finish(verdict) {
    setPicking(null);
    onAdvance(detail, verdict);
  }
  return (
    <div ref={area} className="swipe-area">
      <div className="bar">
        <div className="takeno">
          #{detail.number}
          <small>{detail.kind === "reject" ? `${sentence(detail.event_type)} · ${detail.time_ist}` : detail.time_ist}</small>
        </div>
        <div className="nav">
          {onList && <ThemeButton />}
          {!tg && onList && <button className="pill" onClick={onList}>List</button>}
          <button className="pill" onClick={onPrev} disabled={!onPrev} aria-label="Previous event">‹ Prev</button>
          <button className="pill" onClick={onNext} disabled={!onNext} aria-label="Next event">Next ›</button>
        </div>
      </div>
      <Player key={detail.id} clips={detail.clips} />
      <div className="swipe-card" style={cardStyle}>
        {drag.mode !== "idle" && drag.dx !== 0 && (
          <span className={`stamp ${drag.dx > 0 ? "yes" : "no"}`} style={{ opacity: ratio }}>{(drag.dx > 0 ? yes : no).label}</span>
        )}
        <EventCard item={detail} />
        <div className="cards"><Team kind={detail.kind} votes={votes} /></div>
      </div>
      {!votes.mine && <p className="hint">← swipe {no.label} · {yes.label} swipe →</p>}
      <VerdictBar kind={detail.kind} mine={votes.mine} onPick={(verdict) => setPicking({ verdict, swiped: false })} onChange={() => onAnswer(detail, "clear", [], "")} />
      {picking && (
        <ReasonSheet
          kind={detail.kind}
          verdict={picking.verdict}
          swiped={picking.swiped}
          onClose={() => (picking.swiped ? finish(picking.verdict) : setPicking(null))}
          onUndo={() => { onAnswer(detail, "clear", [], ""); setPicking(null); }}
          onSave={(reasons, note) => {
            onAnswer(detail, picking.verdict, reasons, note);
            if (picking.swiped) finish(picking.verdict);
            else setPicking(null);
          }}
        />
      )}
    </div>
  );
}
