import test from "node:test";
import assert from "node:assert/strict";
import { Resend } from "resend";
import { contactProviderFailure } from "../lib/contact-diagnostics.ts";
import { load } from "./load-ts.mjs";
const { contactLimitKeys, contactRateLimit } = await load(
  "../lib/contact-rate-limit.ts",
);
const { handleContact, contactConfig } = await load(
  "../lib/contact-handler.ts",
);
const { readJson } = await load("../lib/server.ts");
const config = {
  apiKey: "test-only",
  from: "portfolio@example.com",
  to: "owner@example.com",
};
const valid = {
  name: " Jane ",
  email: "jane@example.com",
  message: "Discuss an automation project.",
};
const requestId = "291f395b-ff3f-43f9-bbf0-ad6045552ba8";
function request(body = valid, headers = {}, method = "POST") {
  return new Request("https://portfolio.example/api/contact", {
    method,
    headers: {
      origin: "https://portfolio.example",
      "content-type": "application/json",
      "idempotency-key": requestId,
      ...headers,
    },
    ...(method === "POST"
      ? { body: typeof body === "string" ? body : JSON.stringify(body) }
      : {}),
  });
}
function deps(overrides = {}) {
  return {
    config,
    readJson,
    rateLimit: async () => ({ allowed: true, retryAfter: 0 }),
    send: async () => true,
    ...overrides,
  };
}
test("successful SDK send uses fixed sender, replyTo, plain text and idempotency", async () => {
  const originalFetch = globalThis.fetch;
  const sent = [];
  globalThis.fetch = async (url, options) => {
    assert.equal(String(url), "https://api.resend.com/emails");
    sent.push({
      body: JSON.parse(options.body),
      key: new Headers(options.headers).get("idempotency-key"),
    });
    return Response.json({ id: "mock-email" });
  };
  try {
    const send = async (email, idempotencyKey) => {
      const { data, error } = await new Resend("mock-key").emails.send(email, {
        idempotencyKey,
      });
      return !error && !!data?.id;
    };
    for (let i = 0; i < 2; i++)
      assert.equal(
        (await handleContact(request(), deps({ send }))).status,
        200,
      );
    assert.equal(sent[0].body.from, config.from);
    assert.equal(sent[0].body.reply_to, valid.email);
    assert.match(sent[0].body.text, /Company: Not provided/);
    assert.equal(sent[0].body.html, undefined);
    assert.equal(sent[0].key, sent[1].key);
    assert.match(sent[0].body.subject, /— Jane$/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
for (const [name, data] of Object.entries({
  "invalid email": { ...valid, email: "bad" },
  "missing name": { email: valid.email, message: valid.message },
  "empty message": { ...valid, message: " " },
  "long name": { ...valid, name: "a".repeat(101) },
  "long email": { ...valid, email: "a".repeat(250) + "@example.com" },
  "long company": { ...valid, company: "a".repeat(151) },
  "long message": { ...valid, message: "a".repeat(5001) },
  honeypot: { ...valid, website: "spam" },
  "header injection": { ...valid, name: "Jane\r\nBcc: other@example.com" },
  "unknown fields": { ...valid, to: "attacker@example.com" },
}))
  test(`rejects ${name} without sending`, async () => {
    let sent = false;
    const response = await handleContact(
      request(data),
      deps({
        send: async () => {
          sent = true;
          return true;
        },
      }),
    );
    assert.equal(response.status, 400);
    assert.equal(sent, false);
    assert.equal((await response.json()).ok, false);
  });
test("rejects oversized streamed body, declared size, and malformed JSON", async () => {
  for (const req of [
    request(" ".repeat(16001)),
    request(valid, { "content-length": "16001" }),
  ])
    assert.equal((await handleContact(req, deps())).status, 413);
  assert.equal((await handleContact(request("{"), deps())).status, 400);
});
test("rejects unsupported method, content type, foreign/missing origin and bad request ID", async () => {
  for (const [req, status] of [
    [request(valid, {}, "GET"), 405],
    [request(valid, { "content-type": "text/plain" }), 415],
    [request(valid, { origin: "https://evil.example" }), 403],
    [request(valid, { origin: "" }), 403],
    [request(valid, { "idempotency-key": "bad" }), 400],
  ])
    assert.equal((await handleContact(req, deps())).status, status);
});
test("throttling, missing config and limiter failure never send", async () => {
  const send = async () => {
    assert.fail("must not send");
  };
  const response = await handleContact(
    request(),
    deps({
      send,
      rateLimit: async () => ({ allowed: false, retryAfter: 600 }),
    }),
  );
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "600");
  assert.equal(
    (await handleContact(request(), deps({ send, config: null }))).status,
    503,
  );
  assert.equal(
    (
      await handleContact(
        request(),
        deps({
          send,
          rateLimit: async () => {
            throw Error("private");
          },
        }),
      )
    ).status,
    503,
  );
  assert.equal(contactConfig({}), null);
  assert.equal(
    contactConfig({
      RESEND_API_KEY: "test",
      CONTACT_EMAIL_FROM: "invalid",
      CONTACT_EMAIL_TO: "owner@example.com",
    }),
    null,
  );
});
test("provider failures are safe and include no sensitive details", async () => {
  for (const send of [
    async () => false,
    async () => {
      throw Error("secret provider error");
    },
  ]) {
    const response = await handleContact(request(), deps({ send }));
    assert.equal(response.status, 502);
    assert.doesNotMatch(await response.text(), /secret|provider/);
  }
});
test("rate keys ignore spoofed IP headers locally; Redis fails closed", async () => {
  const a = request(valid, { "x-vercel-forwarded-for": "192.0.2.1" });
  const b = request(valid, { "x-vercel-forwarded-for": "192.0.2.2" });
  assert.deepEqual(contactLimitKeys(a, false), contactLimitKeys(b, false));
  assert.notDeepEqual(contactLimitKeys(a, true), contactLimitKeys(b, true));
  const previous = process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_URL;
  try {
    await assert.rejects(contactRateLimit(a));
  } finally {
    if (previous) process.env.UPSTASH_REDIS_REST_URL = previous;
  }
});

test("form validates accessibly, blocks double submit, retains failure values and resets success", async () => {
  const { JSDOM } = await import("jsdom");
  const dom = new JSDOM('<div id="root"></div>', {
    url: "https://portfolio.example",
  });
  const names = [
    "window",
    "document",
    "HTMLElement",
    "FormData",
    "IS_REACT_ACT_ENVIRONMENT",
  ];
  const previous = Object.fromEntries(
    names.map((name) => [
      name,
      Object.getOwnPropertyDescriptor(globalThis, name),
    ]),
  );
  for (const name of names)
    Object.defineProperty(globalThis, name, {
      value: name === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[name],
      configurable: true,
      writable: true,
    });
  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { ContactForm } = await load("../components/contact-form.tsx");
  const root = createRoot(document.getElementById("root"));
  const originalFetch = globalThis.fetch;
  try {
    await React.act(async () => root.render(React.createElement(ContactForm)));
    const form = document.querySelector("form");
    const submit = () =>
      form.dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      );
    await React.act(async () => submit());
    assert.equal(document.activeElement.name, "name");
    assert.equal(form.elements.name.getAttribute("aria-invalid"), "true");
    assert.ok(
      document.getElementById(
        form.elements.name.getAttribute("aria-describedby"),
      ),
    );
    assert.match(
      document.querySelector('[role="alert"]').textContent,
      /highlighted/,
    );
    for (const [key, value] of Object.entries(valid))
      form.elements[key].value = value;
    let resolve;
    let calls = 0;
    const keys = [];
    globalThis.fetch = async (_, options) => {
      calls++;
      keys.push(options.headers["Idempotency-Key"]);
      return new Promise((r) => {
        resolve = r;
      });
    };
    await React.act(async () => {
      submit();
      submit();
    });
    assert.equal(calls, 1);
    assert.equal(document.querySelector("button").disabled, true);
    assert.match(document.querySelector("button").textContent, /Sending\.\.\./);
    await React.act(async () =>
      resolve(Response.json({ ok: false }, { status: 502 })),
    );
    assert.equal(form.elements.email.value, valid.email);
    assert.match(
      document.querySelector('[role="alert"]').textContent,
      /Something went wrong/,
    );
    await React.act(async () => submit());
    assert.equal(keys[0], keys[1]);
    await React.act(async () =>
      resolve(
        Response.json(
          { ok: false },
          { status: 429, headers: { "Retry-After": "600" } },
        ),
      ),
    );
    assert.match(
      document.querySelector('[role="alert"]').textContent,
      /try again in 10 minutes/,
    );
    assert.equal(form.elements.email.value, valid.email);
    assert.equal(document.querySelector("button").disabled, false);
    await React.act(async () => submit());
    assert.equal(keys[0], keys[2]);
    await React.act(async () => resolve(Response.json({ ok: true })));
    assert.equal(form.elements.email.value, "");
    assert.equal(form.getAttribute("aria-hidden"), "true");
    assert.ok(form.hasAttribute("inert"));
    const success = document.querySelector(".contact-success");
    assert.equal(success.getAttribute("aria-hidden"), "false");
    assert.equal(success.hasAttribute("inert"), false);
    assert.equal(document.activeElement.textContent, "Message received.");
    assert.match(
      document.getElementById(
        document.activeElement.getAttribute("aria-describedby"),
      ).textContent,
      /Thanks for getting in touch/,
    );
    assert.equal(document.querySelector('[role="status"]'), null);
    const reset = success.querySelector("button");
    assert.match(reset.textContent, /Send another message/);
    await React.act(async () => reset.click());
    assert.equal(form.getAttribute("aria-hidden"), "false");
    assert.equal(form.hasAttribute("inert"), false);
    assert.ok(success.hasAttribute("inert"));
    assert.equal(document.activeElement, form.elements.name);
    for (const name of ["name", "email", "company", "message"])
      assert.equal(form.elements[name].value, "");
    assert.equal(document.querySelector("button").disabled, false);
  } finally {
    await React.act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    dom.window.close();
    for (const name of names) {
      if (previous[name])
        Object.defineProperty(globalThis, name, previous[name]);
      else delete globalThis[name];
    }
  }
});

test("provider diagnostics use fixed codes without private error details", () => {
  for (const [error, expected] of [
    [
      {
        message:
          "You can only send testing emails to your own email address (private@example.com).",
      },
      "resend_test_recipient_restricted",
    ],
    [
      { message: "The private.example domain is not verified." },
      "resend_sender_domain_unverified",
    ],
    [{ message: "API key is invalid: secret-value" }, "resend_invalid_api_key"],
    [{ name: "restricted_api_key" }, "resend_key_permissions"],
    [{ name: "rate_limit_exceeded" }, "resend_quota_or_rate_limit"],
    [{ name: "TimeoutError" }, "resend_timeout"],
    [
      { name: "private@example.com", message: "secret-value" },
      "provider_unavailable",
    ],
    [null, "provider_unavailable"],
  ])
    assert.equal(contactProviderFailure(error), expected);
});

test("Redis adapter executes shared atomic limits and validates responses", async () => {
  const originalFetch = globalThis.fetch;
  const names = ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"];
  const previous = names.map((name) => process.env[name]);
  process.env.UPSTASH_REDIS_REST_URL = "https://redis.example";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-only";
  try {
    for (const result of [0, 120, "unexpected"]) {
      globalThis.fetch = async (_, options) => {
        const [command] = JSON.parse(options.body);
        assert.equal(command[0], "eval");
        assert.match(command[1], /redis.call\('INCR'/);
        assert.match(command[1], /redis.call\('EXPIRE'/);
        assert.deepEqual(command.slice(-4), [5, 600, 100, 3600]);
        return Response.json([{ result }]);
      };
      if (typeof result === "number")
        assert.deepEqual(await contactRateLimit(request()), {
          allowed: result === 0,
          retryAfter: result,
        });
      else await assert.rejects(contactRateLimit(request()));
    }
  } finally {
    globalThis.fetch = originalFetch;
    names.forEach((name, index) => {
      if (previous[index] === undefined) delete process.env[name];
      else process.env[name] = previous[index];
    });
  }
});
