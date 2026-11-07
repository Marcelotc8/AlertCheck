import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { getOfficialAlerts, verifyAlert, SWARM_AGENTS } from "./swarmVerify.js";
import { extractAlertFromImage, explainVerdict, templateExplanation, type ExtractedAlert } from "./gemini.js";
import { DEMO_ALERTS, DEMO_OFFICIAL, demoForced } from "./demo.js";
import { dbEnabled, listChecks, saveCheck, stats24h } from "./db.js";
import { userFromAuthHeader } from "./auth.js";

const app = new Hono();
app.use("*", cors());

app.get("/", (c) => c.json({ ok: true, service: "stormcheck-api", db: dbEnabled() }));

// Alertas oficiales actuales (el frontend las guarda para el modo sin conexión)
app.get("/alerts", async (c) =>
  c.json(c.req.query("demo") === "true" || demoForced() ? DEMO_OFFICIAL : await getOfficialAlerts().catch(() => []))
);

// Las 10 alertas de demo (5 oficiales archivadas de Milton + 5 falsas)
app.get("/demo", (c) => c.json(DEMO_ALERTS));

// Definición del enjambre (para mostrar en el demo / Devpost)
app.get("/swarm", (c) => c.json(SWARM_AGENTS));

const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"]);

app.post("/verify", bodyLimit({ maxSize: 8 * 1024 * 1024, onError: (c) => c.json({ error: "Imagen demasiado grande (máx. 8 MB)" }, 413) }), async (c) => {
  type Body = { text?: string; image?: { data: string; mimeType: string }; mock?: boolean; demo?: boolean };
  const body = await c.req.json<Body>().catch(() => ({}) as Body);
  let text = body.text?.trim() ?? "";
  let extracted: ExtractedAlert | null = null;

  // Captura de pantalla → Gemini extrae el texto de la alerta
  if (body.image) {
    if (!IMAGE_TYPES.has(body.image.mimeType)) return c.json({ error: `Formato no soportado: ${body.image.mimeType}` }, 400);
    try {
      extracted = await extractAlertFromImage(body.image.data, body.image.mimeType);
    } catch (e) {
      return c.json({ error: `No se pudo leer la captura: ${(e as Error).message}` }, 502);
    }
    text = [text, extracted.text].filter(Boolean).join("\n\n");
    if (!extracted.text.trim()) return c.json({ error: "No se encontró texto de alerta en la imagen", extracted }, 422);
  }
  if (!text) return c.json({ error: "Falta 'text' o 'image'" }, 400);

  // Respuesta de prueba (paso 1) o si aún no hay clave de Swarms
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
    const verdict = await verifyAlert(text, demo ? DEMO_OFFICIAL : undefined);
    // Explicación bilingüe con Gemini; si falla, plantilla + razones en español del Judge
    const [explanation, userId] = await Promise.all([
      explainVerdict(text, verdict).catch((e: Error) => {
        console.warn("explainVerdict:", e.message);
        return templateExplanation(verdict);
      }),
      userFromAuthHeader(c.req.header("Authorization")),
    ]);
    // Historial en Tiger Data (no bloquea la respuesta; si falla, solo se registra en el log)
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

// "Mi historial": verificaciones del usuario que inició sesión con Auth0
app.get("/history", async (c) => {
  const userId = await userFromAuthHeader(c.req.header("Authorization"));
  if (!userId) return c.json({ error: "Inicia sesión para ver tu historial" }, 401);
  try {
    return c.json(await listChecks(userId));
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502);
  }
});

// Totales por hora y etiqueta de las últimas 24 h (time_bucket de TimescaleDB), para el demo
app.get("/stats", async (c) => {
  try {
    return c.json(await stats24h());
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502);
  }
});

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, () => console.log(`StormCheck API en http://localhost:${port}`));
