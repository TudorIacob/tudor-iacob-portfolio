import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { safeChatUrl } from "../lib/chat-links.ts";
const require = createRequire(import.meta.url);
const code = ts
  .transpileModule(
    await readFile(
      new URL("../components/tai/assistant-markdown.tsx", import.meta.url),
      "utf8",
    ),
    {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.ESNext,
      },
    },
  )
  .outputText.replaceAll(
    '"react/jsx-runtime"',
    JSON.stringify(pathToFileURL(require.resolve("react/jsx-runtime")).href),
  )
  .replaceAll(
    '"react-markdown"',
    JSON.stringify(pathToFileURL(require.resolve("react-markdown")).href),
  )
  .replaceAll(
    '"@/lib/chat-links"',
    JSON.stringify(new URL("../lib/chat-links.ts", import.meta.url).href),
  );
const { AssistantMarkdown } = await import(
  "data:text/javascript;base64," + Buffer.from(code).toString("base64")
);
const render = (content) =>
  renderToStaticMarkup(React.createElement(AssistantMarkdown, { content }));
test("assistant Markdown renders headings, emphasis, lists, code and safe links", () => {
  const html = render(
    "# Summary\n\n**Strong** and *emphasis* with `Python`.\n\n- First\n- Second\n\n```python\nprint(1)\n```\n\n[LinkedIn](https://www.linkedin.com/in/tudor-iacob/)",
  );
  for (const fragment of [
    "<h4>Summary</h4>",
    "<strong>Strong</strong>",
    "<em>emphasis</em>",
    "<ul>",
    "<pre",
    "<code",
    'rel="noopener noreferrer"',
    'target="_blank"',
  ])
    assert.ok(html.includes(fragment), fragment);
});
test("Markdown blocks raw HTML, scripts, images and unsafe URLs", () => {
  const html = render(
    '<script>alert(1)</script>\n\n[bad](javascript:alert%281%29) ![pixel](https://example.com/track)\n\n<iframe src="https://example.com"></iframe>',
  );
  assert.doesNotMatch(html, /<script|<iframe|<img|href="javascript/);
  for (const url of [
    "javascript:alert(1)",
    "data:text/html,hi",
    "//evil.test",
    "/\\evil.test",
    "https://user:pass@example.com",
    "file:///secret",
    "java\nscript:alert(1)",
  ])
    assert.equal(safeChatUrl(url), undefined);
  assert.equal(safeChatUrl("/#contact"), "/#contact");
  assert.equal(
    safeChatUrl("mailto:tudor@example.com"),
    "mailto:tudor@example.com",
  );
});

const portfolio = JSON.parse(
  await readFile(new URL("../data/portfolio.json", import.meta.url), "utf8"),
);
const projectCode = ts
  .transpileModule(
    await readFile(
      new URL("../components/tai/project-reference.tsx", import.meta.url),
      "utf8",
    ),
    {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.ESNext,
      },
    },
  )
  .outputText.replaceAll(
    '"react/jsx-runtime"',
    JSON.stringify(pathToFileURL(require.resolve("react/jsx-runtime")).href),
  )
  .replace(
    'import { ArrowUpRight } from "lucide-react";',
    "const ArrowUpRight = () => null;",
  )
  .replace(
    'import { projects } from "@/data/portfolio";',
    "const projects = " + JSON.stringify(portfolio.projects) + ";",
  );
const { ProjectReference } = await import(
  "data:text/javascript;base64," + Buffer.from(projectCode).toString("base64")
);
test("project cards use catalog metadata and prioritize the requested project", () => {
  const sources = [
    {
      id: "ai-document-analyst",
      title: "Untrusted replacement title",
      url: "/projects/ai-document-analyst",
    },
  ];
  const html = renderToStaticMarkup(
    React.createElement(ProjectReference, {
      sources,
      question: "Tell me about T AI.",
    }),
  );
  assert.match(html, /T AI — Personal RAG Assistant/);
  assert.match(html, /href="\/projects\/t-ai"/);
  assert.doesNotMatch(html, /Untrusted replacement title/);
  const absent = renderToStaticMarkup(
    React.createElement(ProjectReference, {
      sources: [{ id: "invented", url: "/projects/invented", title: "Fake" }],
      question: "Unknown project",
    }),
  );
  assert.equal(absent, "");
});
