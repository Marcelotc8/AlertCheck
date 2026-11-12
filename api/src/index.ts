import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { getConnInfo } from "@hono/node-server/conninfo";
import { getOfficialAlerts, SWARM_AGENTS } from "./swarmVerify.js";
import { extractAlertFromImage, type ExtractedAlert } from "./gemini.js";
import { checkAlert } from "./check.js";
import { allowRequest, budgetLeft, recordSpend } from "./limits.js";
import { DEMO_ALERTS, DEMO_OFFICIAL, demoForced } from "./demo.js";
import { dbEnabled, listChecks, saveCheck, stats24h } from "./db.js";
import { userFromAuthHeader } from "./auth.js";

const app = new Hono();
app.use("*", cors());

app.get("/", (c) => c.json({ ok: true, service: "stormcheck-api", db: dbEnabled() }));

// Current official alerts (the frontend stores them for offline mode)
app.get("/alerts", async (c) =>
  c.json(c.req.query("demo") === "true" || demoForced() ? DEMO_OFFICIAL : await getOfficialAlerts().catch(() => []))
);

// The 10 demo alerts (5 archived official Milton alerts + 5 fakes)
app.get("/demo", (c) => c.json(DEMO_ALERTS));

// Swarm definition (to show in the demo / Devpost)
app.get("/swarm", (c) => c.json(SWARM_AGENTS));

// Real client IP: Caddy sets it in X-Forwarded-For (dropping any the client sends); otherwise the socket's.
function clientIp(c: Parameters<typeof getConnInfo>[0]): string {
  const xff = c.req.header("X-Forwarded-For")?.split(",").at(-1)?.trim();
  return xff || getConnInfo(c).remote.address || "unknown";
}

// User-facing errors in both languages: the web shows the one for the selected language.
type ErrStatus = 400 | 401 | 413 | 422 | 429 | 502;
const fail = (c: { json: (b: unknown, s: ErrStatus) => Response }, status: ErrStatus, es: string, en: string, extra: object = {}) =>
  c.json({ error: es, error_en: en, ...extra }, status);

const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"]);

app.post("/verify", bodyLimit({ maxSize: 8 * 1024 * 1024, onError: (c) => fail(c, 413, "Imagen demasiado grande (máx. 8 MB)", "Image too large (max 8 MB)") }), async (c) => {
  type Body = { text?: string; image?: { data: string; mimeType: string }; mock?: boolean; demo?: boolean };
  const body = await c.req.json<Body>().catch(() => ({}) as Body);
  let text = body.text?.trim() ?? "";

  // Anti "denial of wallet": per-IP limit and daily spend cap. Returns 429 and the web automatically falls back
  // to local rule-based analysis (the same as offline mode), so the service never goes down.
  const limit = allowRequest(clientIp(c));
  if (!limit.ok) {
    c.header("Retry-After", String(limit.retryAfterSec));
    return fail(c, 429, "Demasiadas verificaciones seguidas. Espera un momento.", "Too many checks in a row. Please wait a moment.", { limited: true });
  }
  if (budgetLeft() <= 0) return fail(c, 429, "Límite diario de análisis con IA alcanzado.", "Daily AI analysis limit reached.", { limited: true });

  let extracted: ExtractedAlert | null = null;

  // Screenshot → Gemini extracts the alert text
  if (body.image) {
    if (!IMAGE_TYPES.has(body.image.mimeType)) return fail(c, 400, `Formato de imagen no soportado: ${body.image.mimeType}`, `Unsupported image format: ${body.image.mimeType}`);
    try {
      extracted = await extractAlertFromImage(body.image.data, body.image.mimeType);
      recordSpend(0.002); // estimate per screenshot (Gemini Flash), for the daily cap
    } catch (e) {
      console.warn("screenshot:", (e as Error).message);
      return fail(c, 502, "No se pudo leer la captura. Intenta de nuevo o pega el texto del mensaje.", "Could not read the screenshot. Try again or paste the message text.");
    }
    text = [text, extracted.text].filter(Boolean).join("\n\n");
    if (!extracted.text.trim()) return fail(c, 422, "No se encontró texto de alerta en la imagen.", "No alert text was found in the image.", { extracted });
  }
  if (!text) return fail(c, 400, "Escribe o pega un mensaje, o sube una captura.", "Type or paste a message, or upload a screenshot.");

  // Mock response (step 1) or if there's no Swarms key yet
  if (body.mock || !process.env.SWARMS_API_KEY) {
    return c.json({
      label: "unverified",
      confidence: 0.5,
      reasons: ["Mock response: SWARMS_API_KEY not set yet"],
      matchedAlert: null,
      cost: 0,
      mock: true,
    });
  }

  try {
    const demo = body.demo || demoForced();
    const [verdict, userId] = await Promise.all([
      checkAlert(text, demo ? DEMO_OFFICIAL : undefined),
      userFromAuthHeader(c.req.header("Authorization")),
    ]);
    recordSpend(verdict.cost ?? 0);
    const { explanation } = verdict;
    // History in Tiger Data (doesn't block the response; on failure it's only logged)
    void saveCheck(verdict, {
      text,
      userId,
      source: body.image ? "image" : "text",
      demo,
      reasonsEs: explanation.reasons_es,
    });
    return c.json({ ...verdict, demo, text, extracted, explanation, saved: dbEnabled(), signedIn: !!userId });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502);
  }
});

// "My history": verifications of the user signed in with Auth0
app.get("/history", async (c) => {
  const userId = await userFromAuthHeader(c.req.header("Authorization"));
  if (!userId) return fail(c, 401, "Inicia sesión para ver tu historial.", "Sign in to see your history.");
  try {
    return c.json(await listChecks(userId));
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502);
  }
});

// Hourly totals per label over the last 24 h (TimescaleDB time_bucket), for the demo
app.get("/stats", async (c) => {
  try {
    return c.json(await stats24h());
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502);
  }
});

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, () => console.log(`AlertCheck API on http://localhost:${port}`));
