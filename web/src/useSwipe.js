import { useEffect, useRef, useState } from "react";
import { swipeVerdict } from "./logic.js";

const SKIP = ".player, button, input, textarea, a, .sheet-bg, .verdict, .toast";

// drag sideways anywhere in the area except the video; onCommit("left"|"right") after the card flies off
export default function useSwipe(areaRef, { enabled, onCommit }) {
  const [drag, setDrag] = useState({ dx: 0, mode: "idle" });
  const commit = useRef(onCommit);
  commit.current = onCommit;

  useEffect(() => {
    const area = areaRef.current;
    if (!area || !enabled) return undefined;
    let g = null;
    const down = (e) => {
      if (e.button > 0 || e.target.closest(SKIP)) return;
      g = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), locked: false };
    };
    const move = (e) => {
      if (!g || e.pointerId !== g.id) return;
      const dx = e.clientX - g.x;
      const dy = e.clientY - g.y;
      if (!g.locked) {
        if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { g = null; return; }
        if (Math.abs(dx) < 12) return;
        g.locked = true;
        try { area.setPointerCapture(e.pointerId); } catch {}
      }
      setDrag({ dx, mode: "drag" });
    };
    const up = (e) => {
      if (!g || e.pointerId !== g.id) return;
      const was = g;
      g = null;
      if (!was.locked) return;
      const dx = e.clientX - was.x;
      const side = swipeVerdict(dx, area.clientWidth, dx / Math.max(1, performance.now() - was.t));
      if (!side) { setDrag({ dx: 0, mode: "back" }); return; }
      setDrag({ dx: Math.sign(dx) * area.clientWidth * 1.2, mode: "fly" });
      setTimeout(() => { commit.current(side); setDrag({ dx: 0, mode: "idle" }); }, 180);
    };
    const cancel = () => { if (g && g.locked) setDrag({ dx: 0, mode: "back" }); g = null; };
    area.addEventListener("pointerdown", down);
    area.addEventListener("pointermove", move);
    area.addEventListener("pointerup", up);
    area.addEventListener("pointercancel", cancel);
    return () => {
      area.removeEventListener("pointerdown", down);
      area.removeEventListener("pointermove", move);
      area.removeEventListener("pointerup", up);
      area.removeEventListener("pointercancel", cancel);
    };
  }, [areaRef, enabled]);

  return drag;
}
