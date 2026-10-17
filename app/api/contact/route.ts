import { Resend } from "resend";
import { readJson } from "@/lib/server";
import {
  contactConfig,
  handleContact,
  methodNotAllowed,
} from "@/lib/contact-handler";
import { contactRateLimit } from "@/lib/contact-rate-limit";
import { contactProviderFailure } from "@/lib/contact-diagnostics";

export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(request: Request) {
  const config = contactConfig(process.env);
  return handleContact(request, {
    config,
    siteUrl: process.env.SITE_URL,
    readJson,
    reportFailure: (code) => console.error(`[contact] ${code}`),
    rateLimit: contactRateLimit,
    send: async (email, idempotencyKey) => {
      if (!config) return false;
      const resend = new Resend(config.apiKey);
      try {
        const { data, error } = await resend.emails.send(email, {
          idempotencyKey,
          signal: AbortSignal.timeout(10000),
        });
        if (error || !data?.id) {
          console.error(`[contact] ${contactProviderFailure(error)}`);
          return false;
        }
        return true;
      } catch (error) {
        console.error(`[contact] ${contactProviderFailure(error)}`);
        return false;
      }
    },
  });
}
export const GET = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
export const OPTIONS = methodNotAllowed;
export function HEAD() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}
