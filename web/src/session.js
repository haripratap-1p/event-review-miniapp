// answers queue: saved per user across reopen, sent in order, retried while offline, rolled back when refused
export function createSession({ send, storage, userId, wait, retryMs = 5000, onEvent }) {
  const storeKey = `pendingReviews:${userId}`;
  let queue = restore(), busy = false;
  wait = wait || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));

  function restore() {
    try {
      const list = JSON.parse(storage.getItem(storeKey) || "[]");
      return Array.isArray(list) ? list.filter((r) => r && r.id && r.verdict) : [];
    } catch { return []; }
  }
  function persist() {
    try { queue.length ? storage.setItem(storeKey, JSON.stringify(queue)) : storage.removeItem(storeKey); } catch {}
  }

  async function flush() {
    if (busy) return;
    busy = true;
    try {
      while (queue.length) {
        const review = queue[0];
        try {
          const out = await send(review);
          queue.shift();
          onEvent({ saved: review, votes: out.votes });
        } catch (e) {
          if (e.status === 401 || e.status === 403) return onEvent({ expired: queue.length });
          if (e.status >= 400 && e.status < 500 && e.status !== 429) {
            queue.shift();
            onEvent({ rollback: review, toast: `Couldn't save this answer: ${e.message}` });
          } else {
            onEvent({ toast: "Couldn't save yet, retrying…" });
            await wait(retryMs);
            continue;
          }
        }
        persist();
        onEvent({ pending: queue.length });
      }
    } finally {
      busy = false;
    }
  }

  return {
    submit(review) {
      queue = [...queue, review];
      persist();
      onEvent({ pending: queue.length });
      return flush();
    },
    pending: () => [...queue],
    start: flush,
  };
}
