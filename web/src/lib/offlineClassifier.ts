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
  explanation: { en: string; es: string; reasons_es: string[] };
}

const RULES: { re: RegExp; reason: string; es: string; weight: number }[] = [
  { re: /\b(pay|payment|fee|deposit|cash ?app|zelle|venmo|gift ?card|pago|paga|pagar|tarjeta de regalo)\b/i, reason: "Asks for a payment — official agencies never charge to evacuate", es: "Pide un pago — las agencias oficiales nunca cobran por evacuar", weight: 3 },
  { re: /\b(ssn|social security|bank account|routing|password|seguro social|cuenta bancaria|contraseña)\b/i, reason: "Requests personal or bank data", es: "Pide datos personales o bancarios", weight: 3 },
  { re: /\b(bit\.ly|tinyurl|t\.co|goo\.gl|cutt\.ly|rb\.gy|is\.gd|ow\.ly)\b/i, reason: "Uses a shortened link that hides the destination", es: "Usa un enlace acortado que oculta el destino", weight: 2 },
  { re: /(forward|share) (this|to everyone|with everyone)|reenv[ií]a|comp[aá]rtelo con todos/i, reason: "Chain-message language ('forward to everyone')", es: "Lenguaje de cadena ('reenvía a todos')", weight: 2 },
  { re: /\b(urgent|immediately|within \d+ (min|minutes|hours)|urgente|inmediatamente)\b/i, reason: "Pressure / urgency language", es: "Presiona con urgencia", weight: 1 },
  { re: /\b(text|send|reply with|envía|envia|manda|responde con)\b[^.]{0,40}\b(name|address|date of birth|nombre|dirección|direccion|fecha de nacimiento)\b/i, reason: "Asks you to send personal details by text or reply", es: "Te pide enviar tus datos personales por mensaje", weight: 3 },
  { re: /\bfema\b.*\b(verify|claim|register|verifica|registr)/i, reason: "'FEMA' asking you to verify or register via message", es: "'FEMA' te pide verificar o registrarte por mensaje", weight: 2 },
  { re: /https?:\/\/(?![^\s]*\.(gov|noaa\.gov|weather\.gov|fema\.gov|miamidade\.gov|floridadisaster\.org)\b)[^\s]+/i, reason: "Link is not an official .gov domain", es: "El enlace no es de un sitio oficial .gov", weight: 1 },
];

const HAZARDS = /(hurricane|tropical storm|storm surge|flood|evacuat|huracán|tormenta tropical|marejada|inundaci|evacua)/i;

export function classifyOffline(
  text: string,
  cached: CachedAlert[] = [],
  opts: { ignoreExpiry?: boolean } = {} // modo demo: los avisos archivados ya expiraron
): OfflineResult {
  const hits = RULES.filter((r) => r.re.test(text));
  const score = hits.reduce((s, r) => s + r.weight, 0);
  const now = Date.now();
  const active = opts.ignoreExpiry ? cached : cached.filter((a) => !a.expires || Date.parse(a.expires) > now);

  const lower = text.toLowerCase();
  // Coincide por tipo de evento ("Tornado Warning") o por el título del producto ("Hurricane Milton Advisory Number 17")
  const named = (a: CachedAlert) =>
    lower.includes(a.event.toLowerCase()) ||
    (a.headline.split(",")[0].trim().length > 12 && lower.includes(a.headline.split(",")[0].trim().toLowerCase()));
  const sameArea = (a: CachedAlert) =>
    a.areaDesc.split(/[;,()]/).some((area) => {
      const t = area.replace(/\bFL\b/, "").trim().toLowerCase();
      return t.length > 3 && lower.includes(t);
    });
  const matched = active.find((a) => named(a) && sameArea(a)) ?? null;

  let label: Label;
  let confidence: number;
  let reasons: [string, string][]; // [en, es]
  if (score >= 3) {
    label = "suspicious";
    confidence = Math.min(0.95, 0.6 + score * 0.07);
    reasons = hits.slice(0, 3).map((h) => [h.reason, h.es]);
  } else if (matched && score === 0) {
    label = "verified";
    confidence = 0.7;
    reasons = [
      [`Matches saved official alert: ${matched.event}`, `Coincide con la alerta oficial guardada: ${matched.event}`],
      [`Area: ${matched.areaDesc}`, `Zona: ${matched.areaDesc}`],
      ["No scam signals found", "No se encontraron señales de estafa"],
    ];
  } else {
    label = score >= 2 ? "suspicious" : "unverified";
    confidence = 0.5;
    reasons = hits.map((h) => [h.reason, h.es] as [string, string]);
    if (HAZARDS.test(text) && !matched)
      reasons.push(["No matching official alert saved on this device", "No hay una alerta oficial guardada en este dispositivo que coincida"]);
    if (!reasons.length) reasons.push(["Not enough information to confirm offline", "No hay suficiente información para confirmarla sin conexión"]);
    reasons = reasons.slice(0, 3);
  }
  return {
    label,
    confidence,
    reasons: reasons.map((r) => r[0]),
    matchedAlert: label === "suspicious" ? null : matched,
    offline: true,
    explanation: { ...EXPLAIN[label], reasons_es: reasons.map((r) => r[1]) },
  };
}

// Explicaciones simples sin conexión (sin Gemini): una por etiqueta, en inglés y español.
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
