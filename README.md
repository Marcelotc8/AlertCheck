# StormCheck

Recibe una alerta de huracán (texto o captura) y la etiqueta como **verificada, sospechosa o no verificada**, explicando por qué en inglés y español, incluso sin internet. SharkByte 2026.

## Estructura
- `web/` — Next.js (App Router, Tailwind). `src/lib/offlineClassifier.ts` = modo sin conexión.
- `api/` — Hono + Node. `src/swarmVerify.ts` = NWS + enjambre de 4 agentes en Swarms.

## Correr en local
```bash
cd api && cp .env.example .env   # rellena las claves
npm install && npm run dev       # http://localhost:8787
cd ../web && npm install && npm run dev   # http://localhost:3000
```

Sin `SWARMS_API_KEY`, `POST /verify` devuelve una respuesta de prueba.
