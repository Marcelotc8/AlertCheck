// Configuración pública del frontend (nada de esto es secreto: el login es una SPA con PKCE, sin client secret).

/** Modo demo: avisos oficiales archivados del Huracán Milton (9 oct 2024) en lugar de las alertas en vivo. */
export const DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

/** Backend en Vultr. Sin NEXT_PUBLIC_API_URL en producción no hay backend: solo modo sin conexión. */
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
