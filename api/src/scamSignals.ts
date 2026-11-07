// Señales de estafa deterministas (las mismas reglas que el modo sin conexión).
// Mantener sincronizado con web/src/lib/offlineClassifier.ts (RULES).
// Se usan como contexto para el enjambre y como barandal: con señales fuertes, nunca "verified".

export interface ScamSignal {
  reason: string;
  es: string;
  weight: number;
}

const RULES: (ScamSignal & { re: RegExp })[] = [
  { re: /\b(pay|payment|fee|deposit|cash ?app|zelle|venmo|gift ?card|pago|paga|pagar|tarjeta de regalo)\b/i, reason: "Asks for a payment — official agencies never charge to evacuate", es: "Pide un pago — las agencias oficiales nunca cobran por evacuar", weight: 3 },
  { re: /\b(ssn|social security|bank account|routing|password|seguro social|cuenta bancaria|contraseña)\b/i, reason: "Requests personal or bank data", es: "Pide datos personales o bancarios", weight: 3 },
  { re: /\b(bit\.ly|tinyurl|t\.co|goo\.gl|cutt\.ly|rb\.gy|is\.gd|ow\.ly)\b/i, reason: "Uses a shortened link that hides the destination", es: "Usa un enlace acortado que oculta el destino", weight: 2 },
  { re: /(forward|share) (this|to everyone|with everyone)|reenv[ií]a|comp[aá]rtelo con todos/i, reason: "Chain-message language ('forward to everyone')", es: "Lenguaje de cadena ('reenvía a todos')", weight: 2 },
  { re: /\b(urgent|immediately|within \d+ (min|minutes|hours)|urgente|inmediatamente)\b/i, reason: "Pressure / urgency language", es: "Presiona con urgencia", weight: 1 },
  { re: /\b(text|send|reply with|envía|envia|manda|responde con)\b[^.]{0,40}\b(name|address|date of birth|nombre|dirección|direccion|fecha de nacimiento)\b/i, reason: "Asks you to send personal details by text or reply", es: "Te pide enviar tus datos personales por mensaje", weight: 3 },
  { re: /\bfema\b.*\b(verify|claim|register|verifica|registr)/i, reason: "'FEMA' asking you to verify or register via message", es: "'FEMA' te pide verificar o registrarte por mensaje", weight: 2 },
  { re: /https?:\/\/(?![^\s]*\.(gov|noaa\.gov|weather\.gov|fema\.gov|miamidade\.gov|floridadisaster\.org)\b)[^\s]+/i, reason: "Link is not an official .gov domain", es: "El enlace no es de un sitio oficial .gov", weight: 1 },
];

/** Umbral a partir del cual el resultado no puede ser "verified". */
export const STRONG_SCAM_SCORE = 3;

export function detectScamSignals(text: string): { signals: ScamSignal[]; score: number } {
  const signals = RULES.filter((r) => r.re.test(text)).map(({ reason, es, weight }) => ({ reason, es, weight }));
  return { signals, score: signals.reduce((s, r) => s + r.weight, 0) };
}
