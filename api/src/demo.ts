// Modo demo: avisos oficiales archivados (Huracán Milton, 9 oct 2024) como officialOverride.
import { readFileSync } from "node:fs";
import type { Label, OfficialAlert } from "./swarmVerify.js";

export interface DemoAlert {
  id: string;
  kind: "official" | "fake";
  expected: Label;
  text: string;
  source?: string;
  pattern?: string;
}

const data = JSON.parse(readFileSync(new URL("./demo-alerts.json", import.meta.url), "utf8")) as {
  official: OfficialAlert[];
  alerts: DemoAlert[];
};

export const DEMO_OFFICIAL: OfficialAlert[] = data.official;
export const DEMO_ALERTS: DemoAlert[] = data.alerts;

/** DEMO_MODE=true en .env fuerza el modo demo para todas las verificaciones. */
export const demoForced = () => process.env.DEMO_MODE === "true";
