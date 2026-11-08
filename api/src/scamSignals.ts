// Reglas deterministas COMPARTIDAS por el backend (barandal del enjambre) y la web (modo sin conexión).
// La web las importa como `@api/scamSignals`: hay una sola copia, no se pueden desincronizar.
// Sin dependencias de Node: tiene que poder correr en el navegador.

export interface ScamSignal {
  id: string;
  reason: string;
  es: string;
  weight: number;
}

/** Texto mínimo de una alerta oficial que necesitan las reglas (sirve para las del NWS y para las guardadas). */
export interface AlertLike {
  id: string;
  event: string;
  areaDesc: string;
  headline: string;
  description?: string;
}

// ---------- Normalización (contra trucos para esquivar las reglas) ----------

// Letras cirílicas/griegas que parecen latinas ("FЕMA" con E cirílica).
const CONFUSABLES: Record<string, string> = {
  а: "a", е: "e", о: "o", р: "p", с: "c", у: "y", х: "x", і: "i", ј: "j", ѕ: "s", ԁ: "d", ӏ: "l",
  А: "A", В: "B", Е: "E", К: "K", М: "M", Н: "H", О: "O", Р: "P", С: "C", Т: "T", Х: "X", І: "I",
  ο: "o", α: "a", ε: "e", ι: "i", ν: "v", Ο: "O", Α: "A", Ε: "E", Ι: "I", Τ: "T", Μ: "M", Ν: "N",
};

/** NFKC + sin caracteres invisibles + homoglifos → latín. Se aplica antes de cualquier regla. */
export function normalizeText(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[​-‏⁠-⁤﻿­]/g, "")
    .replace(/[Ͱ-ϿЀ-ӿ]/g, (ch) => CONFUSABLES[ch] ?? ch);
}

// ---------- Enlaces ----------

const OFFICIAL_HOSTS = ["floridadisaster.org", "ready.gov"]; // además de cualquier *.gov
const SHORTENERS = ["bit.ly", "tinyurl.com", "t.co", "goo.gl", "cutt.ly", "rb.gy", "is.gd", "ow.ly", "tiny.cc", "shorturl.at"];

/** Enlaces del texto (con o sin https://), como nombres de host en minúsculas. */
export function extractHosts(text: string): string[] {
  const re = /\b(?:https?:\/\/)?((?:[a-z0-9-]+\.)+[a-z]{2,})(?::\d+)?(?:\/[^\s]*)?/gi;
  const hosts: string[] = [];
  for (const m of text.matchAll(re)) {
    // "e.g." o "a.m." no son enlaces: exigir un TLD de 2+ letras y que no sea una abreviatura con puntos
    const host = m[1].toLowerCase().replace(/\.$/, "");
    if (/^([a-z]\.)+[a-z]{1,2}$/.test(host)) continue;
    hosts.push(host);
  }
  return hosts;
}

