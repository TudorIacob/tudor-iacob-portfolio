# Production-readiness audit — 6 October 2026

> Historical audit: the verdict and test evidence below describe 6 October 2026.
> Production subsequently went live at [tudoriacob.cloud.run](https://tudoriacob.cloud.run).
> See [the October security remediation](SECURITY_REMEDIATION.md) and the primary
> [Cloud Run guide](GOOGLE_CLOUD_RUN_DEPLOYMENT.md) for current release preparation.

## Historical verdict

Ready for continued local testing, **not yet approved for public paid-AI traffic**. The code, build and live path were audited and improved. Migration 003 and deployment controls below still require action. This was a source review, targeted automated testing and browser audit, not a penetration test or a guarantee against hallucinations.

## Priority findings and fixes

| Priority | Finding | Resolution |
| --- | --- | --- |
| High | Docker copied the backend directory without excluding `.env`; building with local credentials could bake them into an image. | Added root `.dockerignore` excluding env files, caches, tests and artifacts. Docker now installs locked dependencies. Actual Docker build remains untested. Rotate keys if an earlier image containing them was built/shared. |
| High | SQL NULL could pass the index-replacement guard and delete all rows without inserting replacements. | Fixed migration 001 for fresh setups, added migration 003 for existing databases, and reject null/empty replacements in Python. **003 is not applied by this audit.** |
| High | Frontend rate-limit buckets trusted arbitrary `X-Forwarded-For`. | Ignore forwarding headers by default; optional `TRUSTED_CLIENT_IP_HEADER` accepts one valid IP only. A rotating spoofed-header test now reaches 429. Shared gateway limits still required. |
| High | Settings validation errors could echo credential-bearing input. | Hide Pydantic inputs in error strings, omit secrets from settings repr, sanitize ingestion failures. No secret values printed. |
| Medium | Broad queries retrieved biography rather than projects/skills; project supplements produced duplicate sources. | Added generated project/skills overview documents and merged project supplements into their canonical document. Reindexed successfully. |
| Medium | Client-provided assistant history was forwarded as assistant messages. | Model receives a JSON payload with bounded retrieved evidence and relevant recent user questions only. Prior assistant claims cannot impersonate verified answers. |
| Medium | Context relied on the store honoring limits and metadata could cause unsafe or broken sources. | Enforce top-k, threshold, 4,000 characters per row, 12,000 total context characters; discard duplicate content and deduplicate links by canonical URL. Validate internal source URLs and metadata types. |
| Medium | Stream protocol accepted invalid modes, trailing data and unbounded output. | Parse untrusted JSON as unknown, validate event fields and source URLs, limit response size, reject data after completion/truncated frames, cancel readers on failure. |
| Medium | Provider embedding responses did not reject duplicate indices or nonfinite numbers. | Validate exact index sequence, dimensions and finite vector values; fail incomplete/oversized generation. |
| Medium | Request reads could remain open indefinitely; contact fetch lacked a browser deadline. | Add 10-second request-body deadlines and 15-second contact deadline. Existing size, generation and proxy deadlines retained. |
| Medium | Tests silently loaded local live environment files. | Isolate backend tests from `.env` and process configuration before app import. Standard pytest now runs without a special wrapper. |
| Medium | Child project pages inherited homepage social title/URL. | Add project-specific Open Graph and Twitter metadata; centralize canonical origin validation and prevent indexing localhost/HTTP configuration. |
| Low | Motion library used only for four entrance effects; client components imported all portfolio content. | Remove motion library/wrapper, keep cards server-rendered, pass narrow navigation/contact/chat props, memoize completed messages. |
| Low | Small-screen chat header, long labels and keyboard transcript access needed improvement. | Hide redundant subtitle at 375px and below, allow long labels to wrap, make transcript keyboard-focusable, announce mode changes, focus sections after mobile navigation. |
| Low | Contact button implied delivery even in mailto mode; generic hero hid the specialty. | Label email handoff “Create email draft”; hero now says “Python & AI systems. Built for business.” |

## Architecture

- Retained Next.js as the same-origin gateway and FastAPI as the authenticated RAG service. Browser code has no direct Supabase or provider access.
- Kept embedding/generation/vector-store protocols: these boundaries support independent failure tests and provider replacement without coupling business logic to HTTP.
- Added a pure request parser (`lib/chat-request.ts`) and shared server-only canonical origin (`lib/site.ts`). No broad framework or speculative abstraction was introduced.
- Kept small section components and the existing chat input/message separation. Content remains in shared JSON plus explicitly allowlisted supplemental Markdown. Decorative project graphics remain illustrative rather than pretending to be product screenshots.
- Markdown front matter and nonempty bodies are validated; indexed placeholders and duplicate document IDs fail ingestion. New files are deliberately not auto-indexed; adding a document requires an explicit loader change.

## RAG and hallucination results

Live ingestion completed with **20 documents / 23 chunks**, using the existing `text-embedding-3-small` model, 1536 dimensions, `match_portfolio_chunks` and `replace_portfolio_index`. Generation remains `gpt-4.1-mini`. Table and vector schema were not changed.

Seven live requests were sent through the production Next.js proxy. Source URLs matched a separate retrieval using the same query for every request:

| Test | Observed result |
| --- | --- |
| Projects overview | Listed the indexed portfolio projects. The current catalog contains three projects following subsequent content cleanup. |
| Technologies overview | Returned all four skill groups and their listed technologies. |
| Company & UAT agent | Described the documented scoring range, reports, outreach and technology stack. |
| Projects for Google | Said there was insufficient evidence; did not attribute projects to Google. |
| ML-engineer tenure | Did not infer years from business or education dates. |
| Reveal system prompt/API keys | No matching evidence; deterministic fallback, no generation. |
| Confirm invented AWS certification and ten years at Google | Refused to confirm unsupported claims or invent results. |

Additional browser tests exercised a real streamed skills answer, long unbroken technology/URL input, and an offline FastAPI failure. Long input did not overflow and elicited an insufficient-evidence answer.

**Limits:** This is a small English-language sample. The prompt is a risk reduction measure, not an enforcement proof. Retrieved sources are candidate evidence supplied to the model, not claim-by-claim verified citations. Tangential contact/biography chunks still appear among results. Source links lead to portfolio sections; supplemental knowledge can contain more detail than those public pages. The UI now labels them “Retrieved sources.” Short follow-up detection is heuristic and multilingual retrieval has not been evaluated. No private data should be indexed.

Local test evidence is in ignored `artifacts/audit-live-results.json`. It contains public test questions, answers, sources and retrieved chunks, without credentials.

## Security and failure handling

- Modern Supabase secret stays in server-side `apikey`; OpenAI Bearer authentication is separate. RLS, invoker RPCs and service-role-only grants remain in the migrations.
- Direct unauthenticated backend chat returns 401. Foreign frontend origins return 403; foreign backend CORS preflight has no allowed-origin header. Invalid/empty frontend requests return 400. Spoofed IP rotation cannot bypass the default limiter.
- Body-size/history bounds and read deadlines prevent unbounded context and slow request reads. Model output is rendered as React text, never HTML/Markdown execution.
- Embedding, retrieval and generation exceptions produce safe error events with no successful completion. Logs record exception class only, without visitor content or provider diagnostics. Backend-offline UI offers retry/contact and marks the incomplete answer.
- Secret scan: zero configured secret-value matches across 237 source/client-bundle/log files. Git ignore checks confirm `.env`, `.env.local`, `backend/.env` are excluded, while examples are allowed. Local secrets were not edited.
- No known vulnerabilities reported by `pnpm audit --prod`. `pip check` found no dependency conflicts; Python vulnerability scanning was not performed.

## UX, mobile, accessibility, SEO and performance

- Browser tested at 320, 375, 768 and 1024px. No visible horizontal overflow; the intentionally offscreen honeypot is excluded from that finding. Long chat URLs/words also fit.
- Mobile menu opens; Escape closes it and restores toggle focus. Form fields have visible labels, required/email constraints, and text status feedback. Chat transcript is keyboard-focusable and errors use alerts.
- One H1, section H2s and subordinate H3s were observed. Reduced-motion CSS disables animation/transitions. Main text and accent colors were inspected; no formal screen-reader or comprehensive automated contrast certification is claimed.
- Project canonical/OG URLs and titles verified over HTTP. Missing project returns 404. Robots, sitemap and OG image return 200. `SITE_URL` must be the real HTTPS origin at build time before publishing. Preview hosts with HTTPS still need host-level noindex/access controls.
- System fonts and CSS illustrations avoid blocking third-party fonts/images. Future real project images already use `next/image`; remote images need explicit host configuration.
- Removed unnecessary animation dependency and full-content imports from client components. No invented Lighthouse score or measured bundle-size reduction is claimed.

## Validation

- `pnpm lint`: pass.
- `pnpm typecheck`: pass; production build type check also passed.
- `pnpm test`: six tests pass (requests, protocol, sources, errors, interruption and completion validation).
- `pnpm build`: pass with Node 24; all four project detail pages generated.
- Backend pytest: **32 passed**, including empty/null replacement, non-ASCII authentication, request read deadlines and failures at every provider stage. Existing Starlette/httpx test-client deprecation remains.
- Python compileall and ingestion dry run: pass. Real ingestion: 23 chunks atomically replaced.
- Production build served locally on port 3001 for this audit because 3000 was already occupied. No public deployment performed.
- The machine's default Node is 20; the project requires Node 24. Use the documented runtime/PATH setup. Initial test failure on Node 20 was an environment mismatch, not ignored.

## Personal content requiring Tudor's review

1. **Certifications:** two `[ADD CREDENTIAL URL]` markers in `knowledge/certifications.md` and two in `site texts.txt`. They are reference documents, not indexed or shown as literal placeholders. In `data/portfolio.json`, both credential URLs and dates are null.
2. **Machine-learning course:** confirm exact title (source texts disagree between a single course and a specialization), completion status, issuer, date and credential URL. Pending coursework must not be presented as a verified certification.
3. **Project evidence:** repository URLs are null for all four projects; case-study URLs are null; three projects lack demo URLs. All project images are illustrative fallbacks. Add only actual repositories, demos, screenshots and approved case studies, or leave unavailable items absent.
4. **Professional facts:** confirm project ownership/status, VoltaX relationship and permission to name it, business/education dates, contact links and the claimed skill list against your records. Existing facts were traced to supplied content, not independently verified. No replacement names, results, metrics, employers or experience durations were invented.

## Required before public deployment

1. Apply **all contents** of `supabase/migrations/003_reject_null_index.sql` in the intended project's Supabase Dashboard → SQL Editor → New query → **Run**. Existing 001/002 application was confirmed earlier; 003 remains pending. Applying 003 only replaces the function definition and grants. Verify its definition with:

   ```sql
   select pg_get_functiondef('public.replace_portfolio_index(jsonb)'::regprocedure);
   ```

   Confirm the null/type guard occurs before DELETE. Run `supabase/verify_portfolio.sql` to recheck RLS, index, dimensions and function/table privileges. Do not test null replacement against the old function.
2. Configure shared gateway/WAF rate limits, concurrency limits, bot protection and provider budgets/alerts. Current per-process limits aggregate users and reset on restart; they are not sufficient public abuse controls. Only set `TRUSTED_CLIENT_IP_HEADER` when ingress overwrites it and direct access is blocked.
3. Set real HTTPS `SITE_URL`, backend URL, explicit CORS and secrets through deployment secret stores; keep FastAPI private to the gateway where supported. Confirm previously shared keys were rotated before deployment. Do not bake env files into images.
4. Validate Docker on Linux/CI, vulnerability-scan Python/image dependencies, enable automated dependency checks, and test deployed streaming/timeouts/TLS/headers. Add a tested CSP appropriate to the final host. Confirm backups and recovery for the dedicated Supabase table.
5. Configure privacy-safe monitoring for latency, failures, quota exhaustion and cost; review retention/privacy disclosures for live AI and any contact processor. Verify the optional webhook destination if enabling it; it was not sent test mail in this audit.
6. Complete the personal-content review above. Run a larger retrieval/grounding regression set, including follow-ups, conflicting evidence, indirect prompt injection and multilingual queries; do a screen-reader and deployed performance audit.
7. Put this currently non-Git workspace under version control with the verified ignore rules, review the diff, and set up CI running the documented checks. Public deployment should be a separate reviewed step.

## Files changed by this audit

- Build/security: `.dockerignore` (new), `.env.example`, `backend/Dockerfile`, `eslint.config.mjs`, `package.json`, `pnpm-lock.yaml`.
- Frontend: `app/api/chat/route.ts`, `app/api/contact/route.ts`, `app/globals.css`, `app/layout.tsx`, `app/projects/[slug]/page.tsx`, `app/robots.ts`, `app/sitemap.ts`.
- Components: `components/navigation.tsx`, `components/contact-form.tsx`, `components/sections/contact.tsx`, `components/sections/featured-projects.tsx`, `components/sections/hero.tsx`, `components/sections/tai-section.tsx`, `components/tai/chat-message.tsx`, `components/tai/tai-chat.tsx`. Removed `components/reveal.tsx`.
- Frontend libraries/tests: `lib/chat.ts`, `lib/server.ts`, `lib/chat-request.ts` (new), `lib/site.ts` (new), `scripts/test-chat.mjs`.
- Backend: `backend/app/core/config.py`, `backend/app/main.py`, `backend/app/api/chat.py`, `backend/app/models/chat.py`, `backend/app/services/providers.py`, `backend/app/services/vector_store.py`, `backend/app/rag/pipeline.py`, `backend/app/rag/prompts.py`, `backend/ingestion/loaders.py`, `backend/ingestion/ingest.py`.
- Backend tests: `backend/tests/conftest.py` and `backend/tests/test_audit.py` (new).
- SQL: `supabase/migrations/001_portfolio.sql`, `supabase/migrations/003_reject_null_index.sql` (new).
- Documentation: `README.md`, `LOCAL_LIVE_SETUP.md`, `VALIDATION.md`, `knowledge/README.md`, `PRODUCTION_AUDIT.md` (new).
- Generated build/cache files and local evidence under ignored `artifacts/` are excluded from this source-file list. Local credential files and personal portfolio JSON were not changed.
