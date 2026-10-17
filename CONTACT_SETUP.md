# Contact form setup

The form calls `POST /api/contact` and sends a plain-text notification through the official Resend SDK. The sender and recipient come only from server configuration. Reply goes to the visitor. No submitted messages are stored in the application database or logged by this implementation. Resend necessarily processes the email; review its retention settings for your privacy policy.

## Required environment variables

Add these to the existing ignored `.env.local` without replacing other settings:

```dotenv
RESEND_API_KEY=<your Resend sending key>
CONTACT_EMAIL_TO=tudor.iacob@gmail.com
CONTACT_EMAIL_FROM=<address on your verified sender domain>
UPSTASH_REDIS_REST_URL=<HTTPS REST URL from Upstash>
UPSTASH_REDIS_REST_TOKEN=<Upstash REST token>
```

Use plain email addresses for FROM and TO, without display names. All five variables are server-only: never prefix them with `NEXT_PUBLIC_`. `.env.local` is already excluded by `.gitignore`; `.env.example` remains included. Existing local secrets have not been modified. Old contact webhook settings are no longer used.

1. Create a Resend account, [verify a sender domain](https://resend.com/docs/dashboard/domains/introduction), and create a sending API key scoped to that domain. Add the DNS records Resend provides and wait for verification before production use.
2. Create an Upstash Redis database and copy its REST URL and token. Separate production and development databases are recommended to avoid sharing quotas.
3. Set the variables above. Restart `pnpm dev` after editing local environment settings.

## Local testing

Run `pnpm test`, `pnpm lint`, `pnpm typecheck`, and `pnpm build`. Automated contact tests mock Resend's HTTP response and do not send real email or require credentials. They exercise server validation and real React DOM form interactions.

For a manual delivery check, run `pnpm dev`, open `http://localhost:3000/#contact`, and submit one intentional message after configuring both services. Check the recipient inbox, spam folder and Resend delivery status. Use Reply to verify the visitor's address. A successful API response means Resend accepted the message, not guaranteed inbox delivery.

Check empty fields, invalid email, pending/disabled state, failure preservation and success reset. Five attempts within ten minutes consume the local shared quota; the next returns 429 with Retry-After. Wait for expiry rather than disabling protection. If configuration is missing, expect a safe error and retained fields. No real email was sent during implementation.

## Vercel checklist

- Add all five variables in Project Settings → Environment Variables, scoped to Production (and Preview only if wanted).
- Set existing `SITE_URL` to your canonical HTTPS origin without a trailing slash.
- Verify the Resend domain and sender; configure Upstash before enabling contact traffic.
- Redeploy after environment changes. Keep API keys out of public variables and logs.
- Run one intentional production delivery test, check Reply-To and inbox delivery, and monitor Resend/Upstash quotas and errors.
- Protect preview deployments or use separate service credentials/databases.

## Protection and limits

Zod validates both client and server: name 1–100 characters, email up to 254, optional company up to 150, message 10–5,000. Requests are capped at 16,000 UTF-8 bytes, so large multibyte messages may reach the byte cap first. Control characters are rejected (message line breaks/tabs remain allowed). JSON fields are strict. The honeypot must be empty. Origin must match the request origin or configured SITE_URL; missing origins are rejected. This is defense-in-depth, not authentication.

The isolated `lib/contact-rate-limit.ts` helper uses an atomic Redis Lua script: five attempts per ten minutes per identity and 100 attempts per hour globally. Counters expire and contain hashed IP identifiers, never messages or email addresses. On Vercel the identity comes from its platform-controlled `x-vercel-forwarded-for` header. Outside Vercel, or if the header is invalid, callers share one limit; arbitrary forwarded headers are ignored. Redis failure/missing configuration fails closed. Client IP hashing is pseudonymization, not full anonymization.

The form locks synchronously against double clicks and reuses its request UUID when retrying unchanged fields. A payload digest binds that UUID to the exact email. Resend's [idempotency protection](https://resend.com/docs/api-reference/emails/send-email) lasts 24 hours. Reloading the page creates a new attempt; deliberately repeated submissions are limited, not permanently deduplicated.

Redis has a three-second timeout, body reading ten seconds, Resend ten seconds, and the browser 25 seconds. Provider errors are never returned verbatim. API responses consistently use `{ok:true}` or `{ok:false,error,...}` (HEAD has no body). Unsupported methods return 405.

Honeypots and quotas do not stop every bot or distributed abuse. A server-side Turnstile verification step can be inserted before delivery in `handleContact`; add a client token and strict schema field at the same time. No CAPTCHA is currently required. These controls can also let abuse exhaust the shared quota, so monitor traffic and add a challenge if needed.

## Troubleshooting delivery

The Next.js server logs fixed `[contact]` diagnostic codes, never raw provider errors, addresses or message content:

- `configuration_missing_or_invalid`: check the three Resend settings and restart Next.js.
- `rate_limiter_unavailable`: check Upstash connectivity and credentials.
- `resend_test_recipient_restricted`: the Resend test sender can send only to the account's own allowed address. Verify your own sender domain for production.
- `resend_sender_domain_unverified`: verify the configured sender domain in Resend.
- `resend_invalid_api_key` / `resend_key_permissions`: check the sending key and its domain scope.
- `resend_quota_or_rate_limit`: inspect provider quotas.
- `resend_timeout` / `provider_unavailable`: inspect service availability and retry later.

The form displays the waiting time for HTTP 429 while preserving input. Provider/configuration details remain server-side. On 17 October 2026, an explicitly authorized diagnostic submission through the running local endpoint returned 200 and Resend reported `delivered`. The original generic failure was not reproduced; this does not establish its historical cause. No credentials were changed. The current sender uses Resend's test domain; verify your own domain before public deployment.
