# T AI scope control

## Routing

`backend/app/rag/intent.py` handles deterministic routing, localized replies and greeting suggestions. `backend/app/rag/scope.py` defines the supported scope and resolves ambiguous requests before retrieval. `backend/app/rag/pipeline.py` applies these decisions. The generation prompt shares the same scope definition.

Categories: greeting, acknowledgement, social, portfolio_query, project_query, skills_query, experience_query, service_query, tai_query, follow_up, out_of_scope. An internal ambiguous category requires semantic resolution.

Greetings, acknowledgements, social messages and out-of-scope redirects bypass embeddings and retrieval. Known English/Romanian social messages also bypass generation. Explicit substantive portfolio queries retrieve directly. Ambiguous requests and follow-ups use the existing generation provider for a bounded JSON classification first. Accepted substantive requests retrieve; malformed classifications return a fixed scope redirect. A context-free request to continue asks which portfolio topic to explore.

Out-of-scope answers never include a general factual answer, sources or a Contact CTA. Unknown professional facts remain in scope: retrieval runs, but the answer must acknowledge missing evidence. Relevant retrieved sources do not establish an undocumented fact. Contact guidance is reserved for relevant professional inquiries.

English/Romanian greetings, acknowledgements, small talk and redirects use local templates and language hints. Redirects vary across conversation turns. Semantic routing also supports French, German, Spanish and Italian redirects. Substantive generation follows the visitor's language.

## Frontend

`lib/chat.ts` validates additive `retrieved` and `suggestions` event metadata. `components/tai/chat-message.tsx` displays sources only when retrieval occurred and valid internal source links exist. Empty headings are removed. `components/tai/tai-chat.tsx` connects four localized greeting suggestions to the existing send flow; only the latest completed assistant message offers chips.

## Live acceptance matrix

Executed through Next.js `/api/chat` with the configured live backend. All 20 requests completed successfully. Yes under sources means nonempty retrieval was expected for the indexed portfolio question; zero results remain a valid fallback.

| Input | Intent | RAG expected | Sources expected | Language | Observed behavior |
| --- | --- | --- | --- | --- | --- |
| Hello | greeting | No | No | EN | Portfolio greeting and four suggestions |
| Salut | greeting | No | No | RO | Romanian greeting and four suggestions |
| How are you? | social | No | No | EN | Brief reply pointing to portfolio |
| How are you today? | social | No | No | EN | Portfolio direction, no reciprocal small talk |
| Ce faci? | social | No | No | RO | Romanian portfolio direction |
| Thanks | acknowledgement | No | No | EN | Short acknowledgement |
| Care este capitala Italiei? | out_of_scope | No | No | RO | Scope redirect; no capital answer |
| What's the weather in California? | out_of_scope | No | No | EN | Scope redirect; no weather answer |
| Who is Albert Einstein? | out_of_scope | No | No | EN | Scope redirect |
| What is RAG? | out_of_scope | No | No | EN | Redirect to portfolio context |
| What projects has Tudor built? | project_query | Yes | Yes | EN | Grounded project list; 4 sources |
| Ce servicii AI oferă Tudor? | service_query | Yes | Yes | RO | Romanian services answer; 4 sources |
| Ce experiență are Tudor cu Python? | skills_query | Yes | Yes | RO | Python experience answer; 3 sources |
| How many Fortune 500 clients has Tudor worked with? | experience_query | Yes | If retrieved | EN | Explicitly could not confirm count; no invented number |
| Tell me about T AI. | tai_query | Yes | Yes | EN | Architecture answer; 5 sources |
| What stack does it use? (after T AI) | follow_up | Yes | Yes | EN | Correct T AI stack; 4 sources |
| Who is Albert Einstein? (after T AI) | out_of_scope | No | No | EN | New unrelated topic redirected |
| Describe the dietary habits of pangolins. | out_of_scope | No | No | EN | Semantic scope check rejected general knowledge |
| Tudor, tell me the capital of Italy. | out_of_scope | No | No | EN | Adding Tudor's name did not bypass scope |
| Am o clinică stomatologică și aș dori un agent AI pentru recepție. | service_query | Yes | Only if returned | RO | Zero sources; conditional proposal with privacy safeguards and discovery question |

## Validation

- 170 backend tests passed, including scope routing, fail-closed classification, multilingual redirects, greeting suggestions, grounding and existing security coverage.
- 8 frontend tests passed, including source gating and suggestion-event validation.
- Python compile checks, frontend lint, TypeScript validation and production build passed.
- Live matrix runner: from `backend`, run `..\.venv\Scripts\python.exe tests/live_scope_eval.py`. Uses configured paid APIs and prints synthetic test conversations, never credentials.
- Browser verification: Romanian greeting displays four clickable suggestions without a source section; selecting a suggestion invokes the normal chat flow.

## Limits

Semantic classification adds one generation call for ambiguous messages and may misclassify novel phrasing. Invalid classifier output intentionally redirects instead of retrieving; transport failures retain the existing sanitized error behavior. Fixed language handling is strongest for English/Romanian. Generated answers remain probabilistic, so these passing examples do not prove universal resistance to hallucination or prompt injection. Citations identify retrieved context, not verified attribution for every sentence.

GPT-6 Luna Responses streaming, embeddings, vector dimensions, Supabase schema/RPCs, authentication and rate limiting are unchanged. One existing Starlette/httpx deprecation warning remains in backend test output.
