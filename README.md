# AlertCheck

Takes a hurricane alert (text or screenshot) and labels it **verified, suspicious or unverified**, explaining why in English and Spanish, even without internet. SharkByte 2026.

## Structure
- `web/` — Next.js (App Router, Tailwind). `src/lib/offlineClassifier.ts` = offline mode.
- `api/` — Hono + Node. `src/swarmVerify.ts` = NWS + a 4-agent swarm on Swarms.

## Run locally
```bash
cd api && cp .env.example .env   # fill in the keys
npm install && npm run dev       # http://localhost:8787
cd ../web && npm install && npm run dev   # http://localhost:3000
```

Without `SWARMS_API_KEY`, `POST /verify` returns a mock response.

## Security
- `api/src/scamSignals.ts`: rules **shared** by the API and the web (offline mode).
- "Verified" requires a real official alert + evidence in the text (`swarmVerify.ts`, guardrail 2).
- Safe explanation and phone/link filtering (`check.ts`); per-IP limit and daily cap (`limits.ts`).
- `npm run redteam` (in `api/`): 8 prompt-injection and evasion attacks. `-- --rules` = free part only.
- Answers for the judges: `docs/judges-defense.md`.
