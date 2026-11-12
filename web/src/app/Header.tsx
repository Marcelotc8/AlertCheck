"use client";

import Link from "next/link";
import type { Lang } from "@/lib/config";
import AuthButton from "./AuthButton";

/** Shared header: logo, session (Auth0) and language switch. Compact for 320–375 px screens. */
export default function Header({
  lang,
  onToggleLang,
  returnTo = "/",
  showHistory = true,
}: {
  lang: Lang;
  onToggleLang: () => void;
  returnTo?: string;
  showHistory?: boolean;
}) {
  return (
    <header className="bg-brand text-white border-b border-white/10">
      <div className="mx-auto flex max-w-xl items-center justify-between gap-2 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-bold text-lg tracking-tight">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192.png" alt="" className="h-8 w-8 rounded-md" />
          StormCheck
        </Link>
        <div className="flex items-center gap-1.5">
          <AuthButton lang={lang} returnTo={returnTo} showHistory={showHistory} />
          <button
            onClick={onToggleLang}
            aria-label={lang === "en" ? "Cambiar a español" : "Switch to English"}
            className="min-h-9 rounded-md border border-white/40 px-2.5 text-sm font-medium hover:bg-white/10"
          >
            {lang === "en" ? "ES" : "EN"}
          </button>
        </div>
      </div>
    </header>
  );
}
