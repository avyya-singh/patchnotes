# PatchNotes

An incident investigation workspace built with React, TypeScript, FastAPI, LangChain, LangGraph, and pretrained semantic retrieval. Designed as a personal portfolio project with a zero-cost public demo and a separate full local application.

## Two explicit modes

|              | Public Vercel demo                       | Full local application                                |
| ------------ | ---------------------------------------- | ----------------------------------------------------- |
| Hosting      | Static files on Vercel Hobby             | Your computer / Docker                                |
| Analysis     | Precomputed deterministic sample reports | Deterministic baseline or live Ollama model           |
| Retrieval    | Precomputed BM25 + BGE-small results     | Runtime BM25 + pretrained BGE-small with RRF          |
| State        | Each visitor's browser, up to 30 runs    | SQLite reports, documents, events, audit, checkpoints |
| Uploads      | Disabled                                 | Text, Markdown, and text PDFs                         |
| Workflow     | Explore samples and simulate review      | Actual LangGraph workflow and approval interrupts     |
| Paid API key | None                                     | None for local Ollama                                 |

The public demo does not pretend to call a model. Its visible banner, report provenance, and disabled upload controls explain its behavior. All exported incidents, logs and documents are synthetic. Browser history can be cleared from Run history.

## What the app does

Select an incident, inspect the release diff and logs, and explore a report with clickable citations. The checkout scenario links database connection exhaustion to a pool budget of 400 against a limit of 200. The orders scenario investigates retries and downstream throttling. The search scenario explicitly has insufficient evidence and proposes diagnostic checks instead of a rollback.

In the full backend, LangChain tools inspect synthetic release/log data, retrieve runbooks, and feed the evidence into a checkpointed LangGraph workflow. Approval is a LangGraph interrupt. Accepting it records a local simulation, not a real infrastructure change. Approvals are idempotent, and waiting approvals survive restart.

## Public demo: Vercel

See [DEPLOY-VERCEL.md](DEPLOY-VERCEL.md) for the exact import settings. At the repository root, `vercel.json` installs the frontend, builds demo mode, and publishes `frontend/dist-demo`. It does not deploy Python functions or paid infrastructure.

```sh
cd frontend
npm ci
npm test
npm run build:demo
```

To preview that build locally, run `python -m http.server 4182 --directory frontend/dist-demo` from the repository root. Then open http://127.0.0.1:4182.

Use Vercel's personal Hobby plan for this non-commercial project. No Vercel API key, model key, payment method, or database is needed by the application. Platform usage limits still apply. Publishing requires the user's own GitHub repository and Vercel login; a successful public deployment is not implied by a local build.

## Full local application

Requires Python 3.14 and Node 22+. Windows:

```powershell
./start.ps1
```

Manual setup:

```sh
python -m venv .venv
# Windows: .venv/Scripts/activate
source .venv/bin/activate
pip install -r requirements.txt
cd frontend
npm ci
npm run build
cd ..
python -m uvicorn backend.app:app --host 127.0.0.1 --port 4181
```

Visit http://127.0.0.1:4181. For hot reload, `npm run dev` in `frontend/` uses port 4180 and proxies `/api` to port 4181.

The default analysis mode is deterministic, clearly labeled in the UI. Retrieval uses the real pretrained 384-dimensional `BAAI/bge-small-en-v1.5` embedding model via FastEmbed/ONNX Runtime. First use downloads the model; subsequent calls reuse disk-cached embeddings. BM25 and vector ranks are combined with reciprocal rank fusion. `search(..., method='bm25'|'semantic'|'hybrid')` supports comparisons. This uses neither paid embedding APIs nor hash-vector substitutes.

Upload UTF-8 text, Markdown, or a readable text PDF up to 2 MB. PDF ingestion reads up to 60 pages and caps extracted text at 150,000 characters. No arbitrary shell command, arbitrary external URL, or live mutation tool is exposed.

## Free live model: Ollama

