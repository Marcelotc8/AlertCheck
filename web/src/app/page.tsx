"use client";

import { useEffect, useState } from "react";
import { classifyOffline, loadOfficialAlerts, saveOfficialAlerts } from "@/lib/offlineClassifier";

// Sin NEXT_PUBLIC_API_URL en producción no hay backend: se usa solo el modo sin conexión.
const API: string | null =
  process.env.NEXT_PUBLIC_API_URL ?? (process.env.NODE_ENV === "development" ? "http://localhost:8787" : null);
const VERIFY_TIMEOUT_MS = 20000; // el enjambre tarda ~7–10 s
const ALERTS_TIMEOUT_MS = 5000;

type Result = {
  label: "verified" | "suspicious" | "unverified";
  confidence: number;
  reasons: string[];
  matchedAlert: { event: string; areaDesc: string; headline?: string } | null;
  cost?: number | null;
  offline?: boolean;
  mock?: boolean;
};

const STYLE = {
  verified: { cls: "bg-green-600", en: "Verified", es: "Verificada" },
  suspicious: { cls: "bg-amber-500", en: "Suspicious", es: "Sospechosa" },
  unverified: { cls: "bg-gray-500", en: "Unverified", es: "No verificada" },
};

export default function Home() {
  const [text, setText] = useState("");
  const [lang, setLang] = useState<"en" | "es">("es");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Con red: guardar las últimas alertas oficiales en el dispositivo
  useEffect(() => {
    if (!API) return;
    fetch(`${API}/alerts`, { signal: AbortSignal.timeout(ALERTS_TIMEOUT_MS) })
      .then((r) => r.json())
      .then(saveOfficialAlerts)
      .catch(() => {});
  }, []);

  async function verify() {
    setLoading(true); setError(null); setResult(null);
    try {
      // Sin backend o sin red: directo al clasificador local, sin esperar
      if (!API || !navigator.onLine) throw new Error("offline");
      const r = await fetch(`${API}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? r.statusText);
      setResult(await r.json());
    } catch {
      setResult(classifyOffline(text, loadOfficialAlerts()));
    } finally {
      setLoading(false);
    }
  }

  const s = result ? STYLE[result.label] : null;

  return (
    <main className="mx-auto max-w-xl p-4 sm:p-8 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">StormCheck</h1>
        <button onClick={() => setLang(lang === "en" ? "es" : "en")} className="rounded border px-3 py-1 text-sm">
          {lang === "en" ? "Español" : "English"}
        </button>
      </header>

      <p className="text-sm opacity-80">
        {lang === "en"
          ? "Paste a hurricane alert you received and check if it's real."
          : "Pega una alerta de huracán que recibiste y comprueba si es real."}
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={7}
        className="w-full rounded border p-3 text-sm bg-transparent"
        placeholder={lang === "en" ? "Paste the message here…" : "Pega el mensaje aquí…"}
      />

      <button
        onClick={verify}
        disabled={!text.trim() || loading}
        className="w-full rounded bg-blue-700 py-3 font-semibold text-white disabled:opacity-50"
      >
        {loading ? (lang === "en" ? "Checking…" : "Verificando…") : lang === "en" ? "Verify" : "Verificar"}
      </button>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      {result && s && (
        <section className="rounded-lg border p-4 space-y-3">
          <div className="flex items-center gap-3">
            <span className={`rounded px-3 py-1 font-bold text-white ${s.cls}`}>{s[lang]}</span>
            <span className="text-sm opacity-70">{Math.round(result.confidence * 100)}%</span>
            {result.offline && (
              <span className="text-xs rounded bg-gray-200 text-gray-800 px-2 py-0.5">
                {lang === "en" ? "Offline analysis" : "Análisis sin conexión"}
              </span>
            )}
          </div>
          <ul className="list-disc pl-5 text-sm space-y-1">
            {result.reasons.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
          {result.matchedAlert && (
            <p className="text-sm">
              <b>NWS:</b> {result.matchedAlert.event} — {result.matchedAlert.areaDesc}
            </p>
          )}
          {typeof result.cost === "number" && (
            <p className="text-xs opacity-60">Swarms cost: ${result.cost.toFixed(4)}</p>
          )}
        </section>
      )}
    </main>
  );
}
