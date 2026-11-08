"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { classifyOffline, loadOfficialAlerts, saveOfficialAlerts } from "@/lib/offlineClassifier";
import DEMO_OFFICIAL from "@/lib/demo-official.json";
import demoData from "@api/demoData";
import { API, DEMO, loadLang, saveLang, type Lang } from "@/lib/config";
import Header from "./Header";
import { areaName, eventName } from "@/lib/events";

type Msg = { en: string; es: string }; // los mensajes se guardan en los dos idiomas: cambian al tocar EN/ES

const VERIFY_TIMEOUT_MS = 60000; // enjambre (~8 s) + Gemini (captura y explicación, con reintentos)
const ALERTS_TIMEOUT_MS = 5000;
const MAX_IMAGE_PX = 1600;

type Label = "verified" | "suspicious" | "unverified";
type Result = {
  label: Label;
  confidence: number;
  reasons: string[];
  matchedAlert: { event: string; areaDesc: string; headline?: string } | null;
  cost?: number | null;
  offline?: boolean;
  limited?: boolean; // la API respondió 429 (límite anti-abuso): se analizó en el dispositivo con reglas
  text?: string;
  extracted?: { text: string; channel: string; sender: string } | null;
  explanation?: { en: string; es: string; reasons_es: string[]; prune?: { cacheHit: boolean; costUsd: number } } | null;
  saved?: boolean;
  signedIn?: boolean;
};

// Colores con contraste AA tanto en claro como en oscuro
const STYLE: Record<Label, { icon: string; badge: string; card: string; en: string; es: string }> = {
  verified: {
    icon: "✓",
    badge: "bg-green-700 text-white",
    card: "border-green-600/60 bg-green-50 dark:bg-green-950/40",
    en: "Verified",
    es: "Verificada",
  },
  suspicious: {
    icon: "!",
    badge: "bg-amber-700 text-white",
    card: "border-amber-600/70 bg-amber-50 dark:bg-amber-950/40",
    en: "Suspicious",
    es: "Sospechosa",
  },
  unverified: {
    icon: "?",
    badge: "bg-slate-600 text-white",
    card: "border-line bg-surface",
    en: "Unverified",
    es: "No verificada",
  },
};

const T = {
  title: { en: "Is this hurricane alert real?", es: "¿Es real esta alerta de huracán?" },
  intro: {
    en: "Paste a message you received — or upload a screenshot — and we check it against official National Weather Service alerts.",
    es: "Pega un mensaje que recibiste —o sube una captura— y lo comparamos con las alertas oficiales del Servicio Nacional de Meteorología.",
  },
  placeholder: { en: "Paste the message here…", es: "Pega el mensaje aquí…" },
  upload: { en: "Upload screenshot", es: "Subir captura" },
  remove: { en: "Remove", es: "Quitar" },
  verify: { en: "Check alert", es: "Verificar alerta" },
  examples: { en: "Try an example (Hurricane Milton, Oct 2024):", es: "Prueba un ejemplo (Huracán Milton, oct 2024):" },
  offline: { en: "Offline analysis", es: "Análisis sin conexión" },
  offlineNote: {
    en: "No connection: checked on your device against the last official alerts it saved.",
    es: "Sin conexión: revisado en tu dispositivo con las últimas alertas oficiales guardadas.",
  },
  limitedNote: {
    en: "The AI check is busy right now, so this was checked on your device with our safety rules.",
    es: "El análisis con IA está ocupado en este momento: se revisó en tu dispositivo con nuestras reglas de seguridad.",
  },
  genericError: { en: "Something went wrong. Please try again.", es: "Algo salió mal. Intenta de nuevo." },
  viaPrune: { en: "Gemini via Prune", es: "Gemini vía Prune" },
  status: { en: "Offline mode — still works", es: "Sin conexión — sigue funcionando" },
  readFromImage: { en: "Text read from the screenshot", es: "Texto leído de la captura" },
  savedToHistory: { en: "Saved to your history", es: "Guardado en tu historial" },
  confidence: { en: "confidence", es: "de confianza" },
  official: { en: "Matches official alert", es: "Coincide con la alerta oficial" },
  imageOffline: {
    en: "Screenshots can only be read with a connection. Paste the text of the message instead.",
    es: "Las capturas solo se pueden leer con conexión. Pega el texto del mensaje.",
  },
  demoBanner: {
    en: "Demo mode: compared with archived official alerts from Hurricane Milton (Oct 9, 2024).",
    es: "Modo demo: se compara con alertas oficiales archivadas del Huracán Milton (9 oct 2024).",
  },
  footer: {
    en: "StormCheck is not an official source. Always follow weather.gov and your county. In an emergency, call 911.",
    es: "StormCheck no es una fuente oficial. Sigue siempre a weather.gov y a tu condado. En una emergencia, llama al 911.",
  },
};

