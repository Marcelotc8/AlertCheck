"use client";

import Link from "next/link";
import { useAuth0 } from "@auth0/auth0-react";
import type { Lang } from "@/lib/config";

const T = {
  login: { en: "Sign in", es: "Entrar" },
  logout: { en: "Sign out", es: "Salir" },
  history: { en: "History", es: "Historial" },
};

const btn = "min-h-9 rounded-md border border-white/40 px-2.5 text-sm font-medium hover:bg-white/10 inline-flex items-center";

/** Botón de sesión + enlace a "Mi historial" (para voluntarios y refugios). */
export default function AuthButton({ lang, returnTo = "/", showHistory = true }: { lang: Lang; returnTo?: string; showHistory?: boolean }) {
  const { isAuthenticated, isLoading, user, loginWithRedirect, logout } = useAuth0();
  if (isLoading) return null;

  if (!isAuthenticated) {
    return (
      <button onClick={() => loginWithRedirect({ appState: { returnTo }, authorizationParams: { ui_locales: lang } })} className={btn}>
        {T.login[lang]}
      </button>
    );
  }
  return (
    <>
      {showHistory && (
        <Link href="/history" className={btn} title={user?.email}>
          {T.history[lang]}
        </Link>
      )}
      <button onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })} className={btn}>
        {T.logout[lang]}
      </button>
    </>
  );
}
