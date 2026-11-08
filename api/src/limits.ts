// Límites contra abuso ("denegación de billetera"): cada verificación cuesta dinero real (Swarms ≈ $0.04).
// En memoria: suficiente para un solo servidor (Vultr + pm2). Generoso a propósito: en un evento muchos comparten la misma IP.

const PER_MINUTE = Number(process.env.RATE_LIMIT_PER_MINUTE ?? 20);
const PER_DAY = Number(process.env.RATE_LIMIT_PER_DAY ?? 300);
const DAILY_BUDGET_USD = Number(process.env.DAILY_BUDGET_USD ?? 10);

const hits = new Map<string, number[]>(); // ip → marcas de tiempo de las últimas 24 h
const DAY = 24 * 60 * 60 * 1000;

/** ¿Puede esta IP hacer otra verificación? (ventana deslizante de 1 min y de 24 h) */
export function allowRequest(ip: string, now = Date.now()): { ok: true } | { ok: false; retryAfterSec: number } {
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < DAY);
  const lastMinute = recent.filter((t) => now - t < 60_000);
  if (lastMinute.length >= PER_MINUTE) return { ok: false, retryAfterSec: Math.ceil((lastMinute[0] + 60_000 - now) / 1000) };
  if (recent.length >= PER_DAY) return { ok: false, retryAfterSec: Math.ceil((recent[0] + DAY - now) / 1000) };
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 10_000) for (const [k, v] of hits) if (!v.some((t) => now - t < DAY)) hits.delete(k); // limpieza
  return { ok: true };
}

let day = new Date().toISOString().slice(0, 10);
let spent = 0;

function rollDay() {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== day) [day, spent] = [today, 0];
}

/** Dólares que quedan hoy (UTC) para análisis con IA. */
export function budgetLeft(): number {
  rollDay();
  return DAILY_BUDGET_USD - spent;
}

export function recordSpend(usd: number) {
  rollDay();
  spent += usd;
}
