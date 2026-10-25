import test from "node:test";
import assert from "node:assert/strict";
import { load } from "./load-ts.mjs";
const { trustedOrigin } = await load("../lib/server.ts");
const { POST } = await load("../app/api/chat/route.ts");
const { trustedVisitorIp } = await load("../lib/rate-limit-redis.ts");
const { chatLimitKeys } = await load("../lib/chat-rate-limit.ts");
const { contactLimitKeys } = await load("../lib/contact-rate-limit.ts");
const { default: config } = await load("../next.config.ts");

test("canonical origin rejects a matching forged request Host and Origin", () => {
  const request = new Request("https://attacker.example/api/chat", {
    headers: { origin: "https://attacker.example" },
  });
  assert.equal(trustedOrigin(request, "https://portfolio.example"), false);
  assert.equal(trustedOrigin(new Request("http://internal/api/chat", {
    headers: { origin: "https://portfolio.example" },
  }), "https://portfolio.example"), true);
});
test("cross-site fetch metadata is rejected even without Origin", () => {
  assert.equal(trustedOrigin(new Request("https://portfolio.example/api/chat", {
    headers: { "sec-fetch-site": "cross-site" },
  })), false);
});
test("chat rejects simple-form content types before any provider calls", async () => {
  for (const type of ["text/plain", "application/x-www-form-urlencoded", "multipart/form-data"]) {
    const result = await POST(new Request("https://portfolio.example/api/chat", {
      method: "POST", headers: { "content-type": type },
      body: '{"message":"Projects?"}',
    }));
    assert.equal(result.status, 415);
  }
});
test("verified Cloud Run suffix ignores forged prefixes and separates visitors", () => {
  const env = { K_SERVICE: "web", CLOUD_RUN_TRUSTED_PROXY_HOPS: "2" };
  const req = (xff) => new Request("https://portfolio.example", { headers: { "x-forwarded-for": xff } });
  assert.equal(trustedVisitorIp(req("fake, 192.0.2.1, 10.0.0.1"), false, undefined, env), "192.0.2.1");
  assert.deepEqual(chatLimitKeys(req("fake, 192.0.2.1, 10.0.0.1"), env), chatLimitKeys(req("different, 192.0.2.1, 10.0.0.1"), env));
  assert.notDeepEqual(chatLimitKeys(req("192.0.2.1, 10.0.0.1"), env), chatLimitKeys(req("192.0.2.2, 10.0.0.1"), env));
  for (const hops of ["0", "-1", "6", "1.5", "invalid"]) {
    assert.equal(trustedVisitorIp(req("192.0.2.1"), false, undefined, { ...env, CLOUD_RUN_TRUSTED_PROXY_HOPS: hops }), null);
  }
  assert.equal(trustedVisitorIp(req("10.0.0.1"), false, undefined, env), null);
});
test("contact retains global protection with verified separate visitor buckets", () => {
  const saved = [process.env.K_SERVICE, process.env.CLOUD_RUN_TRUSTED_PROXY_HOPS];
  process.env.K_SERVICE = "web";
  process.env.CLOUD_RUN_TRUSTED_PROXY_HOPS = "2";
  try {
    const req = (ip) => new Request("https://portfolio.example", { headers: { "x-forwarded-for": `${ip}, 10.0.0.1` } });
    const a = contactLimitKeys(req("192.0.2.1"), false);
    const b = contactLimitKeys(req("192.0.2.2"), false);
    assert.notEqual(a[0], b[0]);
    assert.equal(a[1], b[1]);
  } finally {
    ["K_SERVICE", "CLOUD_RUN_TRUSTED_PROXY_HOPS"].forEach((key, i) => {
      if (saved[i] === undefined) delete process.env[key]; else process.env[key] = saved[i];
    });
  }
});
test("production CSP is report-only and HSTS avoids subdomain/preload commitments", async () => {
  const saved = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "production";
    const headers = Object.fromEntries((await config.headers())[0].headers.map(({key,value}) => [key,value]));
    assert.match(headers["Content-Security-Policy-Report-Only"], /connect-src 'self'/);
    assert.match(headers["Content-Security-Policy-Report-Only"], /object-src 'none'/);
    assert.equal(headers["Content-Security-Policy"], undefined);
    assert.equal(headers["Strict-Transport-Security"], "max-age=86400");
    process.env.NODE_ENV = "development";
    assert.equal((await config.headers())[0].headers.some(h => h.key === "Strict-Transport-Security"), false);
  } finally {
    if (saved === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = saved;
  }
});
