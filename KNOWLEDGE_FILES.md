# Knowledge filename migration

All 11 knowledge files now use the standard Markdown extension, including the three project files. The 10 factual documents retain their original bytes, including line endings and YAML frontmatter. The README was also byte-verified during renaming, then only its four documentation filename references were updated.

## Pipeline and impact

1. `backend/ingestion/loaders.py` reads shared `data/portfolio.json` and explicitly allowlists `experience.md`, `education.md`, `projects/company-profiling-agent.md` and `projects/document-analyst.md`. It does not recursively ingest arbitrary Markdown files.
2. YAML is parsed with `safe_load`; title/category must be nonempty strings, public must be true, and the document body must exist. Reviewed project supplements merge into their corresponding JSON project instead of becoming duplicate documents. Other knowledge files remain reference material.
3. `chunking.py` preserves headings/paragraphs, bounds chunk lengths and hashes document ID, ordinal and text. Filename-derived IDs change for standalone supplemental documents; project IDs remain stable. Public citation URLs are unchanged.
4. `ingest.py` generates the existing 1536-dimensional embeddings, then calls the existing `replace_portfolio_index` RPC. Generation prompts, model configuration, retrieval settings and schema are unchanged.
5. Retrieval still uses `match_portfolio_chunks`. The API resolves citations from document metadata; the frontend accepts source IDs as opaque strings, so the renamed IDs require no API change. Previously displayed citations still navigate to the same public URLs.

## Safe replacement

Reviewed migrations 001–003 and the vector-store adapter before replacing the index. The SQL replacement takes an advisory transaction lock and performs delete/insert within one transaction; SQL errors roll back the operation. The ingestion pipeline refuses empty content and completes all embeddings before invoking replacement. No separate delete, schema migration or append-only indexing was performed.

Captured the existing 23 public rows and three query/retrieval baselines before replacement. After the normal ingestion command completed, all 23 stored IDs, chunk contents and source metadata matched freshly prepared records. Four chunk IDs changed. No stale or duplicate records remained.

## Validation

- All factual file hashes unchanged; all 19 document bodies and 23 chunk texts match the baseline.
- Frontmatter, public-only loading, explicit discovery and source-path regression tests: included in 180 passing backend tests.
- Python compilation passed; ingestion dry-run and live replacement both succeeded.
- 13 frontend stream, source, action and rendering tests passed.
- Live retrieval returned exactly the same ranked chunk content and public URLs before and after migration for English current-work, Romanian PFA-services and Company/UAT project queries. Only filename metadata changed.
- No frontend application code changed, so a new frontend production build was not required for this migration. No new LLM generation calls were needed to compare retrieval.

`backend/tests/live_knowledge_migration.py` provides opt-in live before/after verification. Its before mode saves only public index data and query embeddings under ignored `artifacts/`; credentials are never serialized. Migration-specific baseline files are also ignored. Historical extension names in that verification script are intentional assertions against stale metadata, not loader dependencies.

Updated references in the loader, repository README, knowledge README, local setup notes and production audit. No application code depends on the previous extension. Existing private/unreviewed reference files were not added to ingestion. The existing Starlette/httpx deprecation warning is unrelated to this migration.
