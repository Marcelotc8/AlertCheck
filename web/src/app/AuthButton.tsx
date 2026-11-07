"use client";

import Link from "next/link";
import { useAuth0 } from "@auth0/auth0-react";
import type { Lang } from "@/lib/config";

const T = {
  login: { en: "Sign in", es: "Iniciar sesión" },
  logout: { en: "Sign out", es: "Cerrar sesión" },
  history: { en: "My history", es: "Mi historial" },
};

/** Botón de sesión + enlace a "Mi historial" (para voluntarios y refugios). */
export default function AuthButton({ lang, returnTo = "/", showHistory = true }: { lang: Lang; returnTo?: string; showHistory?: boolean }) {
  const { isAuthenticated, isLoading, user, loginWithRedirect, logout } = useAuth0();
  if (isLoading) return null;

  if (!isAuthenticated) {
    return (
      <button onClick={() => loginWithRedirect({ appState: { returnTo } })} className="rounded border px-3 py-1 text-sm">
        {T.login[lang]}
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2 text-sm">
      {showHistory && (
        <Link href="/history" className="underline" title={user?.email}>
          {T.history[lang]}
        </Link>
      )}
      <button
        onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
        className="rounded border px-3 py-1"
      >
        {T.logout[lang]}
      </button>
    </div>
  );
}
