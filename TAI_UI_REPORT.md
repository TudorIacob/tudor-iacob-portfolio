# T AI interface upgrade

## Initial findings

The installed application uses Next.js 16.3.8, React 19, TypeScript, Lucide icons and existing global/component CSS. Next.js proxies authenticated NDJSON requests to FastAPI. GPT-6 Luna Responses streaming, embedding calls and Supabase/pgvector retrieval remain in their existing provider interfaces. Shared portfolio JSON and selected public Markdown documents supply facts. History is bounded and untrusted; scope routing precedes retrieval.

Assistant messages previously rendered Markdown literally. The user label appeared twice. Welcome and active transcript heights differed, creating layout shifts; there was no return-to-latest control. Source links occupied prominent chips. The input was single-line, and the permanent contact link was unrelated to conversation intent.

## Changes

- Assistant-only CommonMark paragraphs, headings, lists, emphasis, links and fenced code via react-markdown. No raw HTML, remote images or unsafe URL protocols. HTTPS links open with noopener/noreferrer. User text is unchanged. Renderer guidance: [react-markdown documentation](https://github.com/remarkjs/react-markdown).
- Stable transcript sizing using dynamic viewport units; separate non-overlapping toolbar/composer; intentional upward scrolling disables automatic following. A return-to-latest control appears when needed.
- 15px conversational text, comfortable line height, distinct right-aligned user bubbles, wrapping links and scrollable code blocks.
- Compact native Sources disclosure; internal links retain source titles. Missing/unsafe targets become plain titles rather than invented About links.
- Powered by RAG describes architecture, with an explanatory tooltip; no connection-health claim. Preview remains identified separately.
- Four initial suggestions use the existing send flow; backend greeting suggestions retain English/Romanian localization. Initial surrounding UI remains English, consistent with the site.
- Multiline textarea supports Enter, Shift+Enter and IME composition; drafts remain editable during generation, duplicate sends are guarded, and submission restores input focus.
- Copy uses rendered textual content, with success or failure feedback. A screen-reader status announces preparation; no fabricated processing stages. Motion respects reduced-motion preferences.
- One compact project card appears only on completed project-context responses with retrieval evidence. It uses the public catalog: explicit project names/slugs in visitor input take precedence; otherwise a known retrieved project ID and URL must match. No project metadata is parsed from generated prose. The card is a portfolio reference, not an additional retrieval citation.
- A contact action appears at most once per conversation after a validated scope decision indicates collaboration intent. It opens the existing Contact anchor only on user action. No conversation is submitted externally by this action.
- Existing monogram retained. Under the Hood explains the actual retrieval/context/generation/streaming path and notes that social and unrelated messages skip it.

## Important files

- `components/tai/assistant-markdown.tsx`, `lib/chat-links.ts`: rendering and URL safety.
- `components/tai/chat-message.tsx`: message layout, citations, copy, suggestions and actions.
- `components/tai/project-reference.tsx`: existing catalog-based project cards.
- `components/tai/tai-chat.tsx`: streaming metadata, scrolling, reset and one-time contact display.
- `components/tai/chat-input.tsx`: multiline input, composition handling and resizing.
- `components/tai/tai-design.css`: scoped typography, layout and responsive refinements.
- `components/sections/tai-section.tsx`: suggestion prompts and architecture explanation.
- `lib/chat.ts`: strict additive action metadata validation and unlinked sources.
- `backend/app/rag/intent.py`, `scope.py`, `pipeline.py`: optional validated contact intent and completion metadata; no retrieval, model or schema change.
- `backend/tests/test_scope.py`, `test_rag.py`, `test_responses.py`: action safety, unlinked sources and expanded completion assertions.
- `scripts/test-chat.mjs`, `scripts/test-markdown.mjs`: stream/action validation, Markdown/XSS tests and catalog card matching.
- `package.json`, `pnpm-lock.yaml`: react-markdown dependency and test command.
- `README.md`, this report: updated behavior and validation notes.

## Contract and compatibility

Live `done` events may include `contact` and `projectContext` booleans and `language` (`en` or `ro`). They are optional, and missing fields default to no UI action. No model-generated URL is accepted for actions. The existing semantic classifier can return an optional boolean `contact`; non-boolean values do not authorize a CTA. Additional classification is limited to candidate collaboration/contact requests; ordinary explicit service overviews still avoid classification. Scope redirects cannot enable a contact action.

Source URLs may now be empty strings when no safe target exists. Deploy backend/frontend together for this case: older clients reject empty source URLs. Existing indexed public documents already have valid targets. No database migration or re-indexing was needed.

## Validation

- 176 backend tests passed; existing Starlette/httpx deprecation warning remains.
- 13 frontend tests passed, including actual server-rendered Markdown and project components.
- ESLint, TypeScript and production build passed.
- Browser: initial project suggestion submits once through the normal flow; English response streams and Sources expands. Romanian business inquiry returns Romanian text and one localized contact action.
- Browser: multiline entry, reset, and return-to-latest verified. Reset prevents stale responses from repopulating the transcript.
- Browser geometry at 320, 375, 768, 1024, 1440 and 1920px: no document horizontal overflow or header/transcript overlap.
- Automated tests cover malformed/interrupted/error streams and rate-limit messages; rendering security tests cover HTML, scripts, images, unsafe URLs and long-form Markdown structures.

## Limitations and recommendations

Native mobile keyboards and assistive-technology announcements need testing on real devices. Clipboard write permission varies by browser; the button handles rejection, but OS clipboard contents were not independently verified. Network-error behavior was tested with mocks, not by disrupting live providers. Contextual intent remains probabilistic. Project cards resolve exact catalog names/slugs or retrieved IDs; unusual paraphrases may simply show the ordinary answer. Sources identify retrieved documents, not independent claim-by-claim verification.

The initial interface is English; multilingual answers, greeting suggestions and contact labels preserve existing language behavior. Consider a small explicit language selector only if full interface localization is required. Check production asset sizes over time; Markdown adds a client dependency. No production deployment, credentials, embedding settings, schema, model adapter or knowledge content was changed.