// Pasos que se muestran mientras trabaja el enjambre (≈20 s); son orientativos, el backend no los reporta.
const STEPS = {
  image: { en: "Reading the screenshot with Gemini…", es: "Leyendo la captura con Gemini…" },
  steps: [
    { en: "Extracting what the message claims…", es: "Extrayendo lo que dice el mensaje…" },
    { en: "Comparing with official NWS alerts…", es: "Comparando con las alertas oficiales del NWS…" },
    { en: "Looking for scam signals…", es: "Buscando señales de estafa…" },
    { en: "The judge agent is deciding…", es: "El agente juez está decidiendo…" },
    { en: "Writing a plain-language explanation…", es: "Redactando una explicación sencilla…" },
  ],
};

const EXAMPLES = ["real-4", "fake-1", "fake-3", "fake-5"].map((id) => demoData.alerts.find((a) => a.id === id)!);
const EXAMPLE_LABEL: Record<string, { en: string; es: string }> = {
  "real-4": { en: "NWS Tornado Warning", es: "Aviso de tornado del NWS" },
  "fake-1": { en: "Evacuation \"fee\" SMS", es: "SMS: \"pago\" por evacuar" },
  "fake-3": { en: "WhatsApp chain", es: "Cadena de WhatsApp" },
  "fake-5": { en: "Fake shelter", es: "Refugio falso" },
};

/** Reduce la imagen a ≤1600 px y la pasa a JPEG base64 para no mandar fotos de varios MB. */
async function toJpegBase64(file: File): Promise<{ data: string; mimeType: string; preview: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_PX / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const preview = canvas.toDataURL("image/jpeg", 0.85);
  return { data: preview.split(",")[1], mimeType: "image/jpeg", preview };
}

