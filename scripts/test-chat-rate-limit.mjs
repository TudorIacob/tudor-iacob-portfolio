import test from "node:test";
import assert from "node:assert/strict";
import { load } from "./load-ts.mjs";
import { GoogleAuth } from "google-auth-library";
import { streamChat } from "../lib/chat.ts";
const { POST } = await load("../app/api/chat/route.ts");
const { chatLimitKeys, chatRateLimit } = await load(
  "../lib/chat-rate-limit.ts",
);
const { contactLimitKeys } = await load("../lib/contact-rate-limit.ts");
const { rateLimitRedis } = await load("../lib/rate-limit-redis.ts");
function request(ip = "192.0.2.1") {
  return new Request("https://portfolio.example/api/chat", {
    method: "POST",
    headers: {
      origin: "https://portfolio.example",
      "content-type": "application/json",
      "x-vercel-forwarded-for": ip,
    },
    body: JSON.stringify({ message: "Projects?", history: [] }),
  });
}
const envNames = [
  "NODE_ENV",
  "VERCEL",
  "BACKEND_URL",
  "TAI_BACKEND_URL",
  "BACKEND_API_KEY",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "TAI_RATE_LIMIT_PER_MINUTE",
  "TAI_RATE_LIMIT_PER_DAY",
  "TRUSTED_CLIENT_IP_HEADER",
  "K_SERVICE",
  "CLOUD_RUN_TRUSTED_PROXY_HOPS",
];
async function fixture(run) {
  const saved = Object.fromEntries(envNames.map((k) => [k, process.env[k]]));
  const original = globalThis.fetch;
  const warn = console.warn;
  Object.assign(process.env, {
    NODE_ENV: "production",
    VERCEL: "1",
    BACKEND_URL: "https://backend.example",
    TAI_BACKEND_URL: "https://backend.example",
    BACKEND_API_KEY: "test-only",
    UPSTASH_REDIS_REST_URL: "https://redis.example",
    UPSTASH_REDIS_REST_TOKEN: "test-only",
    TAI_RATE_LIMIT_PER_MINUTE: "2",
    TAI_RATE_LIMIT_PER_DAY: "3",
  });
  delete process.env.K_SERVICE;
  delete process.env.CLOUD_RUN_TRUSTED_PROXY_HOPS;
  const state = {
    backendCalls: 0,
    redisCalls: 0,
    rows: new Map(),
    redisError: false,
    backendStatus: 200,
    retry: "17",
    warnings: [],
    now: 0,
    commands: [],
    backendUrl: "https://backend.example/chat",
    identity: undefined,
    body: undefined,
  };
  console.warn = (...args) => state.warnings.push(args.join(" "));
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith("https://redis.example")) {
      state.redisCalls++;
      if (state.redisError) throw Error("private token and visitor details");
      const [command] = JSON.parse(options.body);
      state.commands.push(command);
      assert.equal(command[0], "eval");
      const keys = command.slice(3, 5);
      const args = command.slice(5);
      let blocked = 0,
        retry = 0;
      for (let i = 0; i < 2; i++) {
        const row = state.rows.get(keys[i]);
        if (row && row.until <= state.now) state.rows.delete(keys[i]);
        if (
          row &&
          row.until > state.now &&
          row.count >= args[i * 2] &&
          row.until - state.now >= retry
        ) {
          blocked = i + 1;
          retry = row.until - state.now;
        }
      }
      if (!blocked)
        keys.forEach((key, i) => {
          const row = state.rows.get(key) || {
            count: 0,
            until: state.now + args[i * 2 + 1],
          };
          row.count++;
          state.rows.set(key, row);
        });
      return Response.json([{ result: [blocked, retry] }]);
    }
    assert.equal(String(url), state.backendUrl);
    assert.equal(options.redirect, "error");
    assert.equal(options.headers["X-API-Key"], "test-only");
    assert.equal(options.headers["X-Serverless-Authorization"], state.identity);
    state.backendCalls++;
    if (state.backendStatus !== 200)
      return Response.json(
        { detail: "private backend details" },
        {
          status: state.backendStatus,
          headers: { "Retry-After": state.retry, "X-Internal": "private" },
        },
      );
    return new Response(
      state.body ||
        '{"type":"token","text":"Hello"}\n{"type":"done","mode":"live"}\n',
    );
  };
  try {
    await run(state);
  } finally {
    globalThis.fetch = original;
    console.warn = warn;
    for (const name of envNames) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  }
}
test("normal chat streams unchanged with Redis checked before backend", () =>
  fixture(async (state) => {
    const result = await POST(request());
    assert.equal(result.status, 200);
    assert.match(await result.text(), /"mode":"live"/);
    assert.equal(state.redisCalls, 1);
    assert.equal(state.backendCalls, 1);
    assert.deepEqual(state.commands[0].slice(-4), [2, 60, 3, 86400]);
  }));

