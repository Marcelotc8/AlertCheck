import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { getOfficialAlerts, verifyAlert, SWARM_AGENTS } from "./swarmVerify.js";

const app = new Hono();
app.use("*", cors());

app.get("/", (c) => c.json({ ok: true, service: "stormcheck-api" }));

// Alertas oficiales actuales (el frontend las guarda para el modo sin conexión)
app.get("/alerts", async (c) => c.json(await getOfficialAlerts().catch(() => [])));

// Definición del enjambre (para mostrar en el demo / Devpost)
app.get("/swarm", (c) => c.json(SWARM_AGENTS));

app.post("/verify", async (c) => {
  const body = await c.req.json<{ text?: string; mock?: boolean }>().catch(() => ({}) as { text?: string; mock?: boolean });
  const text = body.text?.trim();
  if (!text) return c.json({ error: "Falta 'text'" }, 400);

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
    return c.json(await verifyAlert(text));
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502);
  }
});

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, () => console.log(`StormCheck API en http://localhost:${port}`));
