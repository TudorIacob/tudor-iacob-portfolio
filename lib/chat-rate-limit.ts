import "server-only";
import { createHash } from "node:crypto";
import { rateLimitRedis, trustedVisitorIp } from "./rate-limit-redis";

export type ChatLimit = {
  allowed: boolean;
  reason: "minute" | "day" | null;
  retryAfter: number;
};
// Check both counters before consuming either. Rejections do not use daily quota.
// Fixed windows start at the first accepted request and expire automatically.
export const CHAT_LIMIT_SCRIPT = `
local blocked = 0
local retry = 0
for i, key in ipairs(KEYS) do
  local count = tonumber(redis.call('GET', key) or '0')
  if count >= tonumber(ARGV[i * 2 - 1]) then
    local ttl = redis.call('TTL', key)
    if ttl < 1 then ttl = tonumber(ARGV[i * 2]) end
    if ttl >= retry then blocked = i; retry = ttl end
  end
end
if blocked > 0 then return {blocked, retry} end
for i, key in ipairs(KEYS) do
  local count = redis.call('INCR', key)
  if count == 1 then redis.call('EXPIRE', key, tonumber(ARGV[i * 2])) end
end
return {0, 0}
`;
function positiveLimit(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return /^\d+$/.test(value || "") && Number.isSafeInteger(parsed) && parsed > 0
    ? parsed
    : fallback;
}
export function chatLimitKeys(
  request: Request,
  env: Record<string, string | undefined> = process.env,
) {
  const ip = trustedVisitorIp(
    request,
    env.VERCEL === "1",
    env.TRUSTED_CLIENT_IP_HEADER,
    env,
  );
  // Never collapse production visitors into a silent shared bucket. Missing trusted
  // identity triggers the documented backend safety fallback instead.
  if (
    !ip &&
    !env.K_SERVICE &&
    (env.VERCEL === "1" || env.NODE_ENV === "production")
  )
    throw new Error("Visitor identity unavailable");
  const digest = createHash("sha256")
    .update(
      ip || (env.K_SERVICE ? "cloud-run-shared-safety" : "local-development"),
    )
    .digest("hex");
  return [`tai:ratelimit:minute:${digest}`, `tai:ratelimit:day:${digest}`];
}
export async function chatRateLimit(request: Request): Promise<ChatLimit> {
  const keys = chatLimitKeys(request);
  const result = await rateLimitRedis().eval(CHAT_LIMIT_SCRIPT, keys, [
    positiveLimit(process.env.TAI_RATE_LIMIT_PER_MINUTE, 15),
    60,
    positiveLimit(process.env.TAI_RATE_LIMIT_PER_DAY, 100),
    86400,
  ]);
  if (
    !Array.isArray(result) ||
    result.length !== 2 ||
    !Number.isInteger(result[0]) ||
    ![0, 1, 2].includes(result[0]) ||
    !Number.isInteger(result[1]) ||
    result[1] < 0 ||
    result[1] > 86400 ||
    (result[0] !== 0 && result[1] === 0)
  )
    throw new Error("Invalid rate limit response");
  return {
    allowed: result[0] === 0,
    reason: result[0] === 2 ? "day" : result[0] === 1 ? "minute" : null,
    retryAfter: result[1],
  };
}
