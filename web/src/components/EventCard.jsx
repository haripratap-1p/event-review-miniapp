const PARTS = ["Neck", "Shoulders", "Underarms", "Hip/Waist", "Left knee", "Right knee", "Left ankle", "Right ankle"];

// obstruction counts as red like "not frisked"
const toneOf = (result) => (/obstruction/i.test(result.label) ? "not_frisked" : result.tone);

export const ResultBadge = ({ result }) => <span className={`badge ${toneOf(result)}`}>{result.label}</span>;

function PartList({ result }) {
  const known = PARTS.filter((p) => result.missed.includes(p) || result.checked.includes(p));
  if (!known.length) return null;
  return (
    <ul className="partlist" aria-label="Body parts">
      {known.map((part) => {
        const checked = result.checked.includes(part);
        return (
          <li key={part} className={checked ? "CHECK" : "SKIP"}>
            <i aria-hidden="true">{checked ? "✓" : "✕"}</i>
            <span>{part}<span className="muted"> · {checked ? "checked" : "missed"}</span></span>
          </li>
        );
      })}
    </ul>
  );
}

const Facts = ({ rows }) => (
  <dl className="facts">
    {rows.filter(Boolean).map(([label, value]) => [<dt key={`${label}t`}>{label}</dt>, <dd key={`${label}d`}>{value}</dd>])}
  </dl>
);

export default function EventCard({ item }) {
  if (item.kind === "bookmark") {
    return (
      <div className="cards">
        <section className="card">
          <h2>Bookmark</h2>
          <Facts rows={[["Name", item.bookmark_name], ["Added by", item.actor], ["Time", item.time_ist]]} />
        </section>
      </div>
    );
  }
  return (
    <div className="cards">
      <section className="card">
        <h2>System detected</h2>
        <Facts
          rows={[
            ["Result", <ResultBadge key="r" result={item.result} />],
            ["Subject", item.subject],
            ["Performer", item.performer],
            item.description && ["Detail", item.description],
            ["Event id", item.event_id],
          ]}
        />
        <PartList result={item.result} />
      </section>
      <section className="card">
        <h2>Human review</h2>
        <Facts rows={[["Rejected by", item.actor], ["Reason", item.reason], ["Time", item.time_ist]]} />
      </section>
    </div>
  );
}
