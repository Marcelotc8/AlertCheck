// Demo mode: archived official advisories (Hurricane Milton, Oct 9 2024) as officialOverride.
import type { Label, OfficialAlert } from "./swarmVerify.js";
// Data lives in a TS module (not a JSON read from disk) so it works the same in Node, on the server and on Vercel.
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

/** DEMO_MODE=true in .env forces demo mode for every verification. */
export const demoForced = () => process.env.DEMO_MODE === "true";