/** Oficial = el dominio REAL termina en .gov (no "weather.gov.estafa.com") o es uno de la lista. */
export function isOfficialHost(host: string): boolean {
  return host.endsWith(".gov") || OFFICIAL_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

const PHONE_RE = /(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g;
export const extractPhones = (text: string) => (text.match(PHONE_RE) ?? []).map((p) => p.replace(/\D/g, "").slice(-10));

// ---------- Reglas ----------

const RULES: (ScamSignal & { test: (t: string) => boolean })[] = [
  {
    id: "payment",
    test: (t) => /\b(pay|payment|fee|deposit|cash ?app|zelle|venmo|gift ?cards?|pago|paga|pagar|pagando|tarjetas? de regalo)\b/i.test(t),
    reason: "Asks for a payment — official agencies never charge to evacuate",
    es: "Pide un pago — las agencias oficiales nunca cobran por evacuar",
    weight: 3,
  },
  {
    id: "personal-data",
    test: (t) => /\b(ssn|social security|bank account|routing|password|seguro social|cuenta bancaria|contraseña)\b/i.test(t),
    reason: "Requests personal or bank data",
    es: "Pide datos personales o bancarios",
    weight: 3,
  },
  {
    id: "send-details",
    test: (t) =>
      /\b(text|send|reply with|envía|envia|manda|responde con)\b[^.]{0,40}\b(name|address|date of birth|nombre|dirección|direccion|fecha de nacimiento)\b/i.test(t),
    reason: "Asks you to send personal details by text or reply",
    es: "Te pide enviar tus datos personales por mensaje",
    weight: 3,
  },
  {
    // Prompt injection: texto dirigido a la IA, no a la persona. Una alerta real nunca le habla a un modelo.
    id: "ai-instructions",
    test: (t) =>
      /\b(ignore|disregard|forget)\b[^.]{0,30}\b(previous|prior|above|all|earlier)\b[^.]{0,20}\b(instructions?|rules|prompts?)\b/i.test(t) ||
      /\bignora\b[^.]{0,30}\b(instrucciones|reglas)\b/i.test(t) ||
      /\b(system prompt|you are (now )?an? (ai|assistant|model)|as an ai|eres un(a)? (ia|asistente|modelo))\b/i.test(t) ||
      /\b(judge|officialmatcher|scamdetector|extractor|assistant|system)\s*[:=]/i.test(t) ||
      /matchedAlertId|"label"\s*:|\blabel\s*[:=]\s*"?verified|\boutput\b[^.]{0,30}\bverified\b|\bactive official nws alerts\b/i.test(t) ||
      /\b(classify|mark|label|clasifica|marca)\b[^.]{0,30}\b(as|como)\b[^.]{0,10}\b(verified|verificada|official|oficial)\b/i.test(t),
    reason: "Contains hidden instructions aimed at an AI system (prompt injection)",
    es: "Contiene instrucciones escondidas dirigidas a una IA (inyección de prompt)",
    weight: 3,
  },
  {
    id: "shortener",
    test: (t) => extractHosts(t).some((h) => SHORTENERS.includes(h)),
    reason: "Uses a shortened link that hides the destination",
    es: "Usa un enlace acortado que oculta el destino",
    weight: 2,
  },
  {
    id: "chain",
    test: (t) => /(forward|share) (this|to everyone|with everyone)|reenv[ií]a|comp[aá]rtelo con todos/i.test(t),
    reason: "Chain-message language ('forward to everyone')",
    es: "Lenguaje de cadena ('reenvía a todos')",
    weight: 2,
  },
  {
    id: "fake-fema",
    test: (t) => /\bfema\b.*\b(verify|claim|register|verifica|registr)/i.test(t),
    reason: "'FEMA' asking you to verify or register via message",
    es: "'FEMA' te pide verificar o registrarte por mensaje",
    weight: 2,
  },
  {
    id: "lookalike-domain",
    test: (t) => extractHosts(t).some((h) => !isOfficialHost(h) && /\b(gov|nws|noaa|fema|weather|miamidade|broward|monroe)\b/.test(h.replace(/[.-]/g, " "))),
    reason: "Link imitates an official site but is not a real .gov domain",
    es: "El enlace imita un sitio oficial pero no es un dominio .gov real",
    weight: 2,
  },
  {
    id: "unofficial-link",
    test: (t) => extractHosts(t).some((h) => !isOfficialHost(h)),
    reason: "Link is not an official .gov domain",
    es: "El enlace no es de un sitio oficial .gov",
    weight: 1,
  },
  {
    id: "urgency",
    test: (t) => /\b(urgent|immediately|within \d+ (min|minutes|hours)|urgente|inmediatamente)\b/i.test(t),
    reason: "Pressure / urgency language",
    es: "Presiona con urgencia",
    weight: 1,
  },
];

/** Umbral a partir del cual el resultado es "suspicious" sí o sí. */
export const STRONG_SCAM_SCORE = 3;

export function detectScamSignals(text: string): { signals: ScamSignal[]; score: number } {
  const t = normalizeText(text);
  const signals = RULES.filter((r) => r.test(t)).map(({ id, reason, es, weight }) => ({ id, reason, es, weight }));
  return { signals, score: signals.reduce((s, r) => s + r.weight, 0) };
}

// ---------- Evidencia para "verified" ----------

const norm = (s: string) => normalizeText(s).toLowerCase().replace(/[-–—]/g, " ").replace(/\s+/g, " ");

/** ¿El texto nombra el evento (o el producto) de la alerta oficial y una de sus zonas? */
export function textMatchesAlert(text: string, a: AlertLike): boolean {
  const t = norm(text);
  const product = a.headline.split(",")[0].trim();
  const named = t.includes(norm(a.event)) || (product.length > 12 && t.includes(norm(product)));
  const sameArea = a.areaDesc.split(/[;,()]/).some((area) => {
    const z = norm(area.replace(/\bFL\b/, "")).trim();
    return z.length > 3 && t.includes(z);
  });
  return named && sameArea;
}

/** Primera alerta oficial que el texto respalda de forma determinista (o null). */
export function findEvidence<T extends AlertLike>(text: string, alerts: T[]): T | null {
  return alerts.find((a) => textMatchesAlert(text, a)) ?? null;
}

/**
 * Lo que impide "verified" aunque el texto coincida con una alerta oficial: cualquier señal (salvo urgencia,
 * que las alertas reales usan) o un teléfono que la alerta oficial no trae (refugios inventados, "llama a…").
 */
export function verifiedBlockers(text: string, alert: AlertLike | null): { reason: string; es: string }[] {
  const blockers: { reason: string; es: string }[] = detectScamSignals(text).signals.filter((s) => s.id !== "urgency");
  const officialPhones = new Set(extractPhones(`${alert?.description ?? ""} ${alert?.headline ?? ""}`));
  if (extractPhones(normalizeText(text)).some((p) => !officialPhones.has(p))) {
    blockers.push({
      reason: "Includes a phone number that the official alert does not contain",
      es: "Incluye un teléfono que la alerta oficial no trae",
    });
  }
  return blockers;
}
