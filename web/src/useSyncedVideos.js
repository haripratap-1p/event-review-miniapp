import { useCallback, useEffect, useRef, useState } from "react";
import { needsResync } from "./logic.js";

// all cameras act as one clock: play, pause, seek, speed and buffering stalls apply to every video together
export default function useSyncedVideos() {
  const videos = useRef([]);
  const playing = useRef(false);
  const stalled = useRef(false);
  const busy = useRef(false);
  const speed = useRef(1);
  const scrub = useRef({ resume: false, last: 0 });
  const [view, setView] = useState({ playing: false, time: 0, duration: 0, buffered: 0, speed: 1, stalled: false });
  const patch = useCallback((next) => setView((v) => ({ ...v, ...next })), []);
  const list = () => videos.current.filter(Boolean);

  const playAll = useCallback(() => {
    playing.current = true;
    list().forEach((v) => { v.playbackRate = speed.current; if (!v.ended) v.play().catch(() => {}); });
    patch({ playing: true });
  }, [patch]);

  const pauseAll = useCallback(() => {
    playing.current = false;
    stalled.current = false;
    list().forEach((v) => v.pause());
    patch({ playing: false, stalled: false });
  }, [patch]);

  // pause every camera, move each to the same time, continue only when all of them have arrived
  const seek = useCallback(async (seconds, resume = playing.current) => {
    const vs = list();
    if (!vs.length) return;
    const length = Math.max(...vs.map((v) => v.duration || 0));
    const target = Math.max(0, Math.min(length, seconds));
    busy.current = true;
    vs.forEach((v) => v.pause());
    patch({ time: target });
    await Promise.all(vs.map((v) => new Promise((done) => {
      if (!v.seeking && Math.abs(v.currentTime - target) < 0.01) return done();
      const finish = () => { v.removeEventListener("seeked", finish); done(); };
      v.addEventListener("seeked", finish);
      v.currentTime = target;
      setTimeout(finish, 2500);
    })));
    busy.current = false;
    if (resume) playAll();
  }, [patch, playAll]);

  const toggle = useCallback(async () => {
    if (playing.current) return pauseAll();
    if (list().length && list().every((v) => v.ended)) await seek(0, false);
    playAll();
  }, [pauseAll, playAll, seek]);

  const skip = useCallback((delta) => {
    const lead = list().find((v) => !v.ended) || list()[0];
    if (lead) seek(lead.currentTime + delta);
  }, [seek]);

  const setSpeed = useCallback((value) => {
    speed.current = value;
    list().forEach((v) => { v.playbackRate = value; });
    patch({ speed: value });
  }, [patch]);

  const beginScrub = useCallback(() => {
    scrub.current = { resume: playing.current, last: 0 };
    busy.current = true;
    list().forEach((v) => v.pause());
  }, []);

  // live preview while dragging, at most one jump every 80 ms
  const scrubTo = useCallback((seconds) => {
    patch({ time: seconds });
    const now = performance.now();
    if (now - scrub.current.last < 80) return;
    scrub.current.last = now;
    list().forEach((v) => { v.currentTime = seconds; });
  }, [patch]);

  const endScrub = useCallback((seconds) => seek(seconds, scrub.current.resume), [seek]);

  useEffect(() => {
    const timer = setInterval(() => {
      const vs = list();
      if (!vs.length) return;
      const lead = vs.find((v) => !v.ended) || vs[0];
      if (playing.current && !stalled.current && !busy.current) {
        vs.forEach((v) => { if (v !== lead && !v.ended && v.readyState > 0 && needsResync(lead.currentTime, v.currentTime)) v.currentTime = lead.currentTime; });
      }
      const buffered = Math.min(...vs.map((v) => (v.buffered.length ? v.buffered.end(v.buffered.length - 1) : 0)));
      const next = { duration: Math.max(...vs.map((v) => v.duration || 0)), buffered };
      if (!busy.current) next.time = lead.currentTime;
      patch(next);
    }, 100);
    return () => clearInterval(timer);
  }, [patch]);

  const stall = () => {
    if (!playing.current || stalled.current || busy.current) return;
    stalled.current = true;
    list().forEach((v) => v.pause());
    patch({ stalled: true });
  };
  const recover = () => {
    if (!stalled.current || !list().every((v) => v.readyState >= 3 || v.ended)) return;
    stalled.current = false;
    patch({ stalled: false });
    playAll();
  };
  const ended = () => {
    if (list().every((v) => v.ended)) { playing.current = false; patch({ playing: false }); }
  };

  // props for the Nth video element
  const bind = (index) => ({
    ref: (el) => { videos.current[index] = el; },
    onWaiting: stall,
    onCanPlay: recover,
    onEnded: ended,
  });

  return { view, bind, toggle, seek, skip, setSpeed, beginScrub, scrubTo, endScrub };
}
