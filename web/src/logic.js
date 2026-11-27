// pure rules shared by the player and the swipe card (checked by logic.check.mjs)
export const SWIPE_FRACTION = 0.35;
export const FLICK_SPEED = 0.6; // px per ms
export const DRIFT_LIMIT = 0.15; // seconds before a camera is pulled back to the lead one

// which way a finished drag counts as a swipe, or null to spring back
export function swipeVerdict(dx, width, speed) {
  const far = Math.abs(dx) >= width * SWIPE_FRACTION;
  const flick = Math.abs(dx) > 40 && Math.abs(speed) >= FLICK_SPEED;
  return far || flick ? (dx > 0 ? "right" : "left") : null;
}

export const needsResync = (leadTime, otherTime) => Math.abs(leadTime - otherTime) > DRIFT_LIMIT;

// the next event nobody answered yet: after the current one, else from the top
export function nextUnreviewed(items, currentId) {
  const at = items.findIndex((i) => i.id === currentId);
  const open = (i) => !i.mine && i.id !== currentId;
  return items.slice(at + 1).find(open) || items.slice(0, Math.max(at, 0)).find(open) || null;
}

export const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
