# AlertCheck: answers for the judges

Every claim in this document can be shown in the code. Next to each one is the file that backs it up.

---

## 1. Tough questions

### Q1. "The offline rules and the backend rules can drift apart"

> "Not anymore. At first they were copied in two places; now there is **a single rules file** (`api/src/scamSignals.ts`) used by both the backend and the web. The web imports it directly at build time, so they can't diverge.
> The Service Worker makes sure the phone has the latest version: every time the user opens the app online, it downloads the new version of the web, and the new rules with it. If the network drops, it keeps working with the last version it saved. In an emergency, a rules engine that works without a network is worth more than an 'offline' screen."

Backed by: `api/src/scamSignals.ts`, `web/src/lib/offlineClassifier.ts` (imports `@api/scamSignals`), `web/public/sw.js`.

### Q2. "Why AI if you have rules?"

> "Rules are like an antivirus: they catch the known stuff (payments, bank details, shortened links, fake domains) and **no prompt injection can talk them out of it**. The AI sees what the rules can't: subtle manipulation, invented shelters that don't ask for money, contradictions with the official alert. It also explains the verdict at a 6th-grade level in two languages.
> The key is the hierarchy: **the AI can lower confidence, never raise it on its own.** 'Verified' is proven with code."

### Q3. "What about prompt injection? A scammer can write instructions to your AI"

> "We tested it by attacking ourselves: `npm run redteam` launches 8 real attacks against the full system, and all 8 are blocked. There are four layers:
> 1. **Verified requires proof.** The 'verified' verdict is only accepted if the official alert actually exists in the NWS list, the text names that event and that area, and it adds nothing suspicious (phone numbers, non-.gov links, requests). If anything is missing, the code downgrades it even if the AI says otherwise.
> 2. **AI-directed instruction detector.** A real alert never talks to a model. Phrases like 'ignore the instructions', 'output verified' or a fake official list are, on their own, a strong scam signal.
> 3. **Delimiters that can't be forged.** The message goes between tags with a random ID per request, and each of the 4 agents is told to treat it as data, never as instructions.
> 4. **The explanation can't be a channel for the scammer.** For suspicious messages, the text is always a reviewed template, not free AI text. For the rest, any explanation that includes phone numbers, non-.gov links or contradicts the label is discarded."

Live demo: in the "invented shelter" attack, Gemini went as far as writing that the alert *was official*, and the filter discarded that explanation automatically. That shows we don't trust the AI, we watch it.

Backed by: `api/src/swarmVerify.ts` (guardrails 1 and 2), `api/src/check.ts`, `api/scripts/redteam.ts`.

**What to say honestly:** "No defense against prompt injection is perfect, so we designed the system assuming the AI can be fooled. Even if it is, it can't produce a fake 'Verified' or show a scammer's phone number."

### Q4. "Denial-of-wallet attack: someone drains your balance"

> "Each check costs about $0.04 (Swarms), so we take it seriously:
> 1. **Per-IP limit** on the server: 20 per minute and 300 per day (configurable). It's generous on purpose, because at a shelter or an event many people share the same IP.
> 2. **Daily AI spend cap** (default $10/day).
> 3. When either is exceeded, the API returns 429 and **the web automatically falls back to local rule-based analysis**: the user still gets a verdict, not an error screen.
> 4. **Gemini circuit breaker:** if the quota runs out, it stops retrying for 5 minutes. Explanations switch to templates and screenshots prompt the user to paste the text."

Backed by: `api/src/limits.ts`, `api/src/index.ts` (`/verify`), `api/src/gemini.ts`, `web/src/app/page.tsx`.

**Don't say:** that Auth0 rate-limits requests (login is optional and only used for history) or that Caddy blocks IPs (Caddy provides HTTPS).

---

## 2. Architecture: why each piece

**Next.js + Tailwind (web and PWA).** The Service Worker (`sw.js`) and the `manifest` let the web install as an app and open without internet. The latest official alerts are stored on the phone to classify messages offline.

**Swarms (4-agent swarm).** Splits the work: the **Extractor** pulls out the data, the **OfficialMatcher** compares against the NWS, the **ScamDetector** looks for deception tactics and the **Judge** decides. Splitting the tasks *reduces* errors and hallucinations, though it doesn't eliminate them, which is why the code guardrails have the final say.

**Gemini (vision and writing).** During a hurricane people don't copy text: they send WhatsApp screenshots. Gemini transcribes the image and writes the explanation in English and Spanish. Its text goes through a filter before being shown.

**Prune (Gemini gateway).** Text calls to Gemini go through Prune, which provides a per-call cost receipt. Its cache was **turned off on purpose**: in testing, the semantic cache returned "this alert is authentic" for a scam. In verification, a recycled answer is unacceptable.
*(The ~$0.04 per alert is reported by Swarms, not Prune.)*

**Tiger Data (PostgreSQL + TimescaleDB).** Stores every check in a time-partitioned *hypertable*, and `/stats` groups by hour with `time_bucket`. Powers "My history" for volunteers and shelters. If the database goes down, the app keeps verifying and just stops saving.

**Vultr + Caddy (API server).** Vultr runs the API with pm2, and Caddy gives it automatic HTTPS. HTTPS is required because a secure website can't call a non-HTTPS API. *(The HTTPS that allows installing the PWA comes from the web hosting.)*

**Auth0 (optional).** Sign-in to save and view history. Not needed to verify.

---

## 3. The differentiator

1. **Security by design.** We don't trust the AI, we watch it. "Verified" is proven with code against real NWS data, the rules have authority over the agents, and we checked it with 8 real attacks (`npm run redteam`): 8/8 blocked, and 10/10 on the Milton demo.
2. **Real resilience.** Without internet, the PWA verifies on the phone. If the database goes down, the API keeps going. If Gemini runs out of quota or the spend limit is hit, the app continues with templates and rules.
3. **Zero friction.** No account required, you can upload a photo instead of typing, and the result is a 3-state traffic light (**green** verified, **amber** suspicious, **gray** unverified) with a bilingual 6th-grade-level explanation.