Install Ollama from https://ollama.com, start its server, and pull an open model suitable for your RAM/CPU/GPU:

```sh
ollama pull qwen3:8b
```

Before starting the backend, set:

```powershell
$env:PATCHNOTES_MODE='ollama'
$env:OLLAMA_MODEL='qwen3:8b'
$env:OLLAMA_BASE_URL='http://localhost:11434'
```

LangChain ChatOllama produces a structured headline, summary, cited findings, confidence, and next steps. Unknown citation IDs fail the run. Missing diagnostic evidence suppresses rollback proposals. IDs alone do not prove that a source supports a claim; assess factual support separately.

Ollama is not installed on the original development computer, so live model inference has not been verified here. The model path has schema/citation/safety tests with a stub, not a claim of live model quality. No paid API is used. Model execution still consumes the user's hardware resources and electricity.

Optional LangSmith tracing is off by default. Enabling it sends trace data to the configured LangSmith service; it is not necessary for the free project.

## Tests and evaluation

```sh
python -m pytest -q
python evaluate.py
cd frontend
npm test
```

Seven backend tests cover incident investigations, insufficient evidence, approval/rejection, repeated-approval protection, persistence/resume, citation validation, service-scoped retrieval, upload validation, event streaming, real pretrained embedding dimensions, and paraphrase retrieval. The frontend adapter test covers static sample loading, browser isolation, duplicate approvals, disabled uploads, and local-history clearing.

`evaluation-results.json` records a small three-fixture retrieval/report regression check. These synthetic fixtures are not a general accuracy benchmark, and citation-ID validity is not semantic entailment. Do not turn the results into production accuracy claims.

Set `PATCHNOTES_DATA` to an isolated directory for tests/evaluation. Optionally set `EMBEDDING_CACHE` to share a downloaded model cache between local runs. `export_demo.py` always uses a separate temporary database seeded only with committed synthetic fixtures, preventing accidental export of uploaded local documents. It regenerates `frontend/public/demo-data.json` with real retrieval and deterministic sample reports.

## Docker and CI

```sh
docker compose up --build
```

Visit http://127.0.0.1:4180. Docker Compose keeps SQLite data in a named volume and binds only to localhost. The Docker engine was stopped on the original machine, so container execution is unverified. It is not required for the free Vercel demo.

The GitHub Actions workflow runs Python tests, the small evaluation, frontend adapter tests, both builds, a Docker build, and a health smoke test. It runs only after the repository is pushed to GitHub. Vercel's Git integration handles static deployment. No Azure or paid-cloud deployment workflow is included.

## Architecture and boundaries

```text
PUBLIC: React static build → synthetic JSON + browser-local simulation history

LOCAL:  React → FastAPI → LangGraph (SQLite checkpoints)
                        ├─ inspect deployment + logs (LangChain tools)
                        ├─ BM25 + BGE-small retrieval → source passages
                        ├─ deterministic baseline OR ChatOllama synthesis
                        └─ review interrupt → idempotent local audit
```

The local Python app is a single-user, single-process workspace. Service filtering is context separation, not account authorization. Do not expose the Python API publicly with private documents. Public deployment uses the static build, which has no backend, uploads, keys, shared-user database, or inference costs.

## Project status

- Verified: semantic embeddings/retrieval, seven backend tests, static adapter test, both frontend builds, and public-demo browser flows.
- Prepared: GitHub source and Vercel static deployment configuration.
- Requires user account setup: empty GitHub repository, Vercel sign-in/import.
- Not yet verified: live Ollama inference, Docker execution, GitHub-hosted CI, or actual public Vercel deployment.

## References

- https://docs.langchain.com/oss/python/langgraph/graph-api
- https://docs.langchain.com/oss/python/integrations/chat/ollama
- https://qdrant.tech/documentation/fastembed/fastembed-quickstart/
- https://vercel.com/docs/plans/hobby
- https://vercel.com/docs/deployments/git
