// Flujo completo de una verificación: enjambre + barandales + explicación segura.
// Lo usan la API (/verify) y las pruebas de ataque (scripts/redteam.ts), así se prueba exactamente lo que corre.
import { verifyAlert, type OfficialAlert, type VerifyResult } from "./swarmVerify.js";
import { explainVerdict, templateExplanation, type Explanation } from "./gemini.js";
import { extractHosts, extractPhones, isOfficialHost } from "./scamSignals.js";

/** Tapa teléfonos y enlaces no oficiales: lo que muestra StormCheck nunca puede servirle de canal al estafador. */
export function redact(s: string): string {
  let out = s.replace(/(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, "[teléfono]");
  for (const h of extractHosts(out)) if (!isOfficialHost(h)) out = out.split(h).join("[enlace]");
  return out;
}

// "es real / is official" sin un "no/not" justo antes.
const AFFIRMS_REAL = /(?<!\bnot |\bno )\b(is|es) (real|official|oficial|legitimate|legítima|authentic|auténtica|verdadera|verified|verificada|genuine)\b/i;

/** ¿La explicación de la IA es segura para mostrarla con la autoridad de StormCheck? */
export function explanationProblems(e: { en: string; es: string }, label: VerifyResult["label"]): string[] {
  const both = `${e.en}\n${e.es}`;
  const problems: string[] = [];
  if (extractPhones(both).length) problems.push("phone number");
  if (extractHosts(both).some((h) => !isOfficialHost(h))) problems.push("non-official link");
  if (label !== "verified" && AFFIRMS_REAL.test(both)) problems.push("contradicts the label");
  return problems;
}

/**
 * Explicación que se muestra al usuario. En "suspicious" NUNCA se deja escribir texto libre a la IA
 * (es justo donde un estafador intentaría colar "esto es real, llama al…"): se usa una plantilla revisada.
 */
export async function safeExplanation(text: string, v: VerifyResult): Promise<Explanation> {
  if (v.label === "suspicious") return templateExplanation(v);
  try {
    const e = await explainVerdict(text, v);
    const problems = explanationProblems(e, v.label);
    if (problems.length) {
      console.warn(`explicación descartada (${problems.join(", ")}) → plantilla`);
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