export default function Home() {
  const [text, setText] = useState("");
  const [image, setImage] = useState<{ data: string; mimeType: string; preview: string } | null>(null);
  const [lang, setLang] = useState<Lang>("es");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);
  const [online, setOnline] = useState(true);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<Msg | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLElement>(null);
  const { isAuthenticated, getAccessTokenSilently } = useAuth0();

  useEffect(() => setLang(loadLang()), []);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  function toggleLang() {
    const next = lang === "en" ? "es" : "en";
    setLang(next);
    saveLang(next);
  }

  // Indicador de conexión
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  // Con red: guardar las últimas alertas oficiales en el dispositivo
  useEffect(() => {
    if (DEMO) saveOfficialAlerts(DEMO_OFFICIAL); // listos en el dispositivo aunque nunca haya red
    if (!API) return;
    fetch(`${API}/alerts${DEMO ? "?demo=true" : ""}`, { signal: AbortSignal.timeout(ALERTS_TIMEOUT_MS) })
      .then((r) => r.json())
      .then(saveOfficialAlerts)
      .catch(() => {});
  }, []);

  // Avanzar los pasos visibles mientras se espera la respuesta
  useEffect(() => {
    if (!loading) return;
    setStep(0);
    const id = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.steps.length - 1)), 4000);
    return () => clearInterval(id);
  }, [loading]);

  // Llevar la vista al resultado en el celular
  useEffect(() => {
    if (result) resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [result]);

  async function onFile(file?: File) {
    if (!file) return;
    setError(null);
    try {
      setImage(await toJpegBase64(file));
    } catch {
      setError({ en: "Could not open that image.", es: "No se pudo abrir esa imagen." });
    }
  }

  function clearImage() {
    setImage(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function verify() {
    setLoading(true); setError(null); setResult(null);
    const canReach = API && navigator.onLine;
    try {
      // Sin backend o sin red: directo al clasificador local, sin esperar
      if (!canReach) throw new Error("offline");
      // Con sesión iniciada, el token de Auth0 permite guardar la verificación en "Mi historial"
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (isAuthenticated) {
        const token = await getAccessTokenSilently().catch(() => null);
        if (token) headers.Authorization = `Bearer ${token}`;
      }
      const r = await fetch(`${API}/verify`, {
        method: "POST",
        headers,
        body: JSON.stringify({ text, image: image && { data: image.data, mimeType: image.mimeType }, demo: DEMO }),
        signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
      });
      const data = await r.json().catch(() => ({}));
      // Error de la captura con el servidor disponible: mostrarlo, no inventar un veredicto
      if (!r.ok && image && !text.trim()) {
        setError(data.error ? { es: data.error, en: data.error_en ?? data.error } : T.genericError);
        return;
      }
      if (r.status === 429 && text.trim()) {
        setResult({ ...classifyOffline(text, loadOfficialAlerts(), { ignoreExpiry: DEMO }), limited: true });
        return;
      }
      if (!r.ok) throw new Error(data.error ?? r.statusText);
      setResult(data);
    } catch {
      if (!text.trim()) {
        setError(T.imageOffline);
        return;
      }
      setResult(classifyOffline(text, loadOfficialAlerts(), { ignoreExpiry: DEMO }));
    } finally {
      setLoading(false);
    }
  }

  const s = result ? STYLE[result.label] : null;
  const reasons =
    lang === "es" && result?.explanation?.reasons_es?.length ? result.explanation.reasons_es : result?.reasons ?? [];
  const stepText = image && step === 0 ? STEPS.image[lang] : STEPS.steps[step][lang];

  return (
    <>
      <Header lang={lang} onToggleLang={toggleLang} />

      {!online && (
        <div role="status" className="bg-slate-700 text-white text-sm text-center py-1.5 px-4">
          ⚡ {T.status[lang]}
        </div>
      )}

      <main className="mx-auto max-w-xl px-4 py-6 space-y-5">
        <section className="space-y-2">
          <h1 className="text-2xl font-bold leading-tight">{T.title[lang]}</h1>
          <p className="text-[15px] text-muted leading-relaxed">{T.intro[lang]}</p>
        </section>

        <div className="rounded-xl border border-line bg-surface p-3 space-y-3 shadow-sm">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            aria-label={T.placeholder[lang]}
            className="w-full resize-y rounded-lg border border-line bg-transparent p-3 leading-relaxed focus:outline-none focus:ring-2 focus:ring-accent"
            placeholder={T.placeholder[lang]}
          />

          <div className="flex flex-wrap items-center gap-3">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            <button
              onClick={() => fileRef.current?.click()}
              className="min-h-11 rounded-lg border border-line px-4 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5"
            >
              📷 {T.upload[lang]}
            </button>
            {image && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.preview} alt="" className="h-12 w-12 rounded-md border border-line object-cover" />
                <button onClick={clearImage} className="min-h-11 text-sm underline text-muted">
                  {T.remove[lang]}
                </button>
              </>
            )}
          </div>

          <button
            onClick={verify}
            disabled={(!text.trim() && !image) || loading}
            className="min-h-12 w-full rounded-lg bg-accent font-semibold text-white shadow-sm transition hover:brightness-110 disabled:opacity-50"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />
                {stepText}
              </span>
            ) : (
              T.verify[lang]
            )}
          </button>
        </div>

        {DEMO && !loading && (
          <section className="space-y-2">
            <p className="text-sm text-muted">{T.examples[lang]}</p>
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex.id}
                  onClick={() => {
                    setText(ex.text);
                    clearImage();
                    setResult(null);
                  }}
                  className="min-h-10 rounded-full border border-line bg-surface px-3 text-sm hover:border-accent"
                >
                  {EXAMPLE_LABEL[ex.id][lang]}
                </button>
              ))}
            </div>
          </section>
        )}

        {error && <p role="alert" className="rounded-lg border border-red-600/50 bg-red-50 dark:bg-red-950/40 p-3 text-sm text-red-700 dark:text-red-300">{error[lang]}</p>}

        {result && s && (
          <section ref={resultRef} aria-live="polite" className={`scroll-mt-4 rounded-xl border-2 p-4 space-y-3 ${s.card}`}>
            <div className="flex flex-wrap items-center gap-3">
              <span className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-lg font-bold ${s.badge}`}>
                <span aria-hidden className="grid h-6 w-6 place-items-center rounded-full bg-white/25 text-base">{s.icon}</span>
                {s[lang]}
              </span>
              <span className="text-sm text-muted">
                {Math.round(result.confidence * 100)}% {T.confidence[lang]}
              </span>
              {result.offline && (
                <span className="rounded-md bg-slate-700 px-2 py-0.5 text-xs font-medium text-white">⚡ {T.offline[lang]}</span>
              )}
            </div>

            {result.explanation && <p className="leading-relaxed">{result.explanation[lang]}</p>}

            {reasons.length > 0 && (
              <ul className="list-disc space-y-1 pl-5 text-[15px]">
                {reasons.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            )}

            {result.matchedAlert && (
              <div className="rounded-lg border border-green-600/40 bg-surface p-3 text-sm">
                <p className="font-semibold">🏛️ {T.official[lang]}</p>
                <p className="mt-1">{eventName(result.matchedAlert.event, lang)} — {areaName(result.matchedAlert.areaDesc, lang)}</p>
              </div>
            )}

            {result.offline && <p className="text-xs text-muted">{result.limited ? T.limitedNote[lang] : T.offlineNote[lang]}</p>}

            {result.extracted?.text && (
              <details className="text-sm">
                <summary className="cursor-pointer text-muted">{T.readFromImage[lang]}</summary>
                <p className="mt-2 whitespace-pre-wrap rounded-lg bg-black/5 dark:bg-white/5 p-2">{result.extracted.text}</p>
              </details>
            )}

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              {typeof result.cost === "number" && <span>Swarms: ${result.cost.toFixed(4)}</span>}
              {result.explanation?.prune && <span>{T.viaPrune[lang]}: ${result.explanation.prune.costUsd.toFixed(4)}</span>}
              {result.saved && result.signedIn && <span>✓ {T.savedToHistory[lang]}</span>}
            </div>
          </section>
        )}

        {DEMO && <p className="text-xs text-muted">{T.demoBanner[lang]}</p>}
      </main>

      <footer className="mx-auto max-w-xl px-4 pb-8 pt-2 text-xs text-muted leading-relaxed">
        {T.footer[lang]}{" "}
        <a href="https://www.weather.gov/mfl/" className="underline" target="_blank" rel="noreferrer">weather.gov/mfl</a>
        {" · "}
        <a href="https://www.miamidade.gov/global/emergency/home.page" className="underline" target="_blank" rel="noreferrer">miamidade.gov</a>
      </footer>
    </>
  );
}
