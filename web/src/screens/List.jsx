import EventRow from "../components/EventRow.jsx";
import ThemeButton from "../components/ThemeButton.jsx";
import { tg } from "../telegram.js";
import { TITLES } from "./Home.jsx";

export const filterItems = (listing, filter) => (listing ? listing.items.filter((i) => filter === "all" || !i.mine) : []);

export default function List({ kind, listing, filter, onFilter, currentId, onOpen, onHome }) {
  const shown = filterItems(listing, filter);
  return (
    <>
      <div className="bar">
        <h1>{TITLES[kind]}</h1>
        <div className="nav">
          <ThemeButton />
          {!tg && <button className="pill" onClick={onHome}>Home</button>}
        </div>
      </div>
      {listing && <p className="muted">{listing.to_review} to review · {listing.total} in all</p>}
      <div className="chips" role="group" aria-label="Filter">
        <button className="chip" aria-pressed={filter === "todo"} onClick={() => onFilter("todo")}>To review</button>
        <button className="chip" aria-pressed={filter === "all"} onClick={() => onFilter("all")}>All</button>
      </div>
      {!listing ? (
        <div className="skeleton" aria-busy="true"><span /><span /><span /></div>
      ) : shown.length ? (
        <div className="list">
          {shown.map((item) => <EventRow key={item.id} item={item} selected={item.id === currentId} onOpen={onOpen} />)}
        </div>
      ) : (
        <p className="empty">{filter === "todo" ? "All done. Nothing left to review." : "No events yet."}</p>
      )}
    </>
  );
}
