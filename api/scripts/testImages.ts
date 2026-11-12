// Tests the full flow with screenshots: Gemini reads → swarm → bilingual explanation.
// Usage: npm run test:images   (backend running on localhost:8787)
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
  console.log(`✅ ${f} (${s}s) → ${j.label} ${j.confidence} · $${j.cost} · channel=${j.extracted?.channel} · match=${j.matchedAlert?.id ?? "-"}`);
  console.log(`   read: ${String(j.extracted?.text).slice(0, 110)}…`);
  console.log(`   ES: ${j.explanation?.es ?? "(no explanation)"}`);
  console.log(`   EN: ${j.explanation?.en ?? "(no explanation)"}`);
}
