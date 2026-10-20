# Vercel Services deployment

Alternative hosting only. The intended production platform is now
[Google Cloud Run](GOOGLE_CLOUD_RUN_DEPLOYMENT.md). This configuration and binding
remain supported when `K_SERVICE` is absent.

## Suitability and plan

This repository uses a public Next.js service and an internal FastAPI service.
Vercel Services is currently beta and available on all plans. The Python runtime
supports ASGI, streaming, and Python 3.13, which is pinned in `backend/.python-version`.
The backend uses remote OpenAI and Supabase APIs, with no local model or persistent
filesystem requirement. Existing dependencies are retained; pytest and PyYAML are
also installed by the existing requirements file, but are not used by live requests.

**Use Pro for this portfolio's commercial deployment.** Hobby is limited to personal,
non-commercial use; advertising paid services is commercial under Vercel's policy.
The configuration also works for an eligible non-commercial Hobby project.

References: [Services](https://vercel.com/docs/services),
[fair use](https://vercel.com/docs/limits/fair-use-guidelines),
[Python runtime](https://vercel.com/docs/functions/runtimes/python),
[FastAPI](https://vercel.com/docs/frameworks/backend/fastapi).

## Routing and security

`vercel.json` defines:

- `app`, rooted at `.`, serving every public path through the final catch-all.
  This preserves Next.js pages, assets, `/api/chat`, and `/api/contact`.
- `backend`, rooted at `backend`, with ASGI entry point `app.main:app` and no
  public rewrite. `/chat` and `/health` are internal only.
- A caller-side `app` → `backend` binding injecting `TAI_BACKEND_URL`.
  **Do not add this variable to Vercel settings or any environment file.**

The browser calls same-origin `/api/chat`. Next.js checks the request and Upstash
quota before calling the binding's `/chat` with the existing `X-API-Key` header.
FastAPI authenticates and retrieves from Supabase before generating streamed answers.
The binding is read only at request time, including the dynamically rendered home
page. Only a configured/not-configured boolean reaches the chat component.
A missing Vercel binding returns HTTP 503 instead of selecting demo mode or localhost.
Outside Vercel, `BACKEND_URL` remains the local/independent-hosting fallback.

Environment variables are shared across this Vercel project. Internal routing is not
per-service secret isolation. Keep all credential names server-only; do not use
`NEXT_PUBLIC_`. Local secrets and build caches are excluded by `.vercelignore`.

## Environment variables

Add values using Project Settings → Environment Variables. Configure Production
and Preview separately. Local `.env.local` and `backend/.env` are not deployed.

| Variable                    | Deployment value / purpose                                                           |
| --------------------------- | ------------------------------------------------------------------------------------ |
| `SITE_URL`                  | Actual canonical HTTPS origin, without trailing slash                                |
| `BACKEND_API_KEY`           | Existing strong shared secret; used by both services                                 |
| `MODE`                      | `live`; required to enable backend authentication and real RAG                       |
| `LLM_API_KEY`               | Provider secret                                                                      |
| `LLM_BASE_URL`              | `https://api.openai.com/v1`                                                          |
| `LLM_MODEL`                 | `gpt-6-luna` (existing model; account must have access)                              |
| `LLM_REASONING_EFFORT`      | `none`                                                                               |
| `EMBEDDING_MODEL`           | `text-embedding-3-small`                                                             |
| `EMBEDDING_DIMENSIONS`      | `1536`                                                                               |
| `SUPABASE_URL`              | Existing Supabase project HTTPS URL                                                  |
| `SUPABASE_SECRET_KEY`       | Existing `sb_secret_` secret; backend uses `apikey`                                  |
| `CORS_ORIGINS`              | JSON array of explicit site origins, or `[]` for exclusively server-to-server access |
| `TOP_K`                     | `5`                                                                                  |
| `SIMILARITY_THRESHOLD`      | `0.35`                                                                               |
| `RATE_LIMIT_PER_MINUTE`     | `60`; secondary backend per-peer/process guard                                       |
| `UPSTASH_REDIS_REST_URL`    | Existing Redis REST endpoint                                                         |
| `UPSTASH_REDIS_REST_TOKEN`  | Existing Redis secret                                                                |
| `TAI_RATE_LIMIT_PER_MINUTE` | `15`; distributed per-visitor chat quota                                             |
| `TAI_RATE_LIMIT_PER_DAY`    | `100`; distributed per-visitor chat quota                                            |
| `RESEND_API_KEY`            | Existing Resend secret                                                               |
| `CONTACT_EMAIL_TO`          | Your recipient address                                                               |
| `CONTACT_EMAIL_FROM`        | Sender on your verified Resend domain                                                |

Do not set `TAI_BACKEND_URL` (binding-generated), `VERCEL` (platform-generated),
or `BACKEND_URL` (local/external hosting only) in this Services deployment.
Leave `TRUSTED_CLIENT_IP_HEADER` unset on Vercel: the application uses Vercel's
trusted client IP header. No database CLI credentials are required at runtime.

## Setup and local validation

1. Confirm the service names, routing, and binding in `vercel.json` before deployment.
2. Use the repository root for the Vercel project, Node 24, and Fluid Compute.
   Service build/install settings are already in `vercel.json`; do not add conflicting
   top-level framework/build settings or a public `/api/*` backend rewrite.
3. Configure the variables above. Verify Supabase migrations and existing ingestion
   have succeeded. No schema changes or reindexing are needed for this deployment.
4. With a current Vercel CLI installed, test from the repository root:

   ```sh
   vercel dev -L --listen 3001
   ```

   `-L` runs locally without linking or deploying. Services bindings are injected by
   Vercel. Local development still uses the ignored environment files. Stop any other
   Next.js dev process in this checkout before starting this command (Next's dev lock).
   Python 3.13 and Node 24 must be available on the local PATH.

5. Open `http://localhost:3001`. Check home, project pages, and chat. A greeting can
   verify the authenticated service stream without an OpenAI call. A portfolio
   question must return `mode: live` and citations matching retrieved content.
6. Check missing/invalid API keys are rejected by the backend, malformed chat/contact
   requests remain rejected by Next.js, and quota responses retain HTTP 429 and
   `Retry-After`. Sending a real contact message delivers email; use an intentional
   test message and verify delivery separately.
7. After a separately authorized deployment, repeat smoke checks on the deployed
   domain. Local tests cannot establish cloud binding access, bundle size, cold-start
   latency, provider reachability, or email-domain verification.

## Operational limits

Both functions have a 60-second budget. The existing backend 50-second deadline and
Next.js 55-second fetch timeout are unchanged. Cold starts and slow providers can
still cause timeouts. Python streaming is supported, but must be verified end to end
on the deployment. Do not increase only one timeout without reviewing the whole path.

The authoritative visitor limiter uses Upstash and survives multiple instances.
The backend limiter is in-memory and may see a shared internal caller address; it is
only a secondary guard. Existing Redis-failure behavior is preserved: chat falls back
to that guard, while contact fails closed. Configure provider spending limits and
monitor failures before public launch. Services share project usage quotas and chat
invokes both services; external provider usage is billed separately.

Ingestion remains an explicit local/admin task using `python -m ingestion.ingest`
from `backend`. Never run it during build, cold start, or a public request. Runtime
retrieval continues using the existing Supabase index and RPC with RLS unchanged.

If Services beta behavior is unsuitable, the existing independently hosted backend
and `BACKEND_URL` architecture remains available outside this Services configuration.
It requires a separate frontend deployment configuration, rather than adding a public
backend rewrite to this one.

## Validation performed

Rechecked on 19 October 2026 before publication. The production build passed outside
the Windows sandbox after an output-directory permission error in the sandbox.
Python dependency consistency, application import, OpenAPI paths, and health checks
also passed. The existing Git history and proposed files were checked for credentials;
only explicit dummy test fixtures matched credential patterns.

- Frontend: 46 tests passed, including binding precedence, runtime resolution,
  local fallback, and missing-binding failure; lint, TypeScript, and production
  build passed. Build output retains both Next.js API routes.
- Backend: 181 tests passed on Python 3.13. An existing Starlette/httpx test-client
  deprecation warning remains; no runtime code was changed.
- Vercel CLI 64.3.1 recognized both services in local mode. Full local startup was
  blocked by Windows `EPERM` while scanning `backend/.pytest_cache`. This does not
  establish cloud compatibility: complete the local and deployed smoke checks above.
- No deployment, database mutation, real email send, or model call was made
  as part of these validation checks.
