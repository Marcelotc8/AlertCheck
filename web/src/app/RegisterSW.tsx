"use client";

import { useEffect } from "react";

/** Registra el service worker (solo en producción, para no interferir con la recarga en caliente). */
export default function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js")
      .then(() => navigator.serviceWorker.ready)
      .then((reg) => {
        const urls = performance
          .getEntriesByType("resource")
          .map((e) => e.name)
          .filter((u) => u.startsWith(location.origin) && !u.includes("/sw.js"));
        reg.active?.postMessage({ type: "precache", urls });
      })
      .catch((e) => console.warn("SW:", e));
  }, []);
  return null;
}
