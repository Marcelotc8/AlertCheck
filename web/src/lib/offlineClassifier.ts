// Clasificador sin conexión: reglas locales + últimas alertas oficiales guardadas en el dispositivo.

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
}

const RULES: { re: RegExp; reason: string; weight: number }[] = [
  { re: /\b(pay|payment|fee|deposit|cash ?app|zelle|venmo|gift ?card|pago|paga|pagar|tarjeta de regalo)\b/i, reason: "Asks for a payment — official agencies never charge to evacuate", weight: 3 },
  { re: /\b(ssn|social security|bank account|routing|password|seguro social|cuenta bancaria|contraseña)\b/i, reason: "Requests personal or bank data", weight: 3 },
  { re: /\b(bit\.ly|tinyurl|t\.co|goo\.gl|cutt\.ly|rb\.gy|is\.gd|ow\.ly)\b/i, reason: "Uses a shortened link that hides the destination", weight: 2 },
  { re: /(forward|share) (this|to everyone|with everyone)|reenv[ií]a|comp[aá]rtelo con todos/i, reason: "Chain-message language ('forward to everyone')", weight: 2 },
  { re: /\b(urgent|immediately|within \d+ (min|minutes|hours)|urgente|inmediatamente)\b/i, reason: "Pressure / urgency language", weight: 1 },
  { re: /\bfema\b.*\b(verify|claim|register|verifica|registr)/i, reason: "'FEMA' asking you to verify or register via message", weight: 2 },
  { re: /https?:\/\/(?![^\s]*\.(gov|noaa\.gov|weather\.gov|fema\.gov|miamidade\.gov|floridadisaster\.org)\b)[^\s]+/i, reason: "Link is not an official .gov domain", weight: 1 },
];

const HAZARDS = /(hurricane|tropical storm|storm surge|flood|evacuat|huracán|tormenta tropical|marejada|inundaci|evacua)/i;

export function classifyOffline(text: string, cached: CachedAlert[] = []): OfflineResult {
  const hits = RULES.filter((r) => r.re.test(text));
  const score = hits.reduce((s, r) => s + r.weight, 0);
  const now = Date.now();
  const active = cached.filter((a) => !a.expires || Date.parse(a.expires) > now);

  const lower = text.toLowerCase();
  const matched =
    active.find(
      (a) =>
        lower.includes(a.event.toLowerCase()) &&
        a.areaDesc.split(/[;,]/).some((area) => lower.includes(area.trim().toLowerCase()))
    ) ?? null;

  if (score >= 3) {
    return { label: "suspicious", confidence: Math.min(0.95, 0.6 + score * 0.07), reasons: hits.slice(0, 3).map((h) => h.reason), matchedAlert: null, offline: true };
  }
  if (matched && score === 0) {
    return { label: "verified", confidence: 0.7, reasons: [`Matches saved official alert: ${matched.event}`, `Area: ${matched.areaDesc}`, "No scam signals found"], matchedAlert: matched, offline: true };
  }
  const reasons = hits.map((h) => h.reason);
  if (HAZARDS.test(text) && !matched) reasons.push("No matching official alert saved on this device");
  if (!reasons.length) reasons.push("Not enough information to confirm offline");
  return { label: score >= 2 ? "suspicious" : "unverified", confidence: 0.5, reasons: reasons.slice(0, 3), matchedAlert: matched, offline: true };
}

const CACHE_KEY = "stormcheck:officialAlerts";

export function saveOfficialAlerts(alerts: CachedAlert[]) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), alerts })); } catch {}
}

export function loadOfficialAlerts(): CachedAlert[] {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}").alerts ?? []; } catch { return []; }
}
