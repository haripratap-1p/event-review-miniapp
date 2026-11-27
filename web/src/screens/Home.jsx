import ThemeButton from "../components/ThemeButton.jsx";

const TITLES = { reject: "Rejected events", bookmark: "Bookmarks" };
export { TITLES };

export default function Home({ lists, onOpen }) {
  return (
    <main className="wrap">
      <div className="bar">
        <h1>SkyGold event review</h1>
        <ThemeButton />
      </div>
      <div className="home">
        {Object.keys(TITLES).map((kind) => {
          const listing = lists[kind];
          return (
            <button key={kind} className="big" onClick={() => onOpen(kind)}>
              <b>{TITLES[kind]}</b>
              {listing ? (
                <span className={listing.to_review ? "todo" : ""}>{listing.to_review} to review · {listing.total} in all</span>
              ) : (
                <span>Loading…</span>
              )}
            </button>
          );
        })}
      </div>
    </main>
  );
}
