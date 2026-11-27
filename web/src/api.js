// review server calls: base from the launch link's tunnel name, ?api= for local dev, else same origin
import { tg } from "./telegram.js";

const params = new URLSearchParams(location.search);
const startParam = (tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param) || params.get("tgWebAppStartParam") || "";
const sub = startParam || params.get("api") || "";
const devBase = import.meta.env.DEV && /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(sub) ? sub : "";

export const API = /^[a-z0-9-]+$/.test(sub) ? `https://${sub}.trycloudflare.com` : devBase;
export const MOCK = import.meta.env.DEV && params.get("dev") === "1";
// dev only: ?open=<item id> starts on that event (screenshots)
export const DEV_OPEN = (MOCK && params.get("open")) || "";
export const INIT = (tg && tg.initData) || "";
export const USER_ID = (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.id) || (MOCK ? "dev" : "");

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

let mock = null;

export async function request(path, options = {}) {
  if (import.meta.env.DEV && MOCK) {
    mock = mock || (await import("./devMock.js"));
    return mock.handle(path, options);
  }
  let response;
  try {
    response = await fetch(API + path, { ...options, headers: { "X-Init-Data": INIT, "Content-Type": "application/json" } });
  } catch {
    throw new ApiError(0, "offline");
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, body.error || `HTTP ${response.status}`);
  return body;
}

export const loadList = (kind) => request(`/api/items?kind=${kind}`);
export const loadItem = (id) => request(`/api/item/${encodeURIComponent(id)}`);
export const sendReview = (review) => request("/api/review", { method: "POST", body: JSON.stringify(review) });
export const mediaUrl = (url) => (/^https?:/.test(url) ? url : API + url);
