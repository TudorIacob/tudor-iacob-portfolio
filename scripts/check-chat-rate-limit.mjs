// Explicitly opt-in: uses the configured Redis service, never OpenAI or Resend.
// All test keys are isolated, randomly named, and expire within 60 seconds.
import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { Redis } from "@upstash/redis";
import { load } from "./load-ts.mjs";
const { CHAT_LIMIT_SCRIPT } = await load("../lib/chat-rate-limit.ts");
try {
  const env = parseEnv(
    await readFile(new URL("../.env.local", import.meta.url), "utf8"),
  );
  const config = {
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
    retry: false,
    signal: () => AbortSignal.timeout(5000),
  };
  if (!config.url || !config.token) throw Error();
  const a = new Redis(config),
    b = new Redis(config);
  const prefix = `tai:ratelimit:integration:${randomUUID()}`;
  const keys = [`${prefix}:minute`, `${prefix}:day`];
  const attempt = (client, k = keys) =>
    client.eval(CHAT_LIMIT_SCRIPT, k, [2, 1, 3, 60]);
  assert.deepEqual(await attempt(a), [0, 0]);
  assert.deepEqual(await attempt(b), [0, 0]);
  const minute = await attempt(a);
  assert.equal(minute[0], 1);
  assert.ok(minute[1] > 0);
  assert.equal(await a.get(keys[1]), 2);
  assert.deepEqual(
    await attempt(b, [`${prefix}:visitor2:minute`, `${prefix}:visitor2:day`]),
    [0, 0],
  );
  await new Promise((resolve) => setTimeout(resolve, 1200));
  assert.deepEqual(await attempt(b), [0, 0]);
  const day = await attempt(a);
  assert.equal(day[0], 2);
  assert.ok(day[1] > 0 && day[1] <= 60);
  console.log(
    "PASS: live Redis atomic quotas, expiry, independent visitors, shared state across two clients, and rejected-request quota preservation. Isolated keys expire within 60 seconds.",
  );
} catch {
  console.error(
    "FAIL: Redis integration check did not complete. No credentials or provider details logged.",
  );
  process.exitCode = 1;
}
