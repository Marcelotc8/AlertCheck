"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth0 } from "@auth0/auth0-react";
import { API, loadLang, saveLang, type Lang } from "@/lib/config";
import AuthButton from "../AuthButton";

type Check = {
  id: string;
  text: string;
  label: "verified" | "suspicious" | "unverified";
  confidence: number;
  reasons: string[];
  reasons_es: string[];
  source: string;
  demo: boolean;
  created_at: string;
};

const STYLE = {
  verified: { cls: "bg-green-600", en: "Verified", es: "Verificada" },
  suspicious: { cls: "bg-amber-500", en: "Suspicious", es: "Sospechosa" },
  unverified: { cls: "bg-gray-500", en: "Unverified", es: "No verificada" },
};

const T = {
  title: { en: "My history", es: "Mi historial" },
  intro: {
    en: "Alerts you checked while signed in — useful for volunteers and shelters to track what is circulating.",
    es: "Las alertas que revisaste con tu sesión iniciada: útil para voluntarios y refugios que siguen lo que circula.",
  },
  back: { en: "← Check an alert", es: "← Verificar una alerta" },
  signIn: { en: "Sign in to see the alerts you have checked.", es: "Inicia sesión para ver las alertas que has revisado." },
  empty: { en: "No checks yet. Verify an alert while signed in and it will show up here.", es: "Aún no hay verificaciones. Verifica una alerta con tu sesión iniciada y aparecerá aquí." },
  loading: { en: "Loading…", es: "Cargando…" },
  offline: { en: "History needs a connection.", es: "El historial necesita conexión." },
  screenshot: { en: "screenshot", es: "captura" },
  summary: { en: "checks", es: "verificaciones" },
  summaryOne: { en: "check", es: "verificación" },
};

export default function History() {
  const [lang, setLang] = useState<Lang>("es");
  const { isAuthenticated, isLoading, getAccessTokenSilently } = useAuth0();
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setLang(loadLang()), []);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (!API || !navigator.onLine) {
      setError(T.offline[lang]);
      return;
    }
    (async () => {
      try {
        const token = await getAccessTokenSilently();
        const r = await fetch(`${API}/history`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(15000),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? r.statusText);
        setChecks(data);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  const counts = (checks ?? []).reduce<Record<string, number>>((m, c) => ({ ...m, [c.label]: (m[c.label] ?? 0) + 1 }), {});
  const date = (iso: string) =>
    new Date(iso).toLocaleString(lang === "es" ? "es-US" : "en-US", { dateStyle: "medium", timeStyle: "short" });

  return (
    <main className="mx-auto max-w-xl p-4 sm:p-8 space-y-6">
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">{T.title[lang]}</h1>
        <div className="flex items-center gap-2">
          <AuthButton lang={lang} returnTo="/history" showHistory={false} />
          <button
            onClick={() => {
              const next = lang === "en" ? "es" : "en";
              setLang(next);
              saveLang(next);
            }}
            className="rounded border px-3 py-1 text-sm"
          >
            {lang === "en" ? "Español" : "English"}
          </button>
        </div>
      </header>

      <Link href="/" className="text-sm underline">{T.back[lang]}</Link>
      <p className="text-sm opacity-80">{T.intro[lang]}</p>

      {isLoading && <p className="text-sm opacity-70">{T.loading[lang]}</p>}
      {!isLoading && !isAuthenticated && <p className="text-sm">{T.signIn[lang]}</p>}
      {error && <p role="alert" className="text-red-600 text-sm">{error}</p>}
      {isAuthenticated && !checks && !error && <p className="text-sm opacity-70">{T.loading[lang]}</p>}
      {checks && checks.length === 0 && <p className="text-sm">{T.empty[lang]}</p>}

      {checks && checks.length > 0 && (
        <>
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="opacity-70">{checks.length} {checks.length === 1 ? T.summaryOne[lang] : T.summary[lang]}:</span>
            {(Object.keys(STYLE) as Check["label"][]).filter((l) => counts[l]).map((l) => (
              <span key={l} className={`rounded px-2 py-0.5 text-white ${STYLE[l].cls}`}>
                {STYLE[l][lang]} · {counts[l]}
              </span>
            ))}
          </div>
          <ul className="space-y-3">
            {checks.map((c) => {
              const reasons = lang === "es" && c.reasons_es?.length ? c.reasons_es : c.reasons;
              return (
                <li key={c.id} className="rounded-lg border p-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className={`rounded px-2 py-0.5 font-bold text-white ${STYLE[c.label].cls}`}>{STYLE[c.label][lang]}</span>
                    <span className="opacity-70">{Math.round(c.confidence * 100)}%</span>
                    <span className="opacity-60">{date(c.created_at)}</span>
                    {c.source === "image" && <span className="text-xs rounded border px-1.5">📷 {T.screenshot[lang]}</span>}
                    {c.demo && <span className="text-xs rounded border px-1.5">demo</span>}
                  </div>
                  <p className="text-sm line-clamp-3 whitespace-pre-wrap">{c.text}</p>
                  {reasons?.[0] && <p className="text-xs opacity-70">• {reasons[0]}</p>}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </main>
  );
}
