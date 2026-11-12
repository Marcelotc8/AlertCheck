"use client";

import { Auth0Provider } from "@auth0/auth0-react";
import { AUTH0 } from "@/lib/config";

/** Sign-in with Auth0 (Universal Login + PKCE). The session is stored on the device to survive reloads. */
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
        // Return to the page sign-in started from (e.g. /history) and strip ?code=&state= from the URL
        window.history.replaceState({}, "", appState?.returnTo ?? window.location.pathname);
        if (appState?.returnTo && appState.returnTo !== "/") window.location.assign(appState.returnTo);
      }}
    >
      {children}
    </Auth0Provider>
  );
}
