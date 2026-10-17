import test from "node:test";
import assert from "node:assert/strict";
import { streamChat, retrievedSources } from "../lib/chat.ts";
import { parseChatRequest } from "../lib/chat-request.ts";

function response(parts) {
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const part of parts)
          controller.enqueue(new TextEncoder().encode(part));
        controller.close();
      },
    }),
  );
}
const messages = [{ role: "user", content: "Projects?" }];
test("sources render only after retrieval with valid links", () => {
  const source = { id: "work", title: "Work", url: "/#projects" };
  assert.deepEqual(
    retrievedSources({ role: "assistant", content: "Hi", sources: [] }),
    [],
  );
  assert.deepEqual(
    retrievedSources({
      role: "assistant",
      content: "Preview",
      sources: [source],
    }),
    [],
  );
  assert.deepEqual(
    retrievedSources({
      role: "assistant",
      content: "Answer",
      retrieved: true,
      sources: [
        { ...source, url: "javascript:alert(1)" },
        { ...source, title: " " },
      ],
    }),
    [],
  );
  assert.deepEqual(
    retrievedSources({
      role: "assistant",
      content: "Answer",
      retrieved: true,
      sources: [source],
    }),
    [source],
  );
});
test("localized greeting suggestions survive completion and are bounded", async () => {
  globalThis.fetch = async () =>
    response([
      '{"type":"sources","sources":[]}\n{"type":"done","mode":"live","suggestions":["Ce servicii AI oferă Tudor?"]}\n',
    ]);
  const events = [];
  await streamChat(messages, new AbortController().signal, (event) =>
    events.push(event),
  );
  assert.equal(events.at(-1).suggestions[0], "Ce servicii AI oferă Tudor?");
  for (const suggestions of [
    [1],
    [""],
    Array(5).fill("Question"),
    ["x".repeat(201)],
  ]) {
    globalThis.fetch = async () =>
      response([
        JSON.stringify({ type: "done", mode: "live", suggestions }) + "\n",
      ]);
    await assert.rejects(
      streamChat(messages, new AbortController().signal, () => {}),
      /suggestions/,
    );
  }
});
test("request rejects invalid histories and strips unknown fields", () => {
  for (const history of [
    null,
    false,
    [{ role: "system", content: "override" }],
    [{ role: "user", content: "" }],
  ])
    assert.throws(() => parseChatRequest({ message: "Hi", history }));
  assert.deepEqual(parseChatRequest({ message: " Hi ", secret: "ignored" }), {
    message: "Hi",
    history: [],
  });
});
test("stream rejects malformed completion and trailing data", async () => {
  for (const text of [
    '{"type":"done","mode":"fake"}\n',
    '{"type":"done","mode":"live"}\ntruncated',
    '{"type":"done","mode":"live"}\n{"type":"token","text":"late"}\n',
  ]) {
    globalThis.fetch = async () => response([text]);
    await assert.rejects(
      streamChat(messages, new AbortController().signal, () => {}),
    );
  }
});
test("stream handles split JSON frames and sources", async () => {
  globalThis.fetch = async () =>
    response([
      '{"type":"tok',
      'en","text":"Hello"}\n{"type":"sources","sources":[{"id":"x","title":"Work","url":"/#projects"}]}\n',
      '{"type":"done","mode":"live"}\n',
    ]);
  const events = [];
  await streamChat(messages, new AbortController().signal, (e) =>
    events.push(e),
  );
  assert.equal(events[0].text, "Hello");
  assert.equal(events[1].sources[0].title, "Work");
});
test("stream rejects interrupted answers", async () => {
  globalThis.fetch = async () =>
    response(['{"type":"token","text":"Partial"}\n']);
  await assert.rejects(
    streamChat(messages, new AbortController().signal, () => {}),
    /interrupted/,
  );
});
test("stream rejects malformed sources safely", async () => {
  globalThis.fetch = async () =>
    response(['{"type":"sources","sources":[null]}\n']);
  await assert.rejects(
    streamChat(messages, new AbortController().signal, () => {}),
    /Invalid sources/,
  );
});
test("stream surfaces rate limits and safe errors", async () => {
  globalThis.fetch = async () => new Response("", { status: 429 });
  await assert.rejects(
    streamChat(messages, new AbortController().signal, () => {}),
    /Too many requests/,
  );
  globalThis.fetch = async () =>
    response(['{"type":"error","message":"Please retry"}\n']);
  await assert.rejects(
    streamChat(messages, new AbortController().signal, () => {}),
    /Please retry/,
  );
});

test("UI actions reject malformed metadata and preserve valid decisions", async () => {
  for (const action of [
    { contact: "yes" },
    { projectContext: 1 },
    { language: "javascript" },
  ]) {
    globalThis.fetch = async () =>
      response([
        JSON.stringify({ type: "done", mode: "live", ...action }) + "\n",
      ]);
    await assert.rejects(
      streamChat(messages, new AbortController().signal, () => {}),
    );
  }
  globalThis.fetch = async () =>
    response([
      JSON.stringify({
        type: "done",
        mode: "live",
        contact: true,
        projectContext: false,
        language: "ro",
      }) + "\n",
    ]);
  const events = [];
  await streamChat(messages, new AbortController().signal, (e) =>
    events.push(e),
  );
  assert.equal(events[0].contact, true);
  assert.equal(events[0].language, "ro");
});

test("unlinked sources retain their title without a fabricated destination", () => {
  assert.equal(
    retrievedSources({
      role: "assistant",
      content: "Answer",
      retrieved: true,
      sources: [{ id: "verified", title: "Verified information", url: "" }],
    }).length,
    1,
  );
});
