# T AI generation migration — 15 October 2026

## Scope and inspection

Previous generation: `gpt-4.1-mini`, configured in `Settings`, `backend/.env`,
`backend/.env.example` and the README. The provider used `/v1/chat/completions`
with `messages`, `stream=true`, `temperature=0.2` and `max_tokens=800`. It extracted
`choices[].delta.content`, required `[DONE]`, and yielded strings to `RAGPipeline`.
The pipeline wraps those strings as NDJSON `token` events alongside `sources` and
`done` with `mode: live`. FastAPI sanitizes failures into `error` events, which the
Next.js gateway forwards. No OpenAI formats are exposed to browser code.

## Final implementation

- Default and local generation model: `gpt-6-luna`, still configurable through `LLM_MODEL`.
- Endpoint: `POST /v1/responses`, confined to the existing provider abstraction.
- Parameters: `input` replaces `messages`; `max_output_tokens=800` replaces `max_tokens`.
  `stream=true`, `store=false`, and `reasoning.effort=none` are explicit.
  `temperature` is omitted; no `top_p`, response-format or log-probability parameters are sent.
- `LLM_REASONING_EFFORT` accepts `none` (default) or `low`. No increase was needed.
- The adapter handles bounded SSE frames, split UTF-8/network chunks, text/refusal
  deltas and successful `response.completed` events. It rejects failed, incomplete,
  malformed, oversized, interrupted and empty responses. Reasoning/metadata events
  are not sent to visitors. There is no alternate-model fallback or silent retry.
- Invalid local model names fail validation. Provider HTTP failures (including
  authentication, model access and rate limits) and timeouts use existing safe errors.
- Prompts, conversational routing, retrieval parameters, source mapping and the
  frontend NDJSON contract were preserved.
- Embeddings remain `text-embedding-3-small`, 1536 dimensions, using `/v1/embeddings`.
  No database schema, stored vectors, ingestion code or knowledge documents changed.
- Only `LLM_MODEL` changed in the local environment file; all other entries were
  compared before/after and preserved. No credentials were added to documentation.

Official references:
[GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna),
[migration parameters](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-6-astra),
[Responses streaming](https://developers.openai.com/api/docs/guides/streaming-responses).
Luna supports reasoning effort `none`. Sampling parameters are unsupported when
reasoning is enabled; omitting them also keeps the optional `low` setting compatible.

## Validation

- Backend: 136 tests passed (`python -m pytest -q -p no:cacheprovider`).
- Python: `compileall` passed for app, ingestion and tests.
- Frontend: lint, TypeScript, six chat protocol tests and production build passed.
- A sandbox filesystem restriction blocked the first production build; the subsequent
  build with filesystem permission passed. The existing Starlette/httpx deprecation
  warning remains; dependency migration was outside this task.
- Live minimal generation probe completed successfully using the target model and
  `none` reasoning, producing two text deltas.
- The live acceptance runner completed 18 website conversations and one direct
  empty-retrieval case. All completed with the expected live stream contract.

### Requested RAG checks (one local run)

| Question | First text | Completion | Text deltas | Sources |
| --- | ---: | ---: | ---: | ---: |
| What projects has Tudor worked on? | 3.90 s | 5.23 s | 106 | 4 |
| Tell me about the Company & UAT Profiling Agent. | 3.29 s | 4.38 s | 85 | 4 |
| What technologies does Tudor work with? | 2.63 s | 3.56 s | 84 | 4 |
| What AI services does Tudor offer? | 1.28 s | 2.56 s | 83 | 4 |

Project, technology and service answers were concise and tied to retrieved portfolio
content. Project details about PDF reports and solar scoring were checked against
the retrieved chunks. The index was not rebuilt during that model migration;
subsequent content updates have replaced the index separately.
The broad services query retrieved project/profile context rather than the full
service catalogue, so its answer was a limited overview. Retrieval tuning is a
separate improvement, not a generation-model migration requirement.

### Conversation and grounding review

- Hello, Salut and Thanks returned natural, source-free social replies.
- Google employment was not claimed. No number of machine-learning engineering
  years was invented.
- Romanian clinic inquiries remained Romanian, preserved appointment/CRM context,
  and switched to English on request. French portfolio answers remained French.
- The empty-retrieval clinic answer proposed hypothetical capabilities without
  attributing undocumented experience to Tudor.
- Sources identify the retrieved evidence, not independently verified per-claim
  attribution. Prompt safeguards and sample evaluations cannot guarantee all outputs.

No new old-model baseline was run. Compared qualitatively with the earlier recorded
clinic checks, these samples followed conditional wording and grounding constraints
without prompt changes. The timings are observations, not a controlled speed/cost
comparison. Reasoning remains `none`.

## Files changed

- `backend/app/core/config.py`
- `backend/app/services/providers.py`
- `backend/.env.example`
- `backend/.env` (ignored local configuration, model entry only)
- `backend/tests/test_adapters.py`
- `backend/tests/test_responses.py` (new)
- `backend/tests/live_conversation_eval.py`
- `README.md`
- `MODEL_MIGRATION.md` (new)

Repository search found no active GPT-4.1 references. Only historical records in
`PRODUCTION_AUDIT.md` and this migration report retain the old model name. Dependencies,
generated build output, bytecode and inaccessible pytest caches were excluded from
the source/configuration scan; local environment files were included without printing values.
