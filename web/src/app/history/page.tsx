"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth0 } from "@auth0/auth0-react";
import { API, loadLang, saveLang, type Lang } from "@/lib/config";
import Header from "../Header";

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
  verified: { cls: "bg-green-700", en: "Verified", es: "Verificada" },
  suspicious: { cls: "bg-amber-700", en: "Suspicious", es: "Sospechosa" },
  unverified: { cls: "bg-slate-600", en: "Unverified", es: "No verificada" },
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

  function toggleLang() {
    const next = lang === "en" ? "es" : "en";
    setLang(next);
    saveLang(next);
  }

  return (
    <>
      <Header lang={lang} onToggleLang={toggleLang} returnTo="/history" showHistory={false} />
      <main className="mx-auto max-w-xl px-4 py-6 space-y-5">
        <Link href="/" className="inline-block text-sm underline text-muted">{T.back[lang]}</Link>
        <section className="space-y-2">
          <h1 className="text-2xl font-bold">{T.title[lang]}</h1>
          <p className="text-[15px] text-muted leading-relaxed">{T.intro[lang]}</p>
        </section>

        {isLoading && <p className="text-sm text-muted">{T.loading[lang]}</p>}
        {!isLoading && !isAuthenticated && <p className="rounded-xl border border-line bg-surface p-4">{T.signIn[lang]}</p>}
        {error && <p role="alert" className="rounded-lg border border-red-600/50 bg-red-50 dark:bg-red-950/40 p-3 text-sm text-red-700 dark:text-red-300">{error}</p>}
        {isAuthenticated && !checks && !error && <p className="text-sm text-muted">{T.loading[lang]}</p>}
        {checks && checks.length === 0 && <p className="rounded-xl border border-line bg-surface p-4">{T.empty[lang]}</p>}

        {checks && checks.length > 0 && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted">{checks.length} {checks.length === 1 ? T.summaryOne[lang] : T.summary[lang]}:</span>
              {(Object.keys(STYLE) as Check["label"][]).filter((l) => counts[l]).map((l) => (
                <span key={l} className={`rounded-md px-2 py-0.5 font-medium text-white ${STYLE[l].cls}`}>
                  {STYLE[l][lang]} · {counts[l]}
                </span>
              ))}
            </div>
            <ul className="space-y-3">
              {checks.map((c) => {
                const reasons = lang === "es" && c.reasons_es?.length ? c.reasons_es : c.reasons;
                return (
                  <li key={c.id} className="rounded-xl border border-line bg-surface p-4 space-y-2 shadow-sm">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className={`rounded-md px-2 py-0.5 font-bold text-white ${STYLE[c.label].cls}`}>{STYLE[c.label][lang]}</span>
                      <span className="text-muted">{Math.round(c.confidence * 100)}%</span>
                      <span className="text-muted">{date(c.created_at)}</span>
                      {c.source === "image" && <span className="rounded border border-line px-1.5 text-xs">📷 {T.screenshot[lang]}</span>}
                      {c.demo && <span className="rounded border border-line px-1.5 text-xs">demo</span>}
                    </div>
                    <p className="line-clamp-3 whitespace-pre-wrap text-[15px]">{c.text}</p>
                    {reasons?.[0] && <p className="text-sm text-muted">• {reasons[0]}</p>}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </main>
    </>
  );
}
