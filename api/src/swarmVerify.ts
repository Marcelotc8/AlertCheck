// StormCheck — núcleo: alertas oficiales del NWS + enjambre de 4 agentes en Swarms.
import { detectScamSignals, STRONG_SCAM_SCORE } from "./scamSignals.js";

export type Label = "verified" | "suspicious" | "unverified";

export interface OfficialAlert {
  id: string;
  event: string;
  headline: string;
  areaDesc: string;
  severity: string;
  sent: string;
  expires: string;
  description: string;
}

export interface VerifyResult {
  label: Label;
  confidence: number; // 0..1
  reasons: string[];
  reasons_es: string[];
  matchedAlert: OfficialAlert | null;
  cost: number | null; // USD reportado por Swarms
  overridden?: { from: Label; by: "scam-rules" }; // el barandal cambió la etiqueta del enjambre
  raw?: unknown;
}

const NWS_USER_AGENT = `StormCheck (${process.env.NWS_CONTACT_EMAIL ?? "contact@example.com"})`;
const SOUTH_FL = ["Miami-Dade", "Broward", "Monroe"];

/** Alertas activas del NWS para Florida, filtradas a Miami-Dade, Broward y Monroe. */
export async function getOfficialAlerts(): Promise<OfficialAlert[]> {
  const res = await fetch("https://api.weather.gov/alerts/active?area=FL", {
    headers: { "User-Agent": NWS_USER_AGENT, Accept: "application/geo+json" },
  });
  if (!res.ok) throw new Error(`NWS ${res.status}`);
  const data = (await res.json()) as { features: { id: string; properties: Record<string, string> }[] };
  return data.features
    .map((f) => ({
      id: f.id,
      event: f.properties.event,
      headline: f.properties.headline ?? "",
      areaDesc: f.properties.areaDesc ?? "",
      severity: f.properties.severity ?? "",
      sent: f.properties.sent ?? "",
      expires: f.properties.expires ?? "",
      description: (f.properties.description ?? "").slice(0, 1500),
    }))
    .filter((a) => SOUTH_FL.some((c) => a.areaDesc.includes(c)));
}

// ---------- Enjambre (definido en JSON para el reto de Swarms) ----------

const MODEL = process.env.SWARMS_MODEL ?? "gpt-4.1-mini";

const agent = (agent_name: string, description: string, system_prompt: string) => ({
  agent_name,
  description,
  system_prompt,
  model_name: MODEL,
  role: "worker",
  max_loops: 1,
  max_tokens: 1200,
  temperature: 0.2,
});

export const SWARM_AGENTS = [
  agent(
    "Extractor",
    "Extrae los datos clave de la alerta",
    "Extract from the user's alert: hazard type, issuing agency claimed, areas/counties, dates/times, actions requested, links, phone numbers, and any requests for money or personal data. Reply as compact JSON."
  ),
  agent(
    "OfficialMatcher",
    "Compara con las alertas oficiales del NWS",
    "You receive extracted alert data and a list of ACTIVE OFFICIAL NWS ALERTS. Decide whether the alert matches an official one (same hazard, overlapping area, consistent timing). Reply JSON: {matchedAlertId: string|null, consistency: string}."
  ),
  agent(
    "ScamDetector",
    "Busca señales de estafa o desinformación",
    "Look for scam/misinformation signals: payment links, gift cards, requests for SSN/bank data, shortened URLs, fake agency names (e.g. 'FEMA' asking for data), chain-message language ('forward to everyone'), urgency pressure, invented shelters, contradictions with official alerts. Reply JSON: {signals: string[]}."
  ),
  agent(
    "Judge",
    "Emite el veredicto final",
    'Using all previous outputs, output ONLY this JSON, nothing else: {"label":"verified"|"suspicious"|"unverified","confidence":0-1,"reasons":[3 short reasons in English],"reasons_es":[the same 3 reasons in plain Latin American Spanish],"matchedAlertId":string|null}. Use "verified" only if it matches an official alert and has no scam signals; "suspicious" if there are scam signals or it contradicts official alerts; otherwise "unverified".'
  ),
];

function extractJson(text: string): Record<string, unknown> | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

/**
 * Verifica una alerta. `officialOverride` permite el modo demo con avisos archivados.
 */
export async function verifyAlert(alertText: string, officialOverride?: OfficialAlert[]): Promise<VerifyResult> {
  const official = officialOverride ?? (await getOfficialAlerts().catch(() => []));

  const scam = detectScamSignals(alertText);
  const task = `ALERT TO VERIFY:\n"""${alertText}"""\n\nACTIVE OFFICIAL NWS ALERTS (South Florida):\n${
    official.length
      ? official.map((a) => `- id=${a.id} | ${a.event} | ${a.areaDesc} | ${a.headline}`).join("\n")
      : "(none active)"
  }\n\nSCAM SIGNALS PRE-DETECTED BY DETERMINISTIC RULES:\n${
    scam.signals.length ? scam.signals.map((x) => `- ${x.reason}`).join("\n") : "(none)"
  }\nNote: an official alert never asks for payments or personal data. Matching the hazard/area of an official alert does NOT make a message verified if it adds instructions (payments, sign-ups, shelters, data requests) that the official alert does not contain.`;

  const res = await fetch("https://api.swarms.world/v1/swarm/completions", {
    method: "POST",
    headers: { "x-api-key": process.env.SWARMS_API_KEY ?? "", "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "StormCheck",
      description: "Hurricane alert verification swarm",
      swarm_type: "SequentialWorkflow",
      max_loops: 1,
      agents: SWARM_AGENTS,
      task,
    }),
  });
  if (!res.ok) throw new Error(`Swarms ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as any;

  // Respuesta real de Swarms: output = [{ role: agent_name, content: string }, ...]; el Judge es el último.
  const judge = (data.output as { role: string; content: string }[]).find((o) => o.role === "Judge") ?? data.output.at(-1);
  const cost: number | null = data.usage?.billing_info?.total_cost ?? data.usage?.total_cost ?? null;

  const verdict = extractJson(String(judge?.content ?? "")) ?? {};
  const label = (["verified", "suspicious", "unverified"].includes(verdict.label as string)
    ? verdict.label
    : "unverified") as Label;

  const result: VerifyResult = {
    label,
    confidence: Number(verdict.confidence ?? 0.5),
    reasons: Array.isArray(verdict.reasons) ? (verdict.reasons as string[]).slice(0, 3) : [],
    reasons_es: Array.isArray(verdict.reasons_es) ? (verdict.reasons_es as string[]).slice(0, 3) : [],
    matchedAlert: official.find((a) => a.id === verdict.matchedAlertId) ?? null,
    cost,
    raw: process.env.DEBUG_SWARMS ? data : undefined,
  };

  // Barandal: con señales fuertes de estafa nunca se devuelve "verified", aunque el enjambre lo diga.
  if (scam.score >= STRONG_SCAM_SCORE && result.label !== "suspicious") {
    const top = scam.signals.sort((a, b) => b.weight - a.weight).slice(0, 2);
    result.overridden = { from: result.label, by: "scam-rules" };
    result.label = "suspicious";
    result.confidence = Math.max(0.85, 1 - result.confidence * 0.5);
    result.reasons = [...top.map((x) => x.reason), ...result.reasons].slice(0, 3);
    result.reasons_es = [...top.map((x) => x.es), ...result.reasons_es].slice(0, 3);
    result.matchedAlert = null;
  }
  return result;
}
