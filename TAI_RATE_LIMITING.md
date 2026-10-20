# T AI distributed rate limiting

## Request path and limits

Browser → Next.js `/api/chat` → Redis visitor limits → authenticated FastAPI → RAG/providers.

`lib/chat-rate-limit.ts` enforces **15 accepted requests per 60 seconds** and **100 per 24 hours**, independently per visitor IP. Both must pass. Configure server-only `TAI_RATE_LIMIT_PER_MINUTE` and `TAI_RATE_LIMIT_PER_DAY`; missing, zero, negative, fractional or otherwise invalid values fall back to 15/100. No new credentials are needed.

The atomic Lua script checks both limits before incrementing either, so rejected requests do not consume daily quota. These are fixed windows starting at the first accepted request, not rolling windows or midnight resets. They permit boundary bursts. Downstream failures still consume an accepted request. Expiry is maintained by Redis, so Next.js restarts and multiple instances do not reset or multiply quotas.

Keys are `tai:ratelimit:minute:<sha256>` and `tai:ratelimit:day:<sha256>`. Only counts/expiries are stored. IP hashes are pseudonymous identifiers, not complete anonymization; no chat contents or cookies are stored.

## Infrastructure and identity

### Google Cloud Run

Cloud Run is the intended production target. Platform-injected `K_SERVICE` enables
a fail-closed policy: Redis errors return 503 before the authenticated backend call.
Without a verified `CLOUD_RUN_TRUSTED_PROXY_HOPS`, chat and contact use conservative
shared buckets. Existing 15/minute and 100/day chat quotas remain enforced, but
visitors share them until proxy trust is verified. A verified hop count selects the
client IP from the trusted right-hand side of X-Forwarded-For; never trust arbitrary
prefixes. See [Cloud Run acceptance steps](GOOGLE_CLOUD_RUN_DEPLOYMENT.md).

### Vercel and other hosting

`lib/rate-limit-redis.ts` provides the shared Upstash client and trusted-IP extraction. It reuses the existing `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`; credentials stay behind a `server-only` import. The connection client is cached, but quota state exists only in Redis. Each operation has a fresh three-second timeout.

On Vercel, chat uses the platform-controlled `x-vercel-forwarded-for` header. Outside Vercel, configure `TRUSTED_CLIENT_IP_HEADER` only if a trusted gateway overwrites it and direct access to Next.js is blocked. Arbitrary forwarding headers and comma-separated chains are not trusted. Local development without a configured trusted header uses a stable `local-development` identifier, so local browsers share a test quota.

Production without a valid trusted IP does **not** silently group all visitors into one Redis bucket. It logs the same safe fallback warning as a limiter outage and continues under FastAPI's secondary protection. Correct trusted-IP configuration is therefore required for authoritative distributed limits in production.

Contact retains its existing limits and `portfolio:contact:v1:*` keys, with its existing shared fallback outside Vercel. Chat never consumes contact quota, nor the reverse. The contact failure policy remains fail-closed.

## Redis failure and backend safety outside Cloud Run

For chat, Redis timeouts, unavailable/missing configuration and malformed responses produce a fixed server warning without keys, IPs, messages or provider details. The request continues to FastAPI as requested for availability. There is no second in-memory Next.js visitor limiter.

FastAPI keeps authentication and its rolling per-peer/process safety limiter. `RATE_LIMIT_PER_MINUTE` now defaults to **60**, with the local non-secret setting and backend example set to 60. It normally sees the Next.js proxy, so this is a broad safety guard, not a visitor quota. It is not distributed; backend replicas maintain separate safety counters. Keep the backend private behind the gateway where possible. At higher legitimate traffic, tune this limit deliberately.

During a Redis outage distributed minute/day protection is unavailable: backend safety limits still apply, but there is no distributed daily cap or global spending cap. Monitor warnings and provider spending. If preview/local/production point at the same Redis database, identical visitor hashes share counters; use separate databases where isolation is needed.

## Responses and UI

Redis rejection returns 429 with `TAI_MINUTE_LIMIT` or `TAI_DAILY_LIMIT`, a friendly English message, and the remaining `Retry-After` seconds. If both limits block, the longest wait wins. The UI uses known codes to distinguish temporary and daily limits without rendering arbitrary server error text. Existing chat error UI is English-only; conversational multilingual routing is unchanged.

Backend 429 responses retain a safe numeric `Retry-After` (fallback 60 seconds); arbitrary upstream headers are not forwarded. No Redis details are sent to browsers.

## Validation

- `pnpm test`: mocked route/Redis tests cover accepted streaming, both limits, blocking before FastAPI, separate visitors, independent contact keys, remote state across fresh clients, safe failures and backend Retry-After forwarding.
- From `backend`: `..\.venv\Scripts\python.exe -m pytest -q` checks the retained backend guard, authentication, RAG and conversational behavior.
- `node scripts/check-chat-rate-limit.mjs`: explicit live Redis integration check using isolated random keys, shortened test windows and two clients. Keys expire within 60 seconds; production quotas are untouched. It does not send email or call OpenAI.
- `pnpm typecheck`, `pnpm lint`, `pnpm build` validate the frontend.

No prompts, model, embedding dimensions, database schema, retrieval behavior, Resend delivery or contact quotas are changed by this migration.

## Verified locally — 17 October 2026

- Full frontend lint, TypeScript validation and production build passed.
- Frontend suite: 42 tests passed. Backend suite: 181 tests passed, with the existing Starlette/httpx deprecation warning and a non-fatal pytest cache permission warning.
- Live Redis integration passed with isolated expiring keys and two Redis clients; production chat/contact buckets were untouched by that test.
- One subsequent live `/api/chat` request returned HTTP 200, `mode: live`, four retrieved sources and streamed tokens without errors. Its daily Redis counter increased by exactly one.
- FastAPI was restarted after updating the local non-secret safety setting to 60.
- Scanned 30 generated client assets: zero matches for the configured Redis token or its environment-variable identifier.
