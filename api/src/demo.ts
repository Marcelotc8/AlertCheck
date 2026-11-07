// Modo demo: avisos oficiales archivados (Huracán Milton, 9 oct 2024) como officialOverride.
import type { Label, OfficialAlert } from "./swarmVerify.js";
// Datos en un módulo TS (no un JSON leído del disco) para que funcionen igual en Node, en el servidor y en Vercel.
import demoData from "./demoData.js";

export interface DemoAlert {
  id: string;
  kind: "official" | "fake";
  expected: Label;
  text: string;
  source?: string;
  pattern?: string;
}

const data = demoData as unknown as {
  official: OfficialAlert[];
  alerts: DemoAlert[];
};

export const DEMO_OFFICIAL: OfficialAlert[] = data.official;
export const DEMO_ALERTS: DemoAlert[] = data.alerts;

/** DEMO_MODE=true en .env fuerza el modo demo para todas las verificaciones. */
export const demoForced = () => process.env.DEMO_MODE === "true";
