// Public frontend config (none of this is secret: login is a PKCE SPA with no client secret).

/** Demo mode: archived official Hurricane Milton advisories (Oct 9 2024) instead of live alerts. */
export const DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

/** Backend on Vultr. Without NEXT_PUBLIC_API_URL in production there's no backend: offline mode only. */
export const API: string | null =
  process.env.NEXT_PUBLIC_API_URL ?? (process.env.NODE_ENV === "development" ? "http://localhost:8787" : null);

export const AUTH0 = {
  domain: process.env.NEXT_PUBLIC_AUTH0_DOMAIN ?? "dev-qultyktmef157l4q.us.auth0.com",
  clientId: process.env.NEXT_PUBLIC_AUTH0_CLIENT_ID ?? "ekZPf8VbNhzHZZP72Dt8qRnRWqFcECIL",
  audience: process.env.NEXT_PUBLIC_AUTH0_AUDIENCE ?? "https://api.stormcheck",
};

export type Lang = "en" | "es";
const LANG_KEY = "stormcheck:lang";

export function loadLang(): Lang {
  try {
    return localStorage.getItem(LANG_KEY) === "en" ? "en" : "es";
  } catch {
    return "es";
  }
}

export function saveLang(lang: Lang) {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {}
}
