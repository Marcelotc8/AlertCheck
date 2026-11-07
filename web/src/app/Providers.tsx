"use client";

import { Auth0Provider } from "@auth0/auth0-react";
import { AUTH0 } from "@/lib/config";

/** Inicio de sesión con Auth0 (Universal Login + PKCE). La sesión se guarda en el dispositivo para sobrevivir recargas. */
export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <Auth0Provider
      domain={AUTH0.domain}
      clientId={AUTH0.clientId}
      authorizationParams={{
        redirect_uri: typeof window === "undefined" ? undefined : window.location.origin,
        audience: AUTH0.audience,
      }}
      cacheLocation="localstorage"
      useRefreshTokens
      useRefreshTokensFallback
      onRedirectCallback={(appState) => {
        // Volver a la página desde la que se inició sesión (p. ej. /history) y limpiar ?code=&state= de la URL
        window.history.replaceState({}, "", appState?.returnTo ?? window.location.pathname);
        if (appState?.returnTo && appState.returnTo !== "/") window.location.assign(appState.returnTo);
      }}
    >
      {children}
    </Auth0Provider>
  );
}
