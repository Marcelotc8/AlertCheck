// Prueba el flujo completo con capturas: Gemini lee → enjambre → explicación bilingüe.
// Uso: npm run test:images   (backend corriendo en localhost:8787)
import { readFileSync, readdirSync } from "node:fs";

const dir = new URL("../../demo-screenshots/", import.meta.url);
for (const f of readdirSync(dir).filter((f) => f.endsWith(".png"))) {
  const t0 = Date.now();
  const r = await fetch("http://localhost:8787/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image: { data: readFileSync(new URL(f, dir)).toString("base64"), mimeType: "image/png" },
      demo: true,
    }),
  });
  const j = (await r.json()) as any;
  const s = ((Date.now() - t0) / 1000).toFixed(1);
  if (!r.ok) {
    console.log(`❌ ${f} (${s}s) HTTP ${r.status}: ${j.error}`);
    continue;
  }
  console.log(`✅ ${f} (${s}s) → ${j.label} ${j.confidence} · $${j.cost} · canal=${j.extracted?.channel} · match=${j.matchedAlert?.id ?? "-"}`);
  console.log(`   leído: ${String(j.extracted?.text).slice(0, 110)}…`);
  console.log(`   ES: ${j.explanation?.es ?? "(sin explicación)"}`);
  console.log(`   EN: ${j.explanation?.en ?? "(sin explicación)"}`);
}
