import { createHash } from "node:crypto";
import { z } from "zod";
import { contactSchema, contactErrors } from "./contact-schema";

export type ContactConfig = { apiKey: string; from: string; to: string };
type Email = {
  from: string;
  to: string;
  replyTo: string;
  subject: string;
  text: string;
};
export type ContactDependencies = {
  config: ContactConfig | null;
  siteUrl?: string;
  readJson: (request: Request, max: number) => Promise<unknown>;
  rateLimit: (
    request: Request,
  ) => Promise<{ allowed: boolean; retryAfter: number }>;
  send: (email: Email, key: string) => Promise<boolean>;
  reportFailure?: (
    code: "configuration_missing_or_invalid" | "rate_limiter_unavailable",
  ) => void;
};
export function contactConfig(
  env: Record<string, string | undefined>,
): ContactConfig | null {
  const {
    RESEND_API_KEY: apiKey,
    CONTACT_EMAIL_FROM: from,
    CONTACT_EMAIL_TO: to,
  } = env;
  if (
    !apiKey?.trim() ||
    !from ||
    !to ||
    !z.email().safeParse(from).success ||
    !z.email().safeParse(to).success
  )
    return null;
  return { apiKey, from, to };
}
const failure = (status: number, error: string, extra = {}, headers = {}) =>
  Response.json(
    { ok: false, error, ...extra },
    { status, headers: { "Cache-Control": "no-store", ...headers } },
  );
export function methodNotAllowed() {
  return failure(405, "Method not allowed", {}, { Allow: "POST" });
}
export async function handleContact(
  request: Request,
  deps: ContactDependencies,
) {
  if (request.method !== "POST") return methodNotAllowed();
  const origin = request.headers.get("origin");
  if (
    !origin ||
    (origin !== new URL(request.url).origin && origin !== deps.siteUrl)
  )
    return failure(403, "Forbidden");
  if (
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !==
    "application/json"
  )
    return failure(415, "Expected JSON");
  if (Number(request.headers.get("content-length")) > 16000)
    return failure(413, "Request too large");
  const requestId = request.headers.get("idempotency-key");
  if (!z.uuid().safeParse(requestId).success)
    return failure(400, "Invalid request identifier");
  if (!deps.config) {
    deps.reportFailure?.("configuration_missing_or_invalid");
    return failure(503, "Contact delivery is unavailable");
  }
  try {
    const limit = await deps.rateLimit(request);
    if (!limit.allowed)
      return failure(
        429,
        "Too many requests. Please try again later.",
        {},
        { "Retry-After": String(limit.retryAfter) },
      );
  } catch {
    deps.reportFailure?.("rate_limiter_unavailable");
    return failure(503, "Contact delivery is unavailable");
  }
  let value: unknown;
  try {
    value = await deps.readJson(request, 16000);
  } catch (error) {
    return failure(
      error instanceof Error && error.message === "Request too large"
        ? 413
        : 400,
      "Invalid request body",
    );
  }
  const parsed = contactSchema.safeParse(value);
  if (!parsed.success)
    return failure(400, "Check your form fields", {
      fieldErrors: contactErrors(parsed.error),
    });
  const { name, email, company, message } = parsed.data;
  // Future Turnstile verification belongs here, before sending.
  // Plain text ensures submitted markup never becomes executable email HTML.
  const notification = {
    from: deps.config.from,
    to: deps.config.to,
    replyTo: email,
    subject: `New Portfolio Inquiry — ${name}`,
    text: `Name: ${name}\nEmail: ${email}\nCompany: ${company || "Not provided"}\n\nMessage:\n${message}\n\nSource: Portfolio Contact Form`,
  };
  const hash = createHash("sha256")
    .update(JSON.stringify(notification))
    .digest("hex");
  try {
    if (!(await deps.send(notification, `contact/${requestId}/${hash}`)))
      return failure(502, "Unable to send message");
    return Response.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return failure(502, "Unable to send message");
  }
}
