# Security remediation — 23 October 2026

## Executive summary

The live site remains [tudoriacob.cloud.run](https://tudoriacob.cloud.run).
This report describes an **uncommitted, locally tested patch**, not a deployed
production revision. Google Cloud resources, IAM, secrets, billing, environment
variables, and database contents were not modified. No real emails or paid AI
requests were sent. No credentials were rotated and no Git history was rewritten.

Production npm audit findings fell from **2 critical / 1 high to zero**. Both
Python dependency-file audits fell from **2 findings to zero**. The patch also
hardens browser write requests, authenticated upstream calls, validation errors,
security headers, credential-file exclusions, and repository automation.

## Confirmed dependency findings and versions

| Component | Before (resolved) | After | Finding / applicability |
| --- | --- | --- | --- |
| Next.js | 16.3.8 | 16.4.2 | Critical GHSA-673q-mjm6-r5xr (cache typed-array RCE), critical GHSA-2464-fhr4-w9xw / CVE-2026-96889 (image processing), high GHSA-p3m5-59mp-jv5r (Server Actions DoS). |
| React / React DOM | 19.3.0 | 19.3.1 | Compatible stable patch pair. RSC fixes are delivered through Next.js's bundled server components, not just these top-level packages. |
| eslint-config-next | 16.3.8 | 16.4.2 | Aligned with the framework; no major upgrade. |
| Sharp | 0.35.5 | 0.35.5 | Already met the upstream image-library fix; retained, no override. |
| Node.js | Floating Docker 24 tag; local tooling 24.19.0 | Docker and test runtime 24.22.1 | October runtime fixes include high-severity DNS/TLS/Brotli issues; previous deployed image version was not inspected. |
| opentelemetry-api | 1.45.0 | 1.45.1 | Moderate CVE-2026-114603 / GHSA-xcq7-p3pf-p88h, excessive CPU parsing tracestate. |
| certifi | 2026.7.22 | 2026.10.19 | PYSEC-2026-4320, affected CA trust removal; high-impact on-path TLS risk (audit provides no severity score). |

The affected Next.js version is confirmed in the old lockfile. Exploitability in
this app is narrower than the version match: no Cache Components/use-cache or
Server Actions were found, and Sharp was already patched. No production exploit
or compromise is claimed. OpenTelemetry's affected version was installed, but
live propagation-header reachability was not tested. The certifi trust-store
update applies to outbound Python HTTPS connections.

The `next` package includes compiled `react-server-dom-webpack` and
`react-server-dom-turbopack`; their bundled canary metadata is framework-owned.
The official patched Next.js release is the security boundary. No independent
RSC packages, broad overrides, force installs, or major upgrades were introduced.
`pnpm` generated the lockfile; direct Next/React ranges start at patched versions and the frozen lockfile pins the resolved graph.
Python changes are limited to two constraints used by the runtime requirements.

Sources: [Next.js security release](https://nextjs.org/blog/nextjs-security-update-october-14-2026),
[React RSC advisory](https://github.com/react/react/security/advisories/GHSA-xqc2-xf4c-x3h3),
[React Server Functions advisory](https://github.com/react/react/security/advisories/GHSA-h3gv-c5rc-p453),
[npm Next.js metadata](https://registry.npmjs.org/next/16.4.2),
[Sharp advisory](https://github.com/lovell/sharp/security/advisories/GHSA-wq5f-xc86-pv6w),
[Node security release](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases),
[OpenTelemetry advisory](https://github.com/advisories/GHSA-xcq7-p3pf-p88h),
[certifi release](https://github.com/certifi/python-certifi/releases/tag/2026.10.19).

## Application review and fixes

| Area | Result |
| --- | --- |
| IAM and backend key | Preserved audience-bound Google ID tokens, server-only API key, token timeout, and sanitized failures. No backend public access change. |
| Authenticated redirects | Added `redirect: "error"` to the backend fetch. This prevents credentials following an unexpected redirect. Defense in depth; no attacker-controlled backend URL or live redirect exploit found. |
| Browser writes | Chat now requires JSON before quota/provider work. Both routes reject cross-site Fetch Metadata and pin supplied Origin to configured SITE_URL. Contact still requires Origin and UUID idempotency. Missing Origin remains usable for non-browser JSON chat clients; this is a public API, not user authentication. |
| Validation disclosure | Confirmed FastAPI default validation output can serialize submitted input despite Pydantic's hide-input option. Return generic 422/no-store instead; low-severity data-minimization fix, not a discovered server-secret leak. |
| CORS | Reject wildcard hostnames as well as bare wildcards and credential-bearing origins. No production CORS settings changed. |
| API discovery | Disabled `/openapi.json` in live mode, matching disabled interactive docs. Demo docs and health remain; Cloud Run IAM protects all backend endpoints. |
| Headers | Production-only report-only CSP and HSTS `max-age=86400`. Existing nosniff, DENY, referrer and permissions headers retained. No preload/includeSubDomains commitment. |
| XSS / sources | React Markdown rejects raw HTML/images; source URLs remain constrained to portfolio paths; link scheme filtering remains. Existing malicious-markup tests pass. |
| SSRF / injection | Backend/provider destinations come from server config, not visitor input; provider URLs require HTTPS. Supabase uses fixed RPC names and JSON payloads. No new SQL or prompt-executed tools. |
| RAG / prompt injection | Public document allowlist and `public: true` remain. Evidence/history are bounded and treated as untrusted. Prompt compliance is not a security guarantee; hallucination and adversarial prompts remain possible. |
| Limits / errors | 16 KB bodies, 10-second reads, 50/55-second backend/frontend deadlines, provider timeouts and sanitized errors retained. Cloud Run Redis failures fail closed before provider calls. |
| Supabase | Reviewed all three migrations: RLS enabled, anon/authenticated privileges revoked, service-role-only RPC access, SECURITY INVOKER and bounded retrieval. Existing database policies/migration application were not queried. |

The canonical-origin check intentionally rejects API writes from alternate site
origins in production. Use the official hostname; verify SITE_URL is already the
canonical URL during release review. Do not silently update it as part of a deploy.
Report-only CSP currently reports Next.js inline hydration scripts; it does **not**
block them. Before enforcement, implement/test nonces or hashes for the actual
rendering strategy. Reports remain in browser DevTools; there is no public report
collector, added storage, or telemetry bill. HSTS takes effect only over HTTPS.

## Credential and knowledge-base audit

- Gitleaks 8.30.1 downloaded from its official release and checksum-verified.
- Fetched all available remote refs/tags; checkout is not shallow. Full-history
  scan covered all **4 commits**, including historical deletions, with 100% redaction.
- Default rules found no leaks. The added modern Supabase rule found four matches
  of the exact intentionally fake fixture in `backend/tests/test_adapters.py` and
  `backend/tests/test_rag.py`, introduced in commit `9bf33901`. A narrow rule allows
  only that exact fixture in those two paths. Rerun: **zero findings**.
- Current publishable source snapshot: zero findings. Exact matching against six
  local credential values found no matches in 152 source files and 169 historical
  blobs. Values were never printed. This does not prove absence of every possible
  historical/revoked credential or secrets outside Git (issues, logs, old images).
- Browser/standalone artifacts checked for credential patterns, exact local values,
  and forbidden environment/private-key files. No matches.
- Added `.p12`, `.pfx`, and nested ADC credential exclusions to Git, Docker and
  Cloud source ignore files. Docker COPY statements remain explicitly scoped.
- Reviewed public knowledge documents and ingestion allowlist: professional
  biography, project descriptions and deliberately public contact links; no
  additional private records or credentials identified. Non-indexed reference
  files are still public repository content. No database retrieval was performed.

If a future scan detects a real secret: identify provider/path/commit with redacted
metadata, revoke/rotate through the provider under explicit authorization, update
Secret Manager references, inspect usage, and separately plan history cleanup.
Removing a file alone does not revoke a credential.

## Visitor identity verification

**Verified limitation, unresolved live configuration:** with
`CLOUD_RUN_TRUSTED_PROXY_HOPS=0`, all Cloud Run visitors share the chat bucket
(15/minute and 100/day) and contact visitor bucket (5/10 minutes). Contact also
retains its 100/hour global counter; the backend retains its per-peer process
safety guard. All limits and the conservative proxy setting are unchanged.

A verified trusted XFF suffix can distinguish visitors. Tests cover forged
prefixes, invalid/short chains, distinct visitors and the invariant contact global
key. They cannot establish the actual proxy chain for either the canonical
`cloud.run` hostname or direct `run.app` access. Google documents appended XFF
values for [load balancers](https://docs.cloud.google.com/load-balancing/docs/https#x-forwarded-for_header)
and [Cloud Run functions](https://docs.cloud.google.com/functions/docs/reference/headers);
neither is proof of this container service's routing. Never select the first XFF
value or assume a hop count based on those documents. Anonymous signed cookies
also cannot stop quota resets by acquiring new cookies.

Before any separately approved configuration change:

1. Use an access-restricted, temporary test service matching the actual routing;
   do not add a public diagnostics route to this portfolio. No such service was
   created during this task. Inspect only controlled synthetic requests, privately.
2. From two controlled networks (A and B), send requests via **both** canonical and
   direct service URLs, first without XFF, then with `198.51.100.11`,
   `203.0.113.12, 198.51.100.11`, an IPv6 prefix, malformed values and duplicate XFF
   fields. Repeat through every supported proxy route. Do not log real visitor IPs.
3. Record the appended suffix and confirm the selected entry changes between A/B
   but never with attacker prefixes. Verify every shorter chain fails to shared
   safety rather than selecting attacker input. A route-dependent suffix length
   is a stop condition: one hop setting cannot safely serve inconsistent chains.
4. In an isolated Redis namespace with mocked providers, exhaust A's 15/minute or
   100/day quota; B must retain its individual quota. Forge changing prefixes from
   A and confirm continued 429/Retry-After. Repeat contact 5/10 minutes and prove
   the 100/hour global cap across both identities. Redis timeout/invalid reply
   must produce 503 and zero downstream calls.
5. Review aggregate AI spend before approval. Enabling distinct chat buckets raises
   aggregate available requests compared with today's shared safety bucket even
   without increasing per-IP numbers. Preserve/approve an aggregate budget guard;
   do not implicitly authorize higher usage by enabling a hop count.
6. Only after evidence and approval, choose the verified count (1–5); otherwise
   retain 0. Revalidate when proxy routing changes. Shared-NAT users and IPv6/IP
   rotation remain limitations of IP-based identity even after verification.

## Automation and validation

`.github/workflows/security.yml` runs checks on PRs, main pushes and manual runs.
It has read-only contents permission, SHA-pinned official actions, no persisted
checkout credential, concurrency cancellation and a 20-minute timeout. It includes
lint/types/tests/build, local standalone smoke checks, both dependency audits,
redacted full-history Gitleaks, artifact scans, and Docker build/non-root checks.
No production credentials, OIDC grants, cloud commands or deployment steps exist.
Dependabot checks npm/pnpm, Python, Actions and Docker weekly with small PR limits.
CI consumes normal GitHub runner minutes; hosted execution has not been observed
because these changes have not been pushed. No fixed-cost service was added.

| Check | Result |
| --- | --- |
| pnpm install --frozen-lockfile | Pass with pnpm 11.25.0, Node 24.22.1 |
| pnpm lint / pnpm typecheck | Pass |
| pnpm test | 62 passed, 0 failed |
| Backend pytest | 188 passed, 0 failed; existing test-client deprecation and local cache-permission warnings |
| pnpm build | Pass; Windows sandbox symlink EPERM resolved by approved unsandboxed rerun |
| Local standalone HTTP | 11 passed: home, all 3 projects, robots, sitemap, canonical metadata, headers, EN/RO demo streams, origin/content-type rejection |
| pnpm audit --prod | 0 vulnerabilities (before: 2 critical, 1 high) |
| pip-audit runtime / full lock | 0 findings in both (before: 2 in each) |
| pip check | Pass |
| Gitleaks history / publishable source | 0 findings after exact synthetic-fixture exception |
| Artifact secrets | Pass; 32 browser files plus standalone output |
| Docker build/non-root execution | Not run locally: Docker unavailable. Source invariants tested; CI includes actual builds and UID checks |
| Cloud IAM / live providers / real mail / load | Not run; require controlled release acceptance |

Existing mocked tests cover bilingual conversation routing, RAG evidence selection,
stream parsing/cancellation, backend authentication, contact validation and Resend,
Redis quotas/failures and Cloud Run authentication. Local HTTP smoke chat uses demo
mode intentionally. No claim is made that mocks verify real-model answer quality,
actual email delivery, platform cancellation timing, memory limits or billing.

## Controlled release and rollback

### Completion review

The follow-up review confirmed the repository remediation and local regression
checks are complete. It also caught and corrected a preflight ordering error:
exporting production SITE_URL before fixture-based tests caused origin rejections.
The corrected sequence clears SITE_URL for tests and sets it before the production
build; the frontend suite was rerun with **62 passed, 0 failed**.

Docker builds/non-root execution and image scanning remain unverified because
Docker is unavailable locally. Hosted CI remains unverified until publication.
Live proxy-chain verification, IAM/database-state checks and real provider
acceptance remain separate release gates. These limitations mean this report is
not a claim that every production verification step has been completed.

Commands below are **preparation only; none were executed**. The primary general
runbook is [GOOGLE_CLOUD_RUN_DEPLOYMENT.md](GOOGLE_CLOUD_RUN_DEPLOYMENT.md).
Do not replay its initial provisioning/IAM/secret-setting steps on existing services.
GitHub publication alone does not update Cloud Run.

This complete patch changes backend dependencies and API behavior, so both services
need a controlled release. To prioritize the critical frontend patch, deploy only
`portfolio-web` first and explicitly track the backend fixes as still pending.
No schema migration or re-ingestion is required for this patch.

### Preflight and local builds

Review the diff, obtain approval, then use a clean checkout of the reviewed commit.
Keep the pre-existing `.env.example` edit separate. Never upload local tooling or
environment files. In Cloud Shell (Bash), with patched Node 24.22.1 and Python 3.13:

```bash
set -euo pipefail
export PROJECT_ID=tudor-ai-portfolio
export REGION=europe-west1
# Keep the production origin out of tests that use synthetic request origins.
unset SITE_URL
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
export SITE_URL=https://tudoriacob.cloud.run
pnpm build
pnpm audit --prod
python scripts/smoke-production.py
python scripts/check-security-artifacts.py
python -m venv /tmp/portfolio-security-tests
/tmp/portfolio-security-tests/bin/python -m pip install -r backend/requirements-runtime.txt -c backend/requirements.lock.txt pytest PyYAML
(cd backend && /tmp/portfolio-security-tests/bin/python -m pytest -q)
python -m venv /tmp/portfolio-security-audit
/tmp/portfolio-security-audit/bin/python -m pip install pip-audit==2.10.1
/tmp/portfolio-security-audit/bin/python -m pip_audit -r backend/requirements-runtime.txt
/tmp/portfolio-security-audit/bin/python -m pip_audit -r backend/requirements.lock.txt
docker build --pull -t portfolio-web-security .
docker build --pull -t tai-backend-security backend
test "$(docker run --rm --entrypoint id portfolio-web-security -u)" != 0
test "$(docker run --rm --entrypoint id tai-backend-security -u)" != 0
```

Privately verify current IAM, image revisions, secret references, runtime SITE_URL,
service identities, min/max instances, concurrency and timeout in Cloud Console.
Backend must have IAM invoker checks enabled and no public principal grant.
Do not export or paste environment/secret values. Confirm each service currently
sends 100% traffic to one healthy revision; if split, record the full traffic map
and prepare an equivalent rollback instead of using the single-revision recipe.

```bash
WEB_PREVIOUS="$(gcloud run services describe portfolio-web --project="$PROJECT_ID" --region="$REGION" --format='json(status.traffic)' | jq -er '.status.traffic[] | select(.percent == 100) | .revisionName')"
API_PREVIOUS="$(gcloud run services describe tai-backend --project="$PROJECT_ID" --region="$REGION" --format='json(status.traffic)' | jq -er '.status.traffic[] | select(.percent == 100) | .revisionName')"
test -n "$WEB_PREVIOUS" && test -n "$API_PREVIOUS"
# Enter the existing approved build service-account email; do not create/grant one.
read -r -p 'Existing build service-account email: ' BUILD_SA
test -n "$BUILD_SA"
gcloud meta list-files-for-upload
(cd backend && gcloud meta list-files-for-upload)
```

Review upload listings privately: no environment files, keys, `.git`, local tools,
venvs or node_modules should appear. The frontend
source listing can include tests/docs but Docker COPY excludes them from its image.

### Stage and promote

Only after separate deployment approval. Omitting environment, secret, service
identity, scaling and IAM flags preserves the existing configuration. Review the
resulting revision before promoting. Source builds can incur Cloud Build and
Artifact Registry/source-storage charges even with no traffic; old images persist.

```bash
# Backend is needed for the complete patch; omit this block for frontend-only triage.
gcloud run deploy tai-backend --source backend --project="$PROJECT_ID" --region="$REGION" \
  --build-service-account="projects/$PROJECT_ID/serviceAccounts/$BUILD_SA" \
  --no-traffic --tag=security-review --quiet
API_NEW="$(gcloud run services describe tai-backend --project="$PROJECT_ID" --region="$REGION" --format='value(status.latestReadyRevisionName)')"

gcloud run deploy portfolio-web --source . --project="$PROJECT_ID" --region="$REGION" \
  --build-service-account="projects/$PROJECT_ID/serviceAccounts/$BUILD_SA" \
  --no-traffic --tag=security-review --quiet
WEB_NEW="$(gcloud run services describe portfolio-web --project="$PROJECT_ID" --region="$REGION" --format='value(status.latestReadyRevisionName)')"
```

Inspect the tagged frontend URL shown by gcloud: pages/metadata/header checks must
pass. Tagged frontend requests still use the configured canonical backend audience;
**do not change BACKEND_URL to a tag URL**. Browser writes on a tag origin are
intentionally rejected by the canonical-origin guard; use canonical Origin in
controlled HTTP checks, then test the actual site after promotion. The staged web
revision reaches the currently serving backend until backend traffic is promoted.
Check staged backend `/health` with an already-authorized operator identity and
confirm `/openapi.json` is absent; unauthenticated requests must receive Cloud Run
401/403. Do not add IAM permissions to bypass a failed check.

After the staged checks and review of the exact new revision names:

```bash
test -n "$API_NEW" && test -n "$WEB_NEW"
gcloud run services update-traffic tai-backend --project="$PROJECT_ID" --region="$REGION" --to-revisions="$API_NEW=100"
gcloud run services update-traffic portfolio-web --project="$PROJECT_ID" --region="$REGION" --to-revisions="$WEB_NEW=100"
curl --fail --silent --show-error --dump-header /tmp/portfolio-headers.txt "$SITE_URL/" --output /tmp/portfolio-home.html
curl --fail --silent --show-error "$SITE_URL/robots.txt"
curl --fail --silent --show-error "$SITE_URL/sitemap.xml"
```

Inspect HSTS, CSP-Report-Only, DENY, nosniff, canonical/social URLs, all project
pages, browser hydration and mobile navigation. Confirm unauthenticated backend
access is still blocked. In a human-approved, bounded acceptance session, verify
EN/RO T.AI questions retrieve known sources, stream NDJSON and complete; test one
intentional contact submission and confirm inbox delivery. These real checks cost
provider quota/send email and were **not** performed by this audit. Confirm quota
429/Retry-After and Redis fail-closed behavior in an isolated test environment,
not by disabling production Redis. Check logs privately for sanitized errors and
no credential/header/message logging. Inspect memory/startup failures and billing.

### Rollback

If regressions occur, restore the recorded healthy traffic (no secret or IAM edits):

```bash
gcloud run services update-traffic portfolio-web --project="$PROJECT_ID" --region="$REGION" --to-revisions="$WEB_PREVIOUS=100"
# Only if the backend was changed:
gcloud run services update-traffic tai-backend --project="$PROJECT_ID" --region="$REGION" --to-revisions="$API_PREVIOUS=100"
# Remove the temporary tags after acceptance or rollback:
gcloud run services update-traffic portfolio-web --project="$PROJECT_ID" --region="$REGION" --remove-tags=security-review
gcloud run services update-traffic tai-backend --project="$PROJECT_ID" --region="$REGION" --remove-tags=security-review
```

Rollback restores known vulnerable dependency versions if the previous revision
predates this patch. Use it only to recover availability, then prepare a corrected
patched release promptly. HSTS may remain cached for up to one day; keep HTTPS
available during rollback. Tags and old images may retain storage costs until an
explicitly reviewed cleanup. Never expose the backend or rotate secrets to debug
these changes.

## Remaining risks and review inventory

- Live exploitability, deployed versions/IAM, proxy trust, database policy state,
  delivery and provider behavior are unverified here. No penetration test performed.
- Shared quota availability remains unresolved until routing verification and
  aggregate spend protection are approved. IP identity never identifies a person.
- CSP is observation only. A nonce/hash enforcement rollout needs browser testing.
- Docker/OS-image vulnerability scanning and actual non-root execution remain a
  release gate; Docker and gcloud are not installed on this workstation.
- ESLint 9 is deprecated upstream; retained to avoid an unrelated major upgrade.
- CI YAML and pinned references were reviewed locally; Actions has not run remotely.
- No detected credentials does not establish absence in old container registries,
  provider logs or unreferenced/deleted remote history.

Changed areas: package/lockfile and Docker runtime; chat/server/contact validation;
FastAPI error/schema handling and two Python constraints; security headers and
ignore files; targeted JS/Python tests and local artifact/smoke scripts; Gitleaks,
Dependabot and security workflow; README, Cloud Run/Vercel guides, historical audit
label and rate-limit notes. The pre-existing `.env.example` change was not edited.
The previous uncommitted deployment-doc edits were preserved and updated in place.

### Files in the proposed patch

- `.dockerignore`
- `.gcloudignore`
- `.github/dependabot.yml`
- `.github/workflows/security.yml`
- `.gitignore`
- `.gitleaks.toml`
- `Dockerfile`
- `GOOGLE_CLOUD_RUN_DEPLOYMENT.md`
- `PRODUCTION_AUDIT.md`
- `README.md`
- `SECURITY_REMEDIATION.md`
- `TAI_RATE_LIMITING.md`
- `VERCEL_DEPLOYMENT.md`
- `app/api/chat/route.ts`
- `backend/.dockerignore`
- `backend/.gcloudignore`
- `backend/app/core/config.py`
- `backend/app/main.py`
- `backend/requirements.lock.txt`
- `backend/tests/test_audit.py`
- `backend/tests/test_security_hardening.py`
- `lib/contact-handler.ts`
- `lib/server.ts`
- `next.config.ts`
- `package.json`
- `pnpm-lock.yaml`
- `scripts/check-security-artifacts.py`
- `scripts/smoke-production.py`
- `scripts/test-chat-rate-limit.mjs`
- `scripts/test-security.mjs`