test("Cloud Run route streams without buffering and propagates cancellation", () =>
  fixture(async (state) => {
    process.env.K_SERVICE = "portfolio-web";
    process.env.BACKEND_URL = "https://tai-stream-test.run.app";
    state.backendUrl = "https://tai-stream-test.run.app/chat";
    state.identity = "Bearer dummy-test-identity";
    let cancelled = false;
    state.body = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode('{"type":"token","text":"Hi"}\n'));
      },
      cancel() {
        cancelled = true;
      },
    });
    const original = GoogleAuth.prototype.getIdTokenClient;
    GoogleAuth.prototype.getIdTokenClient = async () => ({
      getRequestHeaders: async () =>
        new Headers({ authorization: state.identity }),
    });
    try {
      const response = await POST(request());
      assert.equal(response.status, 200);
      assert.equal(
        response.headers.get("content-type"),
        "application/x-ndjson",
      );
      assert.equal(response.headers.get("X-Serverless-Authorization"), null);
      const reader = response.body.getReader();
      assert.match(
        new TextDecoder().decode((await reader.read()).value),
        /"text":"Hi"/,
      );
      await reader.cancel();
      assert.equal(cancelled, true);
    } finally {
      GoogleAuth.prototype.getIdTokenClient = original;
    }
  }));

test("Cloud Run IAM failure never reaches backend or leaks provider details", () =>
  fixture(async (state) => {
    process.env.K_SERVICE = "portfolio-web";
    process.env.BACKEND_URL = "https://tai-route-error.run.app";
    const original = GoogleAuth.prototype.getIdTokenClient;
    GoogleAuth.prototype.getIdTokenClient = async () => {
      throw Error("private token data");
    };
    try {
      const response = await POST(request());
      assert.equal(response.status, 503);
      assert.equal(state.backendCalls, 0);
      assert.doesNotMatch(await response.text(), /private|token|run.app/);
    } finally {
      GoogleAuth.prototype.getIdTokenClient = original;
    }
  }));

test("Cloud Run Redis failure fails closed before Google or OpenAI work", () =>
  fixture(async (state) => {
    process.env.K_SERVICE = "portfolio-web";
    state.redisError = true;
    const response = await POST(request());
    assert.equal(response.status, 503);
    assert.equal(state.backendCalls, 0);
    assert.deepEqual(state.warnings, [
      "[tai] distributed_rate_limit_unavailable",
    ]);
  }));

test("Vercel binding wins over a stale local backend URL", () =>
  fixture(async (state) => {
    process.env.BACKEND_URL = "http://127.0.0.1:8000";
    assert.equal((await POST(request())).status, 200);
    assert.equal(state.backendCalls, 1);
  }));

test("missing Vercel binding fails closed without demo or external fallback", () =>
  fixture(async (state) => {
    delete process.env.TAI_BACKEND_URL;
    const response = await POST(request());
    assert.equal(response.status, 503);
    assert.equal(state.backendCalls, 0);
    assert.doesNotMatch(
      await response.text(),
      /mode|localhost|backend.example/,
    );
  }));

test("standalone local backend remains supported without a binding", () =>
  fixture(async (state) => {
    delete process.env.TAI_BACKEND_URL;
    delete process.env.VERCEL;
    process.env.TRUSTED_CLIENT_IP_HEADER = "x-vercel-forwarded-for";
    assert.equal((await POST(request())).status, 200);
    assert.equal(state.backendCalls, 1);
  }));

test("binding URLs retain their path prefix and resolve at request time", async () => {
  const { backendChatUrl, backendBaseUrl } = await load("../lib/backend.ts");
  assert.equal(
    backendChatUrl("https://internal.example/prefix").href,
    "https://internal.example/prefix/chat",
  );
  assert.equal(
    backendChatUrl("https://internal.example/prefix/").href,
    "https://internal.example/prefix/chat",
  );
  await fixture(async () => {
    assert.equal(backendBaseUrl(), "https://backend.example");
    process.env.TAI_BACKEND_URL = "https://replacement.example";
    assert.equal(backendBaseUrl(), "https://replacement.example");
  });
});
test("minute limit blocks upstream and returns remaining retry time", () =>
  fixture(async (state) => {
    await POST(request());
    await POST(request());
    state.now = 10;
    const result = await POST(request());
    assert.equal(result.status, 429);
    assert.equal(result.headers.get("Retry-After"), "50");
    assert.equal((await result.json()).code, "TAI_MINUTE_LIMIT");
    assert.equal(state.backendCalls, 2);
    const day = [...state.rows.entries()].find(([key]) =>
      key.includes(":day:"),
    )[1];
    assert.equal(day.count, 2);
  }));
