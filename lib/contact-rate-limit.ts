import { createHash } from "node:crypto";
import { rateLimitRedis, trustedVisitorIp } from "./rate-limit-redis";

// Atomic, shared counters: five attempts per ten minutes and 100 per hour overall.
// Only expiring counters are stored, never messages or email addresses.
export const CONTACT_LIMIT_SCRIPT = `
local retry = 0
for i, key in ipairs(KEYS) do
  local count = redis.call('INCR', key)
  local window = tonumber(ARGV[i * 2])
  if count == 1 then redis.call('EXPIRE', key, window) end
  if count > tonumber(ARGV[i * 2 - 1]) then
    retry = math.max(retry, redis.call('TTL', key), 1)
  end
end
return retry
`;
export function contactLimitKeys(request: Request, vercel: boolean) {
  // Never trust caller-controlled forwarded headers outside Vercel.
  const identity = trustedVisitorIp(request, vercel) || "shared";
  const digest = createHash("sha256").update(identity).digest("hex");
  return [`portfolio:contact:v1:${digest}`, "portfolio:contact:v1:global"];
}
export async function contactRateLimit(request: Request) {
  const retryAfter = await rateLimitRedis().eval(
    CONTACT_LIMIT_SCRIPT,
    contactLimitKeys(request, process.env.VERCEL === "1"),
    [5, 600, 100, 3600],
  );
  if (
    typeof retryAfter !== "number" ||
    !Number.isInteger(retryAfter) ||
    retryAfter < 0
  )
    throw new Error("Invalid rate limit response");
  return { allowed: retryAfter === 0, retryAfter };
}
