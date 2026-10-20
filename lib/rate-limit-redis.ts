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
  env: Record<string, string | undefined> = process.env,
) {
  if (env.K_SERVICE) {
    // Opt in only after verifying the proxy chain on the deployed run.app URL.
    // Never take an arbitrary client-supplied first XFF value.
    const hops = Number(env.CLOUD_RUN_TRUSTED_PROXY_HOPS || "0");
    if (!Number.isInteger(hops) || hops < 1 || hops > 5) return null;
    const chain = request.headers.get("x-forwarded-for")?.split(",") || [];
    const ip = chain.at(-hops)?.trim();
    return ip && isIP(ip) ? ip : null;
  }
  const header = vercel ? "x-vercel-forwarded-for" : trustedHeader;
  const candidate = header ? request.headers.get(header)?.trim() : undefined;
  if (!candidate || !isIP(candidate)) return null;
  return candidate;
}
