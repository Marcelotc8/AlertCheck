// Corre las 10 alertas de demo contra el enjambre real y compara con la etiqueta esperada.
// Uso: npm run demo   (cuesta ~$0.04 por alerta en Swarms)
import { writeFileSync } from "node:fs";
import { verifyAlert } from "../src/swarmVerify.js";
import { DEMO_ALERTS, DEMO_OFFICIAL } from "../src/demo.js";

const rows = await Promise.all(
  DEMO_ALERTS.map(async (a) => {
    try {
      const r = await verifyAlert(a.text, DEMO_OFFICIAL);
      return { ...a, got: r.label, confidence: r.confidence, cost: r.cost ?? 0, reasons: r.reasons, matched: r.matchedAlert?.id ?? null, overridden: r.overridden?.from ?? null };
    } catch (e) {
      return { ...a, got: "error", confidence: 0, cost: 0, reasons: [(e as Error).message], matched: null, overridden: null };
    }
  })
);

let ok = 0;
let total = 0;
for (const r of rows) {
  const pass = r.got === r.expected;
  ok += pass ? 1 : 0;
  total += r.cost;
  console.log(
    `${pass ? "✅" : "❌"} ${r.id.padEnd(7)} esperado=${r.expected.padEnd(10)} obtenido=${String(r.got).padEnd(10)} conf=${r.confidence.toFixed(2)} $${r.cost.toFixed(4)}  match=${r.matched ?? "-"}${r.overridden ? `  (barandal: enjambre dijo ${r.overridden})` : ""}`
  );
  if (!pass) r.reasons.forEach((x) => console.log(`      · ${x}`));
}
console.log(`\n${ok}/${rows.length} correctas (meta: ≥8) · costo total $${total.toFixed(4)}`);
writeFileSync(new URL("../demo-results.json", import.meta.url), JSON.stringify(rows, null, 2));
