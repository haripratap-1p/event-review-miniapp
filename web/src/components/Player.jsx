import { useEffect, useRef, useState } from "react";
import { mediaUrl } from "../api.js";
import { clock } from "../logic.js";
import useSyncedVideos from "../useSyncedVideos.js";

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const Icon = ({ d }) => <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d={d} fill="currentColor" /></svg>;
const PLAY = "M8 5v14l11-7z";
const PAUSE = "M6 5h4v14H6zm8 0h4v14h-4z";
const FULL = "M5 5h5v2H7v3H5zm9 0h5v5h-2V7h-3zM5 14h2v3h3v2H5zm12 0h2v5h-5v-2h3z";
const EXIT = "M8 5h2v5H5V8h3zm6 0h2v3h3v2h-5zM5 14h5v5H8v-3H5zm9 0h5v2h-3v3h-2z";
const BIG = "M4 4h7v2H6v5H4zm9 0h7v7h-2V6h-5zM4 13h2v5h5v2H4zm14 0h2v7h-7v-2h5z";

// drag or tap the bar to move every camera; role=slider so keys work too
function Scrub({ time, duration, buffered, onBegin, onMove, onEnd }) {
  const track = useRef(null);
  const [drag, setDrag] = useState(null);
  const at = (e) => {
    const box = track.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - box.left) / box.width)) * duration;
  };
  const shown = drag == null ? time : drag;
  const pct = (value) => `${duration ? Math.min(100, (value / duration) * 100) : 0}%`;
  return (
    <div
      className="scrub"
      ref={track}
      role="slider"
      tabIndex={0}
      aria-label="Seek all cameras"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(shown)}
      aria-valuetext={`${clock(shown)} of ${clock(duration)}`}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); onBegin(); const t = at(e); setDrag(t); onMove(t); }}
      onPointerMove={(e) => { if (drag != null) { const t = at(e); setDrag(t); onMove(t); } }}
      onPointerUp={(e) => { if (drag == null) return; const t = at(e); setDrag(null); onEnd(t); }}
      onPointerCancel={() => { if (drag != null) { onEnd(drag); setDrag(null); } }}
    >
      <div className="rail">
        <i className="buf" style={{ width: pct(buffered) }} />
        <i className="fill" style={{ width: pct(shown) }} />
        <i className={`thumb${drag != null ? " grab" : ""}`} style={{ left: pct(shown) }} />
      </div>
      {drag != null && <span className="bubble" style={{ left: pct(drag) }}>{clock(drag)}</span>}
    </div>
  );
}

// YouTube-style player over all cameras: tap = play/pause, double-tap sides = 10 s, middle = fullscreen
export default function Player({ clips }) {
  const sync = useSyncedVideos();
  const { view } = sync;
  const box = useRef(null);
  const tap = useRef({ time: 0, index: -1, timer: 0 });
  const hide = useRef(0);
  const [big, setBig] = useState(null);
  const [full, setFull] = useState(false);
  const [awake, setAwake] = useState(true);
  const [menu, setMenu] = useState(false);
  const [ripple, setRipple] = useState(null);

  useEffect(() => {
    const leave = () => { if (!document.fullscreenElement) setFull(false); };
    document.addEventListener("fullscreenchange", leave);
    return () => { document.removeEventListener("fullscreenchange", leave); clearTimeout(tap.current.timer); clearTimeout(hide.current); };
  }, []);

  if (!clips.length) return <div className="novideo">No video found</div>;

  function wake() {
    setAwake(true);
    clearTimeout(hide.current);
    hide.current = setTimeout(() => setAwake(false), 3000);
  }
  function toggleFull() {
    const next = !full;
    setFull(next);
    wake();
    try {
      if (next) box.current.requestFullscreen?.().catch(() => {});
      else if (document.fullscreenElement) document.exitFullscreen();
    } catch {}
  }
  function jump(index, delta) {
    sync.skip(delta);
    setRipple({ index, delta, key: Date.now() });
    wake();
  }
  function tapTile(e, index) {
    if (e.target.closest("button")) return;
    const side = (e.clientX - e.currentTarget.getBoundingClientRect().left) / e.currentTarget.clientWidth;
    const last = tap.current;
    clearTimeout(last.timer);
    if (Date.now() - last.time < 300 && last.index === index) {
      tap.current = { time: 0, index: -1, timer: 0 };
      if (side < 0.35) jump(index, -10);
      else if (side > 0.65) jump(index, 10);
      else toggleFull();
      return;
    }
    tap.current = { time: Date.now(), index, timer: setTimeout(() => { tap.current.time = 0; sync.toggle(); wake(); }, 260) };
  }
  function key(e) {
    const k = e.key.toLowerCase();
    const moves = { " ": () => sync.toggle(), k: () => sync.toggle(), arrowleft: () => sync.skip(-5), arrowright: () => sync.skip(5), j: () => sync.skip(-10), l: () => sync.skip(10), f: toggleFull };
    if (k === "escape" && full) return toggleFull();
    if (!moves[k]) return;
    e.preventDefault();
    e.stopPropagation();
    moves[k]();
    wake();
  }

  const hidden = full && !awake && view.playing && !menu;
  return (
    <div ref={box} className={`player${full ? " full" : ""}`} tabIndex={0} role="group" aria-label="Camera videos" onKeyDown={key} onPointerMove={full ? wake : undefined}>
      <div className="cams">
        {clips.map((clip, index) => (
          <div key={clip.camera} className={`cam${big === index ? " big-tile" : ""}`} onClick={(e) => tapTile(e, index)}>
            <b>{clip.camera}</b>
            <button className="enlarge" aria-label={big === index ? `Shrink ${clip.camera}` : `Enlarge ${clip.camera}`} onClick={() => setBig(big === index ? null : index)}>
              <Icon d={BIG} />
            </button>
            <video src={`${mediaUrl(clip.url)}#t=0.1`} playsInline muted preload="metadata" {...sync.bind(index)} />
            {ripple && ripple.index === index && (
              <span key={ripple.key} className={`ripple ${ripple.delta < 0 ? "back" : "ahead"}`}>{ripple.delta < 0 ? "« 10 s" : "10 s »"}</span>
            )}
            {view.stalled && index === 0 && <span className="buffering">Buffering…</span>}
          </div>
        ))}
      </div>
      <div className={`pbar${hidden ? " hidden" : ""}`}>
        <Scrub time={view.time} duration={view.duration} buffered={view.buffered} onBegin={sync.beginScrub} onMove={sync.scrubTo} onEnd={sync.endScrub} />
        <div className="prow">
          <button className="pbtn" onClick={() => sync.toggle()} aria-label={view.playing ? "Pause all cameras" : "Play all cameras"}><Icon d={view.playing ? PAUSE : PLAY} /></button>
          <span className="time">{clock(view.time)} / {clock(view.duration)}</span>
          <span className="spacer" />
          <div className="speedwrap">
            <button className="pbtn txt" onClick={() => setMenu(!menu)} aria-haspopup="menu" aria-expanded={menu} aria-label="Playback speed">{view.speed}×</button>
            {menu && (
              <ul className="speedmenu" role="menu">
                {SPEEDS.map((value) => (
                  <li key={value} role="none">
                    <button role="menuitemradio" aria-checked={view.speed === value} onClick={() => { sync.setSpeed(value); setMenu(false); }}>{value}×</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button className="pbtn" onClick={toggleFull} aria-label={full ? "Exit full screen" : "Full screen"}><Icon d={full ? EXIT : FULL} /></button>
        </div>
      </div>
    </div>
  );
}
