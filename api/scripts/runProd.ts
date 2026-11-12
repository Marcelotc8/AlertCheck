// Runs the 10 demo alerts end to end against the public API (Vultr): HTTPS → Swarms + Gemini → Tiger Data.
// Usage: npm run demo:prod   (or API_URL=https://... npm run demo:prod). Costs ~$0.04 per alert.
const API = process.env.API_URL ?? "https://149-28-101-147.sslip.io";

type Demo = { id: string; expected: string; text: string };
const alerts = (await (await fetch(`${API}/demo`)).json()) as Demo[];

const t0 = Date.now();
const rows = await Promise.all(
  alerts.map(async (a) => {
    const start = Date.now();
    try {
      const r = await fetch(`${API}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: a.text, demo: true }),
        signal: AbortSignal.timeout(90000),
      });
      const d = (await r.json()) as Record<string, any>;
      if (!r.ok) throw new Error(d.error ?? r.statusText);
      return { ...a, got: d.label, conf: d.confidence, cost: d.cost ?? 0, matched: d.matchedAlert?.id ?? "-", expl: d.explanation?.source, saved: d.saved, overridden: d.overridden?.from, secs: (Date.now() - start) / 1000 };
    } catch (e) {
      return { ...a, got: "error", conf: 0, cost: 0, matched: (e as Error).message, expl: "-", saved: false, overridden: undefined, secs: (Date.now() - start) / 1000 };
    }
  })
);

let ok = 0;
let cost = 0;
for (const r of rows) {
  const pass = r.got === r.expected;
  ok += +pass;
  cost += r.cost;
  console.log(
    `${pass ? "✅" : "❌"} ${r.id.padEnd(7)} expected=${r.expected.padEnd(10)} got=${String(r.got).padEnd(10)} conf=${Number(r.conf).toFixed(2)} ${r.secs.toFixed(1)}s $${r.cost.toFixed(4)} expl=${r.expl} db=${r.saved ? "✓" : "✗"} match=${r.matched}${r.overridden ? ` (guardrail: swarm said ${r.overridden})` : ""}`
  );
}
console.log(`\n${ok}/${rows.length} correct (goal: ≥8) · cost $${cost.toFixed(4)} · ${((Date.now() - t0) / 1000).toFixed(1)}s total · ${API}`);
