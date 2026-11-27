import { ResultBadge } from "./EventCard.jsx";
import { verdictLabel } from "./VerdictBar.jsx";

export default function EventRow({ item, selected, onOpen }) {
  const reject = item.kind === "reject";
  return (
    <button className={`row${selected ? " sel" : ""}`} onClick={() => onOpen(item.id)} aria-current={selected ? "true" : undefined}>
      <span className="n">#{item.number}</span>
      <span className="t">{reject ? item.subject : item.bookmark_name}</span>
      <span className={`status ${item.mine ? "done" : "todo"}`}>{item.mine ? `✓ ${verdictLabel(item.mine)}` : "• To review"}</span>
      <span className="meta">
        {reject && <ResultBadge result={item.result} />}
        <span>{item.time_ist}</span>
        <span>{reject ? "rejected by" : "added by"} {item.actor}</span>
      </span>
    </button>
  );
}
