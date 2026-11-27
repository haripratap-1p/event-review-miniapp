import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const CSP =
  "default-src 'self'; script-src 'self' https://telegram.org; connect-src 'self' https://*.trycloudflare.com; " +
  "media-src 'self' https://*.trycloudflare.com; style-src 'self'; img-src 'self' data:";

// CSP and the Telegram script only in the production build; dev mode runs without Telegram
const productionHead = {
  name: "production-head",
  apply: "build",
  transformIndexHtml: () => [
    { tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: CSP }, injectTo: "head-prepend" },
    { tag: "script", attrs: { src: "https://telegram.org/js/telegram-web-app.js" }, injectTo: "head" },
  ],
};

export default defineConfig(({ command }) => ({
  base: "./",
  plugins: [react(), productionHead],
  publicDir: command === "serve" ? "dev-fixtures" : false,
}));
