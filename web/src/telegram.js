// Telegram WebApp setup and the white/dark theme (saved choice, else Telegram, else the system)
export const tg = (typeof window !== "undefined" && window.Telegram && window.Telegram.WebApp) || null;

const BASE = { light: "#E9EDF1", dark: "#0E141A" }; // same values as --base in theme.css
const DESKTOP = ["tdesktop", "macos", "web", "weba", "webk", "unigram"];

function savedTheme() {
  try { return localStorage.getItem("theme"); } catch { return null; }
}

export function applyTheme() {
  const pick = savedTheme();
  const dark = pick ? pick === "dark" : tg && tg.colorScheme ? tg.colorScheme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  const mode = dark ? "dark" : "light";
  document.documentElement.dataset.theme = mode;
  try { tg.setHeaderColor(BASE[mode]); tg.setBackgroundColor(BASE[mode]); } catch {}
  return mode;
}

export function toggleTheme() {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  try { localStorage.setItem("theme", next); } catch {}
  return applyTheme();
}

export function initTelegram() {
  applyTheme();
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme);
  if (!tg) return;
  tg.onEvent("themeChanged", applyTheme);
  tg.ready();
  tg.expand();
  // laptops / PCs open full screen so the list + cameras fit; phones keep the normal sheet
  if (DESKTOP.includes(tg.platform) && tg.isVersionAtLeast && tg.isVersionAtLeast("8.0") && tg.requestFullscreen) {
    try { tg.requestFullscreen(); } catch {}
  }
  if (tg.disableVerticalSwipes) tg.disableVerticalSwipes();
}

export function setBackButton(onBack) {
  if (!tg) return () => {};
  if (!onBack) { tg.BackButton.hide(); return () => {}; }
  tg.BackButton.onClick(onBack);
  tg.BackButton.show();
  return () => tg.BackButton.offClick(onBack);
}

export function setClosingConfirmation(on) {
  if (!tg) return;
  if (on) tg.enableClosingConfirmation && tg.enableClosingConfirmation();
  else tg.disableClosingConfirmation && tg.disableClosingConfirmation();
}

export const haptic = (kind) => { try { tg.HapticFeedback.notificationOccurred(kind); } catch {} };
