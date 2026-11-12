// Verification history in Tiger Data (PostgreSQL + TimescaleDB).
// Without DATABASE_URL everything still works: nothing is saved.
import pg from "pg";
import type { VerifyResult } from "./swarmVerify.js";

const url = process.env.DATABASE_URL?.trim();
// The URL's sslmode would make pg require strict verification; TLS encryption is configured below with `ssl`.
const connectionString = url?.replace(/([?&])sslmode=[^&]*&?/, "$1").replace(/[?&]$/, "");
const pool = url
  ? new pg.Pool({
      connectionString,
      max: 3,
      // Tiger Cloud requires TLS; its certificate isn't in Node's store, so the chain isn't validated.
      ssl: url.includes("localhost") ? undefined : { rejectUnauthorized: false },
    })
  : null;

export const dbEnabled = () => pool !== null;

let ready: Promise<void> | null = null;

/** Creates the table once (and turns it into a TimescaleDB hypertable by time). */
function ensureSchema(): Promise<void> {
  if (!pool) return Promise.resolve();
  ready ??= (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS alert_checks (
        id          BIGINT GENERATED ALWAYS AS IDENTITY,
        user_id     TEXT,
        text        TEXT NOT NULL,
        label       TEXT NOT NULL,
        confidence  REAL NOT NULL,
        reasons     JSONB NOT NULL DEFAULT '[]',
        reasons_es  JSONB NOT NULL DEFAULT '[]',
        matched_alert_id TEXT,
        source      TEXT NOT NULL DEFAULT 'text',
        demo        BOOLEAN NOT NULL DEFAULT false,
        cost        NUMERIC(10, 6),
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (id, created_at)
      )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS alert_checks_user_idx ON alert_checks (user_id, created_at DESC)`);
    // Hypertable: partitions by time (requires the timescaledb extension, enabled by default on Tiger Cloud).
    await pool
      .query(`SELECT create_hypertable('alert_checks', by_range('created_at'), if_not_exists => TRUE, migrate_data => TRUE)`)
      .catch((e: Error) => console.warn("hypertable:", e.message));
  })().catch((e) => {
    ready = null; // retry on the next call
    throw e;
  });
  return ready;
}

export interface CheckRow {
  id: string;
  text: string;
  label: VerifyResult["label"];
  confidence: number;
  reasons: string[];
  reasons_es: string[];
  matched_alert_id: string | null;
  source: string;
  demo: boolean;
  cost: string | null;
  created_at: string;
}

/** Saves a verification. Never throws: if the database fails, the user's response is unaffected. */
export async function saveCheck(
  v: VerifyResult,
  opts: { text: string; userId: string | null; source: "text" | "image"; demo: boolean; reasonsEs: string[] }
): Promise<void> {
  if (!pool) return;
  try {
    await ensureSchema();
    await pool.query(
      `INSERT INTO alert_checks (user_id, text, label, confidence, reasons, reasons_es, matched_alert_id, source, demo, cost)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        opts.userId,
        opts.text.slice(0, 4000),
        v.label,
        v.confidence,
        JSON.stringify(v.reasons),
        JSON.stringify(opts.reasonsEs),
        v.matchedAlert?.id ?? null,
        opts.source,
        opts.demo,
        v.cost,
      ]
    );
  } catch (e) {
    console.warn("saveCheck:", (e as Error).message);
  }
}

/** A user's latest verifications. */
export async function listChecks(userId: string, limit = 50): Promise<CheckRow[]> {
  if (!pool) return [];
  await ensureSchema();
  const { rows } = await pool.query<CheckRow>(
    `SELECT id::text, text, label, confidence, reasons, reasons_es, matched_alert_id, source, demo, cost::text, created_at
       FROM alert_checks WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [userId, limit]
  );
  return rows;
}

/** Totals per label over the last 24 h, grouped by hour with TimescaleDB's time_bucket. */
export async function stats24h(): Promise<{ bucket: string; label: string; n: number }[]> {
  if (!pool) return [];
  await ensureSchema();
  const { rows } = await pool.query(
    `SELECT time_bucket('1 hour', created_at) AS bucket, label, count(*)::int AS n
       FROM alert_checks WHERE created_at > now() - interval '24 hours'
      GROUP BY bucket, label ORDER BY bucket`
  );
  return rows;
}
