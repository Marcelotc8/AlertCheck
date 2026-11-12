// Gemini: (1) read screenshots of alerts and (2) write the bilingual explanation of the verdict.
import type { VerifyResult } from "./swarmVerify.js";

const MODEL = () => process.env.GEMINI_MODEL ?? "gemini-3.8-flash";
const ATTEMPT_TIMEOUT_MS = 15000;
const BACKOFF_MS = [1000, 3000]; // 3 attempts, max ~50 s total
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

const QUOTA_COOLDOWN_MS = 5 * 60 * 1000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const PRUNE_URL = "https://api.withprune.com/v1/proxy/gemini/generateContent";
const PRUNE_TIMEOUT_MS = 20000;
let pruneDownUntil = 0; // if Prune fails, go straight to Gemini for 5 min (the demo can't go down because of the gateway)

/** Prune receipt for one call: cache, cost and savings (from `prune_metadata`). */
export interface PruneReceipt {
  cacheHit: boolean;
  costUsd: number;
  savedUsd: number;
}

/**
 * Text only → Gemini through the Prune gateway (cache, Shield/data redaction, cost receipt;
 * the Gemini key lives in Prune's vault). Prune uses the `messages` format and ignores responseSchema,
 * so we ask for JSON in the prompt and validate the required keys. Returns null on failure
 * (no key, error, invalid JSON) and the caller falls back to Gemini directly.
 */
async function generateJsonViaPrune<T>(
  prompt: string,
  schema: Record<string, unknown>,
  feature: string
): Promise<{ data: T; receipt: PruneReceipt } | null> {
  const key = process.env.PRUNE_API_KEY;
  if (!key || Date.now() < pruneDownUntil) return null;
  try {
    const res = await fetch(PRUNE_URL, {
      method: "POST",
      headers: {
        "X-Prune-Key": key,
        "Content-Type": "application/json",
        "X-Prune-Feature-Id": feature,
        // Cache off: with long prompts sharing a common prefix, Prune returns semantic hits even with "exact"
        // (it returned "this alert is authentic" for a scam). In verification that is unacceptable.
        "X-Prune-Cache": "off",
      },
      body: JSON.stringify({
        model: MODEL(),
        temperature: 0.2,
        messages: [
          {
            role: "user",
            content:
              `${prompt}\n\nRespond with ONLY a JSON object (no code fences, no extra text) matching this JSON Schema:\n` +
              JSON.stringify(schema),
          },
        ],
      }),
      signal: AbortSignal.timeout(PRUNE_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const body = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      prune_metadata?: { cache_hit?: boolean; cost_with_prune_usd?: number; cost_saved_usd?: number };
    };
    const raw = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    const json = raw.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
    const data = JSON.parse(json) as Record<string, unknown>;
    const missing = ((schema.required as string[]) ?? []).filter((k) => data[k] === undefined);
    if (missing.length) throw new Error(`missing keys ${missing.join(", ")}`);
    const m = body.prune_metadata ?? {};
    return {
      data: data as T,
      receipt: { cacheHit: !!m.cache_hit, costUsd: m.cost_with_prune_usd ?? 0, savedUsd: m.cost_saved_usd ?? 0 },
    };
  } catch (e) {
    console.warn(`Prune: ${(e as Error).message} → direct Gemini`);
    // Gateway error: let it rest. Invalid JSON from a single response: no need.
    if (!(e instanceof SyntaxError) && !/faltan claves/.test((e as Error).message)) pruneDownUntil = Date.now() + 5 * 60 * 1000;
    return null;
  }
}


// Circuit breaker: if the Gemini quota is exhausted, stop retrying for 5 minutes (answer instantly with the fallback).
let quotaExhaustedUntil = 0;

async function generateJson<T>(parts: unknown[], schema: Record<string, unknown>): Promise<T> {
  if (Date.now() < quotaExhaustedUntil) {
    throw new Error("Gemini: quota exhausted, will retry in a few minutes");
  }
  let lastError: Error = new Error("Gemini: no attempts");
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
          throw new Error("Gemini: quota exhausted (check your plan in Google AI Studio)");
        }
        if (RETRYABLE.has(res.status)) continue;
        throw lastError; // 400/403/404: retrying won't help
      }
      const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      return JSON.parse(text) as T;
    } catch (e) {
      const err = e as Error;
      if (err.name === "TimeoutError" || err.name === "AbortError") {
        lastError = new Error(`Gemini: no response in ${ATTEMPT_TIMEOUT_MS / 1000}s`);
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

export interface ExtractedAlert {
  text: string; // full alert text exactly as it appears
  channel: string; // whatsapp | sms | social | email | official_app | other
  sender: string; // visible sender, or "" if not shown
  links: string[];
  phoneNumbers: string[];
}

/** Reads a screenshot (WhatsApp, SMS, social) and returns the alert text and its metadata. */
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
  prune?: PruneReceipt; // present if the explanation went through the Prune gateway
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

/** Fallback explanation when Gemini doesn't respond: per-label template + the Judge's Spanish reasons. */
export function templateExplanation(v: VerifyResult): Explanation {
  return { ...TEMPLATES[v.label], reasons_es: v.reasons_es.length ? v.reasons_es : v.reasons, source: "template" };
}

/** Turns the swarm's verdict into a simple explanation in English and Spanish. Goes through Prune; on failure, direct Gemini. */
export async function explainVerdict(alertText: string, v: VerifyResult): Promise<Explanation> {
  const verdict = {
    label: v.label,
    confidence: v.confidence,
    reasons: v.reasons,
    matchedOfficialAlert: v.matchedAlert ? `${v.matchedAlert.event} — ${v.matchedAlert.areaDesc}` : null,
  };
  const prompt =
    "You explain hurricane-alert fact-checks to Miami residents, many of them older adults, in plain language (6th-grade level). " +
    "Given the ALERT and the VERDICT from an analysis system, write 2–3 short sentences that say what the verdict means, why, and what the person should do now " +
    "(e.g. follow the official alert and local officials; never pay, share personal data or forward a suspicious message; check weather.gov or miamidade.gov). " +
    "Do not change the verdict. Write `en` in English and `es` in natural Latin American Spanish (not a literal translation). " +
    "Also translate the reasons into Spanish as `reasons_es` (same order, short).\n\n" +
    `ALERT:\n"""${alertText}"""\n\nVERDICT:\n${JSON.stringify(verdict)}`;
  const schema = {
    type: "object",
    properties: {
      en: { type: "string" },
      es: { type: "string" },
      reasons_es: { type: "array", items: { type: "string" } },
    },
    required: ["en", "es", "reasons_es"],
  };
  const viaPrune = await generateJsonViaPrune<Explanation>(prompt, schema, "explanation");
  if (viaPrune) return { ...viaPrune.data, source: "gemini", prune: viaPrune.receipt };
  const e = await generateJson<Explanation>([{ text: prompt }], schema);
  return { ...e, source: "gemini" };
}
