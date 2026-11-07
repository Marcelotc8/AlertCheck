// Gemini: (1) leer capturas de pantalla de alertas y (2) redactar la explicación bilingüe del veredicto.
import type { VerifyResult } from "./swarmVerify.js";

const MODEL = () => process.env.GEMINI_MODEL ?? "gemini-3.8-flash";
const ATTEMPT_TIMEOUT_MS = 15000;
const BACKOFF_MS = [1000, 3000]; // 3 intentos, máx. ~50 s en total
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

const QUOTA_COOLDOWN_MS = 5 * 60 * 1000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Cortacircuitos: si la cuota de Gemini se agotó, no insistir durante 5 minutos (responder al instante con respaldo).
let quotaExhaustedUntil = 0;

async function generateJson<T>(parts: unknown[], schema: Record<string, unknown>): Promise<T> {
  if (Date.now() < quotaExhaustedUntil) {
    throw new Error("Gemini: cuota agotada, se reintentará en unos minutos");
  }
  let lastError: Error = new Error("Gemini: sin intentos");
  for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
    if (attempt > 0) await sleep(BACKOFF_MS[attempt - 1]);
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL()}:generateContent`,
        {
          method: "POST",
          headers: { "x-goog-api-key": process.env.GEMINI_API_KEY ?? "", "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts }],
            generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0.2 },
          }),
          signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
        }
      );
      if (!res.ok) {
        const body = await res.text();
        lastError = new Error(`Gemini ${res.status}: ${body.slice(0, 200)}`);
        if (res.status === 429 && /quota/i.test(body)) {
          quotaExhaustedUntil = Date.now() + QUOTA_COOLDOWN_MS;
          throw new Error("Gemini: cuota agotada (revisa el plan en Google AI Studio)");
        }
        if (RETRYABLE.has(res.status)) continue;
        throw lastError; // 400/403/404: reintentar no sirve
      }
      const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      return JSON.parse(text) as T;
    } catch (e) {
      const err = e as Error;
      if (err.name === "TimeoutError" || err.name === "AbortError") {
        lastError = new Error(`Gemini: sin respuesta en ${ATTEMPT_TIMEOUT_MS / 1000}s`);
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

export interface ExtractedAlert {
  text: string; // texto completo de la alerta tal como aparece
  channel: string; // whatsapp | sms | social | email | official_app | other
  sender: string; // remitente visible, o "" si no se ve
  links: string[];
  phoneNumbers: string[];
}

/** Lee una captura (WhatsApp, SMS, redes) y devuelve el texto de la alerta y sus metadatos. */
export async function extractAlertFromImage(base64: string, mimeType: string): Promise<ExtractedAlert> {
  return generateJson<ExtractedAlert>(
    [
      { inlineData: { mimeType, data: base64 } },
      {
        text:
          "This is a screenshot of a message someone received about a hurricane or weather emergency. " +
          "Transcribe the alert/message text EXACTLY as written (keep the original language, emojis and links; do not translate or summarize). " +
          "If there are several messages, transcribe the one that is the alert. Also report the channel, the visible sender, and every link and phone number.",
      },
    ],
    {
      type: "object",
      properties: {
        text: { type: "string" },
        channel: { type: "string", enum: ["whatsapp", "sms", "social", "email", "official_app", "other"] },
        sender: { type: "string" },
        links: { type: "array", items: { type: "string" } },
        phoneNumbers: { type: "array", items: { type: "string" } },
      },
      required: ["text", "channel", "sender", "links", "phoneNumbers"],
    }
  );
}

export interface Explanation {
  en: string;
  es: string;
  reasons_es: string[];
  source?: "gemini" | "template";
}

const TEMPLATES: Record<VerifyResult["label"], { en: string; es: string }> = {
  suspicious: {
    en: "This message has signs of a scam or false alert. Do not pay, do not share personal data and do not forward it. Follow only official alerts from the National Weather Service and your county.",
    es: "Este mensaje tiene señales de estafa o de alerta falsa. No pagues, no compartas tus datos y no lo reenvíes. Sigue solo las alertas oficiales del Servicio Nacional de Meteorología y de tu condado.",
  },
  verified: {
    en: "This matches an official National Weather Service alert. Follow its instructions and listen to local officials.",
    es: "Coincide con una alerta oficial del Servicio Nacional de Meteorología. Sigue sus instrucciones y escucha a las autoridades locales.",
  },
  unverified: {
    en: "We could not confirm this alert with official sources. Treat it with caution and check weather.gov or your county's official channels.",
    es: "No pudimos confirmar esta alerta con fuentes oficiales. Tómala con cautela y revisa weather.gov o los canales oficiales de tu condado.",
  },
};

/** Explicación de respaldo cuando Gemini no responde: plantilla por etiqueta + razones en español del Judge. */
export function templateExplanation(v: VerifyResult): Explanation {
  return { ...TEMPLATES[v.label], reasons_es: v.reasons_es.length ? v.reasons_es : v.reasons, source: "template" };
}

/** Convierte el veredicto del enjambre en una explicación simple, en inglés y español. */
export async function explainVerdict(alertText: string, v: VerifyResult): Promise<Explanation> {
  const e = await explainWithGemini(alertText, v);
  return { ...e, source: "gemini" };
}

async function explainWithGemini(alertText: string, v: VerifyResult): Promise<Explanation> {
  const verdict = {
    label: v.label,
    confidence: v.confidence,
    reasons: v.reasons,
    matchedOfficialAlert: v.matchedAlert ? `${v.matchedAlert.event} — ${v.matchedAlert.areaDesc}` : null,
  };
  return generateJson<Explanation>(
    [
      {
        text:
          "You explain hurricane-alert fact-checks to Miami residents, many of them older adults, in plain language (6th-grade level). " +
          "Given the ALERT and the VERDICT from an analysis system, write 2–3 short sentences that say what the verdict means, why, and what the person should do now " +
          "(e.g. follow the official alert and local officials; never pay, share personal data or forward a suspicious message; check weather.gov or miamidade.gov). " +
          "Do not change the verdict. Write `en` in English and `es` in natural Latin American Spanish (not a literal translation). " +
          "Also translate the reasons into Spanish as `reasons_es` (same order, short).\n\n" +
          `ALERT:\n"""${alertText}"""\n\nVERDICT:\n${JSON.stringify(verdict)}`,
      },
    ],
    {
      type: "object",
      properties: {
        en: { type: "string" },
        es: { type: "string" },
        reasons_es: { type: "array", items: { type: "string" } },
      },
      required: ["en", "es", "reasons_es"],
    }
  );
}