test("daily limit persists across minute windows and chooses longest retry", () =>
  fixture(async (state) => {
    await POST(request());
    await POST(request());
    state.now = 61;
    await POST(request());
    const result = await POST(request());
    assert.equal(result.status, 429);
    assert.equal(result.headers.get("Retry-After"), String(86400 - 61));
    assert.equal((await result.json()).code, "TAI_DAILY_LIMIT");
    assert.equal(state.backendCalls, 3);
  }));
test("visitors are independent and contact namespace remains isolated", () =>
  fixture(async (state) => {
    await POST(request());
    await POST(request());
    assert.equal((await POST(request())).status, 429);
    assert.equal((await POST(request("192.0.2.2"))).status, 200);
    const keys = chatLimitKeys(request());
    assert.ok(keys.every((key) => !key.includes("192.0.2.1")));
    assert.ok(
      contactLimitKeys(request(), true).every((key) => !keys.includes(key)),
    );
    assert.equal(state.backendCalls, 3);
  }));
test("fresh Redis clients still use remote counters, not per-process quotas", () =>
  fixture(async (state) => {
    await chatRateLimit(request());
    const before = rateLimitRedis();
    process.env.UPSTASH_REDIS_REST_TOKEN = "second-test-client";
    await chatRateLimit(request());
    assert.notEqual(rateLimitRedis(), before);
    assert.equal((await chatRateLimit(request())).allowed, false);
    assert.equal(state.redisCalls, 3);
  }));
test("backend 429 forwards only safe retry delay", () =>
  fixture(async (state) => {
    state.backendStatus = 429;
    const result = await POST(request());
    assert.equal(result.status, 429);
    assert.equal(result.headers.get("Retry-After"), "17");
    assert.equal(result.headers.get("X-Internal"), null);
    assert.doesNotMatch(await result.text(), /private/);
    state.retry = "invalid";
    assert.equal((await POST(request())).headers.get("Retry-After"), "60");
  }));
test("Redis failure allows authenticated backend and logs only a fixed warning", () =>
  fixture(async (state) => {
    state.redisError = true;
    const result = await POST(request());
    assert.equal(result.status, 200);
    assert.equal(state.backendCalls, 1);
    assert.deepEqual(state.warnings, [
      "[tai] distributed_rate_limit_unavailable; using backend safety limit",
    ]);
    state.backendStatus = 429;
    assert.equal((await POST(request())).status, 429);
  }));
test("missing Redis configuration falls back to backend safety", () =>
  fixture(async (state) => {
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    assert.equal((await POST(request())).status, 200);
    assert.equal(state.redisCalls, 0);
    assert.equal(state.backendCalls, 1);
  }));
test("defaults reject invalid values; production requires trusted IP", () =>
  fixture(async (state) => {
    process.env.TAI_RATE_LIMIT_PER_MINUTE = "-1";
    process.env.TAI_RATE_LIMIT_PER_DAY = "nonsense";
    await chatRateLimit(request());
    assert.deepEqual(state.commands[0].slice(-4), [15, 60, 100, 86400]);
    assert.throws(() => chatLimitKeys(request("bad")));
    const local = { NODE_ENV: "development" };
    assert.deepEqual(
      chatLimitKeys(request(), local),
      chatLimitKeys(request("192.0.2.2"), local),
    );
    assert.throws(() => chatLimitKeys(request(), { NODE_ENV: "production" }));
    const trusted = {
      NODE_ENV: "production",
      TRUSTED_CLIENT_IP_HEADER: "x-real-ip",
    };
    const r = new Request("https://portfolio.example", {
      headers: { "x-real-ip": "192.0.2.3" },
    });
    assert.ok(chatLimitKeys(r, trusted)[0].startsWith("tai:ratelimit:minute:"));
  }));
test("minute and daily UI errors are friendly and never echo arbitrary server text", async () => {
  const original = globalThis.fetch;
  try {
    for (const [code, text] of [
      ["TAI_MINUTE_LIMIT", /temporary T AI message limit/],
      ["TAI_DAILY_LIMIT", /today's T AI message limit/],
      ["unknown", /Too many requests/],
    ]) {
      globalThis.fetch = async () =>
        Response.json(
          { code, error: "private infrastructure details" },
          { status: 429 },
        );
      await assert.rejects(
        streamChat(
          [{ role: "user", content: "Hello" }],
          new AbortController().signal,
          () => {},
        ),
        text,
      );
    }
  } finally {
    globalThis.fetch = original;
  }
});
