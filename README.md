# AlertCheck

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

## Seguridad
- `api/src/scamSignals.ts`: reglas **compartidas** por la API y la web (modo sin conexión).
- "Verificada" exige una alerta oficial real + evidencia en el texto (`swarmVerify.ts`, barandal 2).
- Explicación segura y filtrado de teléfonos/enlaces (`check.ts`); límite por IP y tope diario (`limits.ts`).
- `npm run redteam` (en `api/`): 8 ataques de prompt injection y evasión. `-- --rules` = solo la parte gratis.
- Defensa ante los jueces: `docs/defensa-jueces.md`.
