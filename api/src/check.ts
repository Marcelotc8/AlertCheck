// Full verification flow: swarm + guardrails + safe explanation.
// Used by the API (/verify) and the attack tests (scripts/redteam.ts), so we test exactly what runs.
import { verifyAlert, type OfficialAlert, type VerifyResult } from "./swarmVerify.js";
import { explainVerdict, templateExplanation, type Explanation } from "./gemini.js";
import { extractHosts, extractPhones, isOfficialHost } from "./scamSignals.js";

/** Masks phones and unofficial links: what AlertCheck shows can never become a channel for the scammer. */
export function redact(s: string): string {
  let out = s.replace(/(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, "[teléfono]");
  for (const h of extractHosts(out)) if (!isOfficialHost(h)) out = out.split(h).join("[enlace]");
  return out;
}

// "es real / is official" without a "no/not" right before it.
const AFFIRMS_REAL = /(?<!\bnot |\bno )\b(is|es) (real|official|oficial|legitimate|legítima|authentic|auténtica|verdadera|verified|verificada|genuine)\b/i;

/** Is the AI's explanation safe to show with AlertCheck's authority? */
export function explanationProblems(e: { en: string; es: string }, label: VerifyResult["label"]): string[] {
  const both = `${e.en}\n${e.es}`;
  const problems: string[] = [];
  if (extractPhones(both).length) problems.push("phone number");
  if (extractHosts(both).some((h) => !isOfficialHost(h))) problems.push("non-official link");
  if (label !== "verified" && AFFIRMS_REAL.test(both)) problems.push("contradicts the label");
  return problems;
}

/**
 * Explanation shown to the user. For "suspicious" the AI is NEVER allowed to write free text
 * (that's exactly where a scammer would try to slip in "this is real, call…"): a reviewed template is used.
 */
export async function safeExplanation(text: string, v: VerifyResult): Promise<Explanation> {
  if (v.label === "suspicious") return templateExplanation(v);
  try {
    const e = await explainVerdict(text, v);
    const problems = explanationProblems(e, v.label);
    if (problems.length) {
      console.warn(`explanation discarded (${problems.join(", ")}) → template`);
      return templateExplanation(v);
    }
    return e;
  } catch (err) {
    console.warn("explainVerdict:", (err as Error).message);
    return templateExplanation(v);
  }
}

export async function checkAlert(text: string, official?: OfficialAlert[]): Promise<VerifyResult & { explanation: Explanation }> {
  const verdict = await verifyAlert(text, official);
  verdict.reasons = verdict.reasons.map(redact);
  verdict.reasons_es = verdict.reasons_es.map(redact);
  const explanation = await safeExplanation(text, verdict);
  explanation.reasons_es = explanation.reasons_es.map(redact);
  return { ...verdict, explanation };
}
