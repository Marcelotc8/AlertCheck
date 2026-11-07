"use client";

import { useEffect, useRef, useState } from "react";
import { classifyOffline, loadOfficialAlerts, saveOfficialAlerts } from "@/lib/offlineClassifier";
import DEMO_OFFICIAL from "@/lib/demo-official.json";

// Modo demo: avisos oficiales archivados del Huracán Milton (9 oct 2024) en lugar de las alertas en vivo.
const DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

// Sin NEXT_PUBLIC_API_URL en producción no hay backend: se usa solo el modo sin conexión.
const API: string | null =
  process.env.NEXT_PUBLIC_API_URL ?? (process.env.NODE_ENV === "development" ? "http://localhost:8787" : null);
const VERIFY_TIMEOUT_MS = 60000; // enjambre (~8 s) + Gemini (captura y explicación, con reintentos)
const ALERTS_TIMEOUT_MS = 5000;
const MAX_IMAGE_PX = 1600;

type Lang = "en" | "es";
type Result = {
  label: "verified" | "suspicious" | "unverified";
  confidence: number;
  reasons: string[];
  matchedAlert: { event: string; areaDesc: string; headline?: string } | null;
  cost?: number | null;
  offline?: boolean;
  text?: string;
  extracted?: { text: string; channel: string; sender: string } | null;
  explanation?: { en: string; es: string; reasons_es: string[] } | null;
};

const STYLE = {
  verified: { cls: "bg-green-600", en: "Verified", es: "Verificada" },
  suspicious: { cls: "bg-amber-500", en: "Suspicious", es: "Sospechosa" },
  unverified: { cls: "bg-gray-500", en: "Unverified", es: "No verificada" },
};

const T = {
  intro: { en: "Paste a hurricane alert you received, or upload a screenshot, and check if it's real.", es: "Pega una alerta de huracán que recibiste, o sube una captura de pantalla, y comprueba si es real." },
  placeholder: { en: "Paste the message here…", es: "Pega el mensaje aquí…" },
  upload: { en: "Upload screenshot", es: "Subir captura" },
  remove: { en: "Remove", es: "Quitar" },
  verify: { en: "Verify", es: "Verificar" },
  checking: { en: "Checking…", es: "Verificando…" },
  offline: { en: "Offline analysis", es: "Análisis sin conexión" },
  readFromImage: { en: "Text read from the screenshot", es: "Texto leído de la captura" },
  imageOffline: {
    en: "Screenshots can only be read with a connection. Paste the text of the message instead.",
    es: "Las capturas solo se pueden leer con conexión. Pega el texto del mensaje.",
  },
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
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Con red: guardar las últimas alertas oficiales en el dispositivo
  useEffect(() => {
    if (DEMO) saveOfficialAlerts(DEMO_OFFICIAL); // listos en el dispositivo aunque nunca haya red
    if (!API) return;
    fetch(`${API}/alerts${DEMO ? "?demo=true" : ""}`, { signal: AbortSignal.timeout(ALERTS_TIMEOUT_MS) })
      .then((r) => r.json())
      .then(saveOfficialAlerts)
      .catch(() => {});
  }, []);

  async function onFile(file?: File) {
    if (!file) return;
    setError(null);
    try {
      setImage(await toJpegBase64(file));
    } catch {
      setError(lang === "en" ? "Could not open that image." : "No se pudo abrir esa imagen.");
    }
  }

  function clearImage() {
    setImage(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function verify() {
    setLoading(true); setError(null); setResult(null);
    const online = API && navigator.onLine;
    try {
      // Sin backend o sin red: directo al clasificador local, sin esperar
      if (!online) throw new Error("offline");
      const r = await fetch(`${API}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, image: image && { data: image.data, mimeType: image.mimeType }, demo: DEMO }),
        signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
      });
      const data = await r.json().catch(() => ({}));
      // Error de la captura con el servidor disponible: mostrarlo, no inventar un veredicto
      if (!r.ok && image && !text.trim()) {
        setError(data.error ?? r.statusText);
        return;
      }
      if (!r.ok) throw new Error(data.error ?? r.statusText);
      setResult(data);
    } catch {
      if (!text.trim()) {
        setError(T.imageOffline[lang]);
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

  return (
    <main className="mx-auto max-w-xl p-4 sm:p-8 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">StormCheck</h1>
        <button onClick={() => setLang(lang === "en" ? "es" : "en")} className="rounded border px-3 py-1 text-sm">
          {lang === "en" ? "Español" : "English"}
        </button>
      </header>

      <p className="text-sm opacity-80">{T.intro[lang]}</p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        className="w-full rounded border p-3 text-sm bg-transparent"
        placeholder={T.placeholder[lang]}
      />

      <div className="flex items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0])}
        />
        <button onClick={() => fileRef.current?.click()} className="rounded border px-3 py-2 text-sm">
          📷 {T.upload[lang]}
        </button>
        {image && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image.preview} alt="" className="h-14 w-14 rounded border object-cover" />
            <button onClick={clearImage} className="text-sm underline opacity-70">
              {T.remove[lang]}
            </button>
          </>
        )}
      </div>

      <button
        onClick={verify}
        disabled={(!text.trim() && !image) || loading}
        className="w-full rounded bg-blue-700 py-3 font-semibold text-white disabled:opacity-50"
      >
        {loading ? T.checking[lang] : T.verify[lang]}
      </button>

      {error && <p role="alert" className="text-red-600 text-sm">{error}</p>}

      {result && s && (
        <section className="rounded-lg border p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className={`rounded px-3 py-1 font-bold text-white ${s.cls}`}>{s[lang]}</span>
            <span className="text-sm opacity-70">{Math.round(result.confidence * 100)}%</span>
            {result.offline && (
              <span className="text-xs rounded bg-gray-200 text-gray-800 px-2 py-0.5">{T.offline[lang]}</span>
            )}
          </div>
          {result.explanation && <p className="text-sm leading-relaxed">{result.explanation[lang]}</p>}
          <ul className="list-disc pl-5 text-sm space-y-1">
            {reasons.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
          {result.matchedAlert && (
            <p className="text-sm">
              <b>NWS:</b> {result.matchedAlert.event} — {result.matchedAlert.areaDesc}
            </p>
          )}
          {result.extracted?.text && (
            <details className="text-sm">
              <summary className="cursor-pointer opacity-70">{T.readFromImage[lang]}</summary>
              <p className="mt-2 whitespace-pre-wrap rounded bg-black/5 p-2">{result.extracted.text}</p>
            </details>
          )}
          {typeof result.cost === "number" && (
            <p className="text-xs opacity-60">Swarms cost: ${result.cost.toFixed(4)}</p>
          )}
        </section>
      )}
    </main>
  );
}
