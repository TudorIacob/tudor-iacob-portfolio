import test from "node:test";
import assert from "node:assert/strict";
import { GoogleAuth } from "google-auth-library";
import { readFile } from "node:fs/promises";
import { load } from "./load-ts.mjs";
const { backendRequestHeaders, cloudRunAudience } = await load(
  "../lib/backend-auth.ts",
);
const { backendBaseUrl } = await load("../lib/backend.ts");
const { trustedVisitorIp } = await load("../lib/rate-limit-redis.ts");
const { chatLimitKeys } = await load("../lib/chat-rate-limit.ts");
const names = [
  "K_SERVICE",
  "VERCEL",
  "BACKEND_API_KEY",
  "BACKEND_URL",
  "TAI_BACKEND_URL",
];
async function fixture(run) {
  const saved = Object.fromEntries(names.map((n) => [n, process.env[n]]));
  const original = GoogleAuth.prototype.getIdTokenClient;
  Object.assign(process.env, {
    K_SERVICE: "portfolio-web",
    BACKEND_API_KEY: "test-only",
  });
  try {
    await run();
  } finally {
    GoogleAuth.prototype.getIdTokenClient = original;
    for (const n of names)
      if (saved[n] === undefined) delete process.env[n];
      else process.env[n] = saved[n];
  }
}
test("Cloud Run obtains audience-bound identity headers while keeping application key", () =>
  fixture(async () => {
    let calls = 0,
      headersCalls = 0;
    GoogleAuth.prototype.getIdTokenClient = async (audience) => {
      calls++;
      assert.equal(audience, "https://tai-auth-test.run.app");
      return {
        getRequestHeaders: async () => {
          headersCalls++;
          return new Headers({
            authorization: "Bearer dummy-test-identity",
            "x-unrelated": "discard",
          });
        },
      };
    };
    for (let i = 0; i < 2; i++) {
      const h = await backendRequestHeaders("https://tai-auth-test.run.app/");
      assert.equal(h["X-API-Key"], "test-only");
      assert.equal(
        h["X-Serverless-Authorization"],
        "Bearer dummy-test-identity",
      );
      assert.equal(h.Authorization, undefined);
      assert.equal(h["x-unrelated"], undefined);
    }
    assert.equal(calls, 1);
    assert.equal(headersCalls, 2);
  }));
test("identity failure is sanitized and does not fall back to unauthenticated requests", () =>
  fixture(async () => {
    GoogleAuth.prototype.getIdTokenClient = async () => {
      throw Error("sensitive metadata contents");
    };
    await assert.rejects(
      backendRequestHeaders("https://tai-error-test.run.app"),
      /^Error: Backend authentication unavailable$/,
    );
  }));
test("local/Vercel calls require no Google credentials", () =>
  fixture(async () => {
    delete process.env.K_SERVICE;
    GoogleAuth.prototype.getIdTokenClient = async () => {
      throw Error("must not call");
    };
    assert.deepEqual(await backendRequestHeaders("http://localhost:8000"), {
      "Content-Type": "application/json",
      "X-API-Key": "test-only",
    });
  }));
test("Cloud Run rejects missing app key and unsafe audiences", () =>
  fixture(async () => {
    for (const u of [
      "http://tai.run.app",
      "https://example.com",
      "https://tai.run.app/chat",
      "https://user:pass@tai.run.app",
      "https://tai.run.app/?a=1",
      "https://tai.run.app/#x",
    ]) {
      assert.throws(() => cloudRunAudience(u));
    }
    delete process.env.BACKEND_API_KEY;
    await assert.rejects(backendRequestHeaders("https://tai.run.app"));
  }));
test("Cloud Run chooses BACKEND_URL even when stale Vercel settings exist", () =>
  fixture(async () => {
    process.env.BACKEND_URL = "https://tai.run.app";
    process.env.TAI_BACKEND_URL = "https://stale.example";
    process.env.VERCEL = "1";
    assert.equal(backendBaseUrl(), "https://tai.run.app");
    delete process.env.BACKEND_URL;
    assert.equal(backendBaseUrl(), undefined);
  }));
test("unverified Cloud Run proxy headers cannot create unlimited rate-limit identities", () => {
  const env = { K_SERVICE: "portfolio-web", NODE_ENV: "production" };
  const req = (ip) =>
    new Request("https://web.run.app/api/chat", {
      headers: { "x-forwarded-for": ip },
    });
  assert.deepEqual(
    chatLimitKeys(req("192.0.2.1"), env),
    chatLimitKeys(req("192.0.2.2"), env),
  );
  const verified = { ...env, CLOUD_RUN_TRUSTED_PROXY_HOPS: "1" };
  assert.equal(
    trustedVisitorIp(req("attacker, 192.0.2.4"), false, undefined, verified),
    "192.0.2.4",
  );
  assert.equal(
    trustedVisitorIp(req("garbage"), false, undefined, verified),
    null,
  );
  assert.deepEqual(
    chatLimitKeys(req("spoof, 192.0.2.4"), verified),
    chatLimitKeys(req("other, 192.0.2.4"), verified),
  );
});
test("container sources do not copy environment files or development directories", async () => {
  const web = await readFile(new URL("../Dockerfile", import.meta.url), "utf8");
  const api = await readFile(
    new URL("../backend/Dockerfile", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(web, /^COPY \. /m);
  assert.doesNotMatch(api, /^COPY \. /m);
  assert.match(web, /USER node/);
  assert.match(api, /USER appuser/);
  assert.match(web, /HOSTNAME=0\.0\.0\.0 exec node server\.js/);
  assert.match(api, /\$\{PORT:-8080\}/);
});
