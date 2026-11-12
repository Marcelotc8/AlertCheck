// Offline classifier: rules shared with the backend + latest official alerts saved on the device.
import { areaName, eventName } from "./events";
import { detectScamSignals, findEvidence, STRONG_SCAM_SCORE, verifiedBlockers } from "@api/scamSignals";

export type Label = "verified" | "suspicious" | "unverified";

export interface CachedAlert {
  id: string;
  event: string;
  areaDesc: string;
  headline: string;
  expires: string;
}

export interface OfflineResult {
  label: Label;
  confidence: number;
  reasons: string[];
  matchedAlert: CachedAlert | null;
  offline: true;
  explanation: { en: string; es: string; reasons_es: string[] };
}

const HAZARDS = /(hurricane|tropical storm|storm surge|flood|evacuat|huracán|tormenta tropical|marejada|inundaci|evacua)/i;

export function classifyOffline(
  text: string,
  cached: CachedAlert[] = [],
  opts: { ignoreExpiry?: boolean } = {} // demo mode: archived advisories have already expired
): OfflineResult {
  // Same rules as the backend guardrail (single file: api/src/scamSignals.ts)
  const { signals: hits, score } = detectScamSignals(text);
  const now = Date.now();
  const active = opts.ignoreExpiry ? cached : cached.filter((a) => !a.expires || Date.parse(a.expires) > now);
  // Matches by event type ("Tornado Warning") or by product ("Hurricane Milton Advisory Number 17") + area
  const matched = findEvidence(text, active);
  const blockers = verifiedBlockers(text, matched);

  let label: Label;
  let confidence: number;
  let reasons: [string, string][]; // [en, es]
  if (score >= STRONG_SCAM_SCORE) {
    label = "suspicious";
    confidence = Math.min(0.95, 0.6 + score * 0.07);
    reasons = [...hits].sort((a, b) => b.weight - a.weight).slice(0, 3).map((h) => [h.reason, h.es]);
  } else if (matched && !blockers.length) {
    label = "verified";
    confidence = 0.7;
    reasons = [
      [`Matches saved official alert: ${matched.event}`, `Coincide con la alerta oficial guardada: ${eventName(matched.event, "es")}`],
      [`Area: ${matched.areaDesc}`, `Zona: ${areaName(matched.areaDesc, "es")}`],
      ["No scam signals found", "No se encontraron señales de estafa"],
    ];
  } else {
    label = score >= 2 ? "suspicious" : "unverified";
    confidence = 0.5;
    reasons = [...blockers, ...hits.filter((h) => !blockers.some((b) => b.reason === h.reason))].map(
      (h) => [h.reason, h.es] as [string, string]
    );
    if (HAZARDS.test(text) && !matched)
      reasons.push(["No matching official alert saved on this device", "No hay una alerta oficial guardada en este dispositivo que coincida"]);
    if (!reasons.length) reasons.push(["Not enough information to confirm offline", "No hay suficiente información para confirmarla sin conexión"]);
    reasons = reasons.slice(0, 3);
  }
  return {
    label,
    confidence,
    reasons: reasons.map((r) => r[0]),
    matchedAlert: label === "verified" ? matched : null,
    offline: true,
    explanation: { ...EXPLAIN[label], reasons_es: reasons.map((r) => r[1]) },
  };
}

// Simple offline explanations (no Gemini): one per label, in English and Spanish.
const EXPLAIN: Record<Label, { en: string; es: string }> = {
  suspicious: {
    en: "This message has signs of a scam or false alert. Do not pay, do not share personal data and do not forward it. Follow only official alerts from the National Weather Service and your county.",
    es: "Este mensaje tiene señales de estafa o de alerta falsa. No pagues, no compartas tus datos y no lo reenvíes. Sigue solo las alertas oficiales del Servicio Nacional de Meteorología y de tu condado.",
  },
  verified: {
    en: "This matches an official alert saved on your device. Follow its instructions and listen to local officials.",
    es: "Coincide con una alerta oficial guardada en tu dispositivo. Sigue sus instrucciones y escucha a las autoridades locales.",
  },
  unverified: {
    en: "We could not confirm this alert without a connection. Treat it with caution until you can check weather.gov or your county's official channels.",
    es: "No pudimos confirmar esta alerta sin conexión. Tómala con cautela hasta que puedas revisar weather.gov o los canales oficiales de tu condado.",
  },
};

const CACHE_KEY = "stormcheck:officialAlerts";

export function saveOfficialAlerts(alerts: CachedAlert[]) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), alerts })); } catch {}
}

export function loadOfficialAlerts(): CachedAlert[] {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}").alerts ?? []; } catch { return []; }
}
