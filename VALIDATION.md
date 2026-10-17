# Validation record — 2 October 2026

## Production-readiness audit — 6 October 2026

See `PRODUCTION_AUDIT.md` for the current findings and deployment blockers. Frontend lint, TypeScript, six protocol/request tests and the final production build pass with Node 24. Backend regression tests and `pip check` pass; the existing Starlette/httpx deprecation warning remains. Dry run and live ingestion prepare 20 documents / 23 chunks. Seven live audit requests verify improved overview coverage and conservative handling of unsupported claims; sources match independent retrieval. Browser checks cover 320/375/768/1024px, long chat content, mobile menu Escape/focus and offline error feedback. Secret-value scan: zero matches in 237 source/client-bundle/log files. Production npm advisory scan: zero known vulnerabilities. Migration 003 is prepared, not applied. No public deployment, full penetration test, Docker build, screen-reader certification or Lighthouse score is claimed.

## Implemented and checked

- Next.js production build: successful, including four generated project pages, API routes, social image, favicon, robots and sitemap.
- ESLint and TypeScript: passed.
- Frontend stream parser: four tests passed (split frames and citations, interruption, malformed sources, rate limits and safe errors).
- FastAPI/RAG tests: 11 passed. Coverage includes embedding response ordering, SSE completion markers, vector RPC authentication, authentication, request sizes, input validation, rate limits, conservative fallback, evidence handling, source URL safety, ingestion consistency and sanitized failures passed.
- Public content dry run: 20 documents, 21 chunks. No provider calls were made.
- Runtime HTTP checks: homepage, all project pages and SEO assets returned HTTP 200. Empty/oversized chat requests and foreign origins were rejected; unconfigured contact delivery returned HTTP 503.
- Production Next.js proxy connected to the local FastAPI server and returned its NDJSON demo response.
- Browser: suggested question produced a portfolio excerpt with working source destinations; reset restored the empty state; mobile menu opened and Escape closed it.
- Responsive DOM checks: no horizontal overflow at 320, 375, 768, 1024, 1440 and 1920 pixels. Desktop and narrow-mobile screenshots were visually reviewed.
- Browser warning about smooth route scrolling was fixed with the framework's `data-scroll-behavior` attribute.

## Not externally verified

- Real provider and database checks were subsequently completed; see the live validation section below. Migration application was confirmed by the user.
- Contact delivery requires Resend and Upstash Redis configuration. Automated tests mock email delivery; a manual inbox check is required before launch. See CONTACT_SETUP.md.
- No deployment, Lighthouse score or formal screen-reader audit is claimed.
- Starlette's test client currently emits a dependency deprecation notice about `httpx`; tests pass. Runtime API code uses `httpx` directly.
- The process-local rate limits are a development/single-process guard. Use shared gateway limits and provider spending limits before public paid-AI operation.

See `README.md` for setup, content maintenance, indexing, deployment and remaining content fields.

## Supabase secret API-key migration — 3 October 2026

- Backend and ingestion share the updated `SUPABASE_SECRET_KEY` setting. Nonempty values must use the `sb_secret_` format; live mode requires a key.
- Retrieval and ingestion RPC requests send the secret only in `apikey`. Mock HTTP tests assert that both paths omit `Authorization`.
- Backend suite: 17 tests passed, with the existing Starlette/httpx deprecation warning. No real credentials or external API calls were used.
- Python compilation passed. Ingestion dry run still prepares 21 chunks from 20 public documents.
- Repository-wide text search, including hidden and ignored files, found no legacy environment-variable or Python-field references. Header inspection found no Supabase secret in a Bearer header, and frontend application source contains no Supabase secret-key references.
- Vector dimensions, embedding model, retrieval behavior, table schema, RLS and service-role grants were not changed. Both existing RPCs are retained.
- Live Supabase authentication was subsequently verified with the configured secret key; see below.

## Live RAG validation — 3 October 2026

- User confirmed migration 002 applied. `replace_portfolio_index` succeeded; readback matched all 21 prepared chunk IDs and contents.
- FastAPI health reported live mode; Next.js served HTTP 200.
- Five real Next.js `/api/chat` requests completed with streamed tokens, citations and `mode: live`. Independent retrieval returned matching citation IDs for every question. Evidence text supports the project-specific answer.
- Unsupported Google projects and ML-engineer years were not invented.
- Browser visibly changed from Backend configured to RAG enabled after a live answer.
- Broad project/technology answers were incomplete because retrieval favored biography/experience chunks. Some sources were tangential. Retrieval behavior was preserved.
- Configured secret values were absent from returned HTML and 77 scanned client-bundle/log/artifact files. Backend keys matched; unauthenticated direct chat returned 401.
- Backend tests rerun: 17 passed, one existing dependency deprecation warning.
- Local evidence: `artifacts/tai-live-validation.json` and `artifacts/tai-live-verified.jpg` (ignored by Git). See `LOCAL_LIVE_SETUP.md` for restart commands and remaining content placeholders.

## Resend contact form — 17 October 2026

- Replaced mailto/webhook submission with the official Resend SDK and shared Upstash Redis rate limiting. T AI and backend code were not changed.
- ESLint and TypeScript pass. All 31 frontend tests pass, including 18 contact tests covering mocked SDK delivery, validation, request bounds, honeypot, rate limits, missing configuration, safe provider failures, retry keys, duplicate clicks and accessible React DOM feedback.
- Tests do not send real email. Redis HTTP calls are mocked; no live Redis database or sender-domain delivery was tested.
- Client asset scan found no Resend API key configuration, Redis token configuration, sender configuration or Resend endpoint identifiers. Existing secrets were not edited.
- `.env.local` remains covered by `.env*` in `.gitignore`; `.env.example` is explicitly allowed. See CONTACT_SETUP.md for manual local and Vercel setup.
