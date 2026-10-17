# Local live-mode setup — verified 3 October 2026

> Superseded in part by `PRODUCTION_AUDIT.md` (6 October): the revised index now has 23 chunks from 20 documents, broad overview retrieval is improved, and migration 003 is prepared but pending Dashboard application. The historical results below describe the original local setup.

## Current status

- `backend/.env` contains the configured provider credentials and `MODE=live`.
- `.env.local` points to `http://127.0.0.1:8000`; `SITE_URL` is `http://localhost:3000`.
- Both files have the same generated `BACKEND_API_KEY`, verified without printing it.
- Git ignore rules exclude `.env`, `.env.local`, and `backend/.env`, while allowing both `.env.example` files. This folder has no Git metadata; the rules were verified using a temporary Git metadata directory.
- Supabase uses `SUPABASE_SECRET_KEY` in `apikey` only. No Supabase secret is used as a Bearer token.

## Database and ingestion

The user confirmed migrations 001 and 002 applied successfully in the Supabase Dashboard. The initial replacement attempt had failed because the database requires a WHERE clause on DELETE. Migration `002_safe_index_replacement.sql` supplies an explicit non-null primary-key predicate without changing the schema, vector dimensions, RLS, grants or retrieval RPC.

The previously generated OpenAI embeddings were submitted to `replace_portfolio_index` after migration 002. All **21 stored chunk IDs and contents** matched the prepared batch on readback. Retrieval through `match_portfolio_chunks` also succeeded. No further Dashboard action is required for these local tests.

## Knowledge-base findings

- Ten public knowledge documents have valid YAML front matter and nonempty bodies; the knowledge README is an instruction file rather than a document to index.
- Filenames ending in `.md` are intentional in the current loader. Ingestion reads four explicitly allowlisted supplemental files: experience, education, company-profiling-agent and document-analyst.
- Other supplied reference documents are superseded by shared `data/portfolio.json`, rather than automatically globbed into the index. The T AI project is loaded from that JSON. New Markdown files must be added to the loader deliberately.
- All three supplied project reference files exist. No missing or malformed knowledge files were found.
- `knowledge/certifications.md` still contains two `[ADD CREDENTIAL URL]` placeholders. This reference file is not indexed. Shared credentials have null URLs and a pending status.
- `site texts.txt` contains two more `[ADD CREDENTIAL URL]` reference placeholders. No unresolved email, LinkedIn or GitHub placeholders were found in the supplied content.
- The machine-learning course title remains pending confirmation because the supplied source texts disagree. No replacement facts were invented.
- Ingestion dry run passed: **20 source documents, 21 chunks**, with no warnings.

## Live validation

- FastAPI started in live mode and `/health` returned HTTP 200 with `mode: live`.
- Next.js returned HTTP 200 at http://localhost:3000.
- A browser question completed with a streamed answer and citations. The badge changed from **Backend configured** to **RAG enabled**.
- Five requests through Next.js `/api/chat` completed with multiple token events and `done` reporting `mode: live`.
- Returned citation IDs matched independent retrieval using the same question, embedding model, top-k and threshold for all five questions. Retrieved chunk content was inspected against the answers.
- The Company & UAT answer was supported by project content, including the scoring range, reports, outreach and technologies.
- Google-project and machine-learning-tenure questions explicitly reported insufficient evidence; neither invented those facts.
- Quality limitation: broad project and technology questions mainly retrieved biography/experience content. Their answers were grounded but incomplete, omitting some portfolio projects and stack details. Some source cards were only tangentially relevant. Retrieval settings were preserved.
- The 17 backend tests passed with the existing Starlette/httpx deprecation warning.

The ignored `artifacts/tai-live-validation.json` records questions, answers, citations and retrieved evidence. `artifacts/tai-live-verified.jpg` shows the live badge. These checks are a small live sample, not a guarantee for all future model answers.

## Security checks

The configured OpenAI, Supabase and shared backend keys were absent from the returned HTML and 77 available client-bundle, log and artifact files scanned before the final screenshot. Both shared keys matched. An unauthenticated direct `/chat` request returned HTTP 401. Server-only credential handling, authentication and CORS settings were preserved. No secret values were printed. Application source searches found no legacy Supabase key variable or Supabase-secret Bearer header.

## Restart commands

Only rerun ingestion after changing indexed content; it replaces the dedicated index and incurs embedding requests:

```powershell
Push-Location backend
..\.venv\Scripts\python.exe -m ingestion.ingest
Pop-Location
```

Start FastAPI from a separate repository-root PowerShell terminal:

```powershell
Set-Location backend
..\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000 --no-access-log
```

Start Next.js from the repository root:

```powershell
pnpm dev
```

Open http://localhost:3000/#tai. A fresh page shows **Backend configured** until a live answer completes. Keep MODE=live.
