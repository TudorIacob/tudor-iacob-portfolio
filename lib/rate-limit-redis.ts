import "server-only";
import { isIP } from "node:net";
import { Redis } from "@upstash/redis";

let cached: { url: string; token: string; client: Redis } | undefined;
export function rateLimitRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token || new URL(url).protocol !== "https:")
    throw new Error("Rate limiter unavailable");
  if (!cached || cached.url !== url || cached.token !== token) {
    cached = {
      url,
      token,
      client: new Redis({
        url,
        token,
        retry: false,
        // A fresh timeout per command, not a signal that expires with the cached client.
        signal: () => AbortSignal.timeout(3000),
      }),
    };
  }
  return cached.client;
}

export function trustedVisitorIp(
  request: Request,
  vercel: boolean,
  trustedHeader?: string,
) {
  const header = vercel ? "x-vercel-forwarded-for" : trustedHeader;
  const candidate = header ? request.headers.get(header)?.trim() : undefined;
  if (!candidate || !isIP(candidate)) return null;
  return candidate;
}
