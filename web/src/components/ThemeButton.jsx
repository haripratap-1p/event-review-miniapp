import { useEffect, useState } from "react";
import { toggleTheme } from "../telegram.js";

const SUN = "M12 7a5 5 0 100 10 5 5 0 000-10zM11 1h2v3h-2zm0 19h2v3h-2zM1 11h3v2H1zm19 0h3v2h-3zM4.2 5.6l1.4-1.4 2.1 2.1-1.4 1.4zm12.1 12.1l1.4-1.4 2.1 2.1-1.4 1.4zM5.6 19.8l-1.4-1.4 2.1-2.1 1.4 1.4zM18.4 7.7l-1.4-1.4 2.1-2.1 1.4 1.4z";
const MOON = "M20 15.5A8.5 8.5 0 018.5 4a8.5 8.5 0 1011.5 11.5z";
const current = () => document.documentElement.dataset.theme || "light";

// one sun/moon button for dark and light; also follows Telegram when it changes the theme
export default function ThemeButton() {
  const [mode, setMode] = useState(current());
  useEffect(() => {
    const watch = new MutationObserver(() => setMode(current()));
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => watch.disconnect();
  }, []);
  return (
    <button className="pill icon" onClick={() => setMode(toggleTheme())} aria-label={mode === "dark" ? "Switch to light theme" : "Switch to dark theme"}>
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d={mode === "dark" ? SUN : MOON} fill="currentColor" /></svg>
    </button>
  );
}
