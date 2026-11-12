# Cognivault

*Full-Stack Agentic AI Platform*

![Cognivault Cover](frontend/public/images/cognivault.png)

An intelligent document analysis and agentic research workspace powered by RAG, OCR, and LangGraph.

[![Next.js](https://img.shields.io/badge/Next.js-16.4.5-000000?logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.3-149ECA?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss)](https://tailwindcss.com/)
[![Python](https://img.shields.io/badge/Python-3.13-3776AB?logo=python)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-API-009688?logo=fastapi)](https://fastapi.tiangolo.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-pgvector-4169E1?logo=postgresql)](https://www.postgresql.org/)
[![LangGraph](https://img.shields.io/badge/LangGraph-agent_workflows-1C3C3C)](https://www.langchain.com/langgraph)

[Overview](#overview) · [Features](#features) · [Architecture](#architecture) · [Technology stack](#technology-stack) · [Getting started](#getting-started)

[Environment variables](#environment-variables) · [API overview](#api-overview) · [Testing](#testing-and-verification) · [Security](#security) · [Project structure](#project-structure) · [Roadmap](#roadmap)

> **Project status:** The core application is implemented and its local automated checks pass. It has not been deployed publicly; Docker images and a hosted CI run have not been verified. This is a learning project as well as a full-stack AI engineering portfolio project. See [security and operational limitations](#security-and-operational-limitations).

## Overview

Cognivault is a private document intelligence and research workspace. Users can upload PDFs or images, extract text with native PDF parsing or OCR, search their own indexed content, and ask an AI assistant to answer with evidence from their documents. A LangGraph agent can combine document tools with public web search and pause before destructive actions until a person approves.

The project brings together three related capabilities:

1. **Document intelligence** — file validation, text extraction, OCR, basic classification, and candidate field extraction.
2. **Retrieval-augmented generation (RAG)** — semantic search over document chunks stored in PostgreSQL with pgvector, followed by answers grounded in retrieved passages.
3. **Agentic workflows** — a LangGraph assistant that can call document and web tools, stream progress, retain conversation state, and request approval for document deletion.

This design is useful for researching reports, locating facts across a collection of files, summarizing and comparing documents, and exploring scanned paperwork. Extracted fields and OCR output are candidates for review, not verified facts.

## Features

| Area | Implemented | Notes |
| --- | --- | --- |
| Authentication | Yes | Email/password registration and login; Argon2 hashes; JWT in an HttpOnly cookie; revocable server-side sessions; logout and revoke-all. |
| User isolation | Yes | Document access and vector retrieval are filtered by owner; conversations are owner-scoped; foreign IDs return 404. |
| Document upload | Yes | PDF, JPG, JPEG, and PNG; file size and PDF page limits; generated storage names. Uploads are available from the dashboard and chat composer. |
| Text extraction and OCR | Yes | PyMuPDF extracts native PDF text; Tesseract handles images and scanned/low-text PDF pages. |
| Classification and field extraction | Yes | Rule-based document type candidates and limited fields (email and invoice number); results are marked for review. This is not a general-purpose OCR understanding system. |
| RAG | Yes | Text is split into chunks, embedded with `all-MiniLM-L6-v2` (384 dimensions), stored in pgvector, and searched by cosine distance. Answers include source references. |
| Agent tools | Yes | Document search, details, summaries, comparisons, candidate fields, Tavily web search, and research reports. |
| Multi-document research | Yes | The agent can search or compare multiple user-owned documents; RAG requests can select multiple document IDs. |
| Chat history | Yes | Conversation metadata is in PostgreSQL; messages and graph state are persisted by the LangGraph PostgreSQL checkpointer. |
| Streaming | Yes | Server-Sent Events stream assistant text, tool activity, approval requests, and completion/error events. |
| Human approval | Yes | Agent-initiated document deletion pauses for explicit approval or rejection, then rechecks ownership before acting. |
| Responsive workspace | Yes | Dark-themed authentication, dashboard, chat workspace, navigation, loading states, and mobile navigation are implemented. |
| CI and containers | Configured | GitHub Actions workflow and Dockerfiles/Compose configuration exist. Hosted CI and a Docker image build/run have not been verified. |

### Screenshots

There are **no application screenshots currently committed**. The cover image above is promotional artwork, not a capture of the running product. Add real, sanitized application captures under `docs/screenshots/` when they are available.

| Screen | Capture status |
| --- | --- |
| Login and registration | Not yet available |
| Document dashboard | Not yet available |
| Document upload and progress | Not yet available |
| OCR and candidate analysis | Not yet available |
| RAG research and source passages | Not yet available |
| Agent chat, streaming, and approval | Not yet available |

## Architecture

```mermaid
flowchart LR
    Browser["Browser<br/>Next.js UI"]
    Next["Next.js App Router<br/>same-origin API proxy"]
    API["FastAPI<br/>auth · documents · RAG · agent"]
    Auth["Authentication<br/>JWT cookie + session validation"]
    Upload["Upload and extraction"]
    PDF["PyMuPDF<br/>native PDF text"]
    OCR["Tesseract OCR<br/>scans and images"]
    Chunk["Chunking and embeddings<br/>all-MiniLM-L6-v2"]
    RAG["RAG retrieval<br/>cosine similarity"]
    Agent["LangGraph<br/>checkpointed agent"]
    Tools["Owned-document tools<br/>search · summarize · compare"]
    Approval["Human approval<br/>before deletion"]
    Groq["Groq LLM"]
    Tavily["Tavily web search"]
    DB[("PostgreSQL + pgvector<br/>users · documents · chunks · conversations")]
    Checkpoint[("LangGraph checkpoint tables")]

    Browser <-->|"JSON + SSE"| Next
    Next -->|"rewrite /backend/*"| API
    API --> Auth
    Auth --> DB
    API --> Upload
    Upload --> PDF
    Upload --> OCR
    Upload --> Chunk
    Chunk --> DB
    API --> RAG
    RAG --> DB
    RAG --> Groq
    API --> Agent
    Agent --> Checkpoint
    Agent --> Tools
    Tools --> DB
    Tools --> RAG
    Tools --> Groq
    Tools --> Tavily
    Agent --> Approval
    Approval -->|"approve or reject"| Agent
```

### Request and data flow

- **Authentication:** The browser calls the same-origin `/backend/*` proxy. FastAPI validates the HttpOnly cookie and its matching server-side session before serving protected endpoints.
- **Document processing:** The API validates the upload, stores it under a generated name outside the web root, extracts native text or runs OCR, and records the result and candidate metadata. Auto-indexing is enabled by default.
- **RAG:** The indexing pipeline chunks extracted text, generates 384-dimensional embeddings, and stores them beside each document. Retrieval joins chunks to documents and applies the authenticated owner filter in SQL before returning evidence to the LLM.
- **Agent workflow:** A conversation stores a `thread_id` and owner in PostgreSQL. LangGraph uses its PostgreSQL checkpointer for message and graph state. The API supplies caller identity and selected document context to tools; tools do not accept a model-supplied user ID.
- **Approval and streaming:** A deletion tool pauses via LangGraph’s interrupt mechanism. The API presents the pending action to the user and resumes only with an explicit decision. The streaming endpoint sends agent output and tool events as Server-Sent Events.

## Technology stack

| Layer | Technologies |
| --- | --- |
| Frontend | Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4 |
| Backend | Python 3.13, FastAPI, Pydantic 2, SQLAlchemy 2, Alembic |
| Database | PostgreSQL with pgvector; compatible with Neon PostgreSQL when the `vector` extension is available |
| AI and orchestration | LangChain, LangGraph, Groq chat model, Tavily search |
| Embeddings and retrieval | Sentence Transformers `all-MiniLM-L6-v2`, 384 dimensions, pgvector cosine distance |
| Document processing | PyMuPDF, Pillow, pytesseract, Tesseract OCR |
| Authentication | `pwdlib` Argon2, PyJWT, HttpOnly cookie, PostgreSQL-backed revocable sessions |
| Quality and delivery | pytest, Ruff, Vitest, React Testing Library, ESLint, TypeScript, GitHub Actions, Docker |

Exact dependency pins are recorded in [backend/requirements.txt](./backend/requirements.txt) and [frontend/package-lock.json](./frontend/package-lock.json).

## Getting started

### Prerequisites

- Git
- Python 3.13
- Node.js 22 and npm
- PostgreSQL with the pgvector extension; Neon PostgreSQL is supported through its connection URL
- Tesseract OCR installed locally for scanned PDFs and images (Docker installs Tesseract in the backend image)
- A Groq API key for LLM chat/RAG/agent features
- A Tavily API key for web search and web-backed research tools

The app and tests can be set up without provider keys, but requests that use the corresponding AI provider will not work until a valid key is configured.

### 1. Clone the repository

```bash
git clone https://github.com/iamkapilll/cognivault.git
cd cognivault
```

### 2. Configure PostgreSQL / Neon

Create a PostgreSQL database and make sure the database role can use pgvector. For Neon, copy the connection URL from the project dashboard and use the SQLAlchemy psycopg URL form:

```text
postgresql+psycopg://USER:PASSWORD@HOST/DATABASE?sslmode=require
```

Keep the real URL private. If the password contains reserved URL characters, percent-encode it before placing it in the connection URL. The Alembic chain enables the `vector` extension and creates the application tables.

> **Migration warning:** The checked-in `f5b4689cda69_create_users_table.py` migration contains generated `DROP` operations for LangGraph checkpoint tables. On a populated database this can delete conversation checkpoints; on a fresh database it can fail if those tables do not exist. Do **not** run the migration chain against valuable data. A safe fresh-database migration flow must be established before treating this setup as production-ready. Use a disposable database only until the migration is corrected and verified.

### 3. Configure and run the backend

From the repository root, create a local environment file from the safe template and replace the placeholders:

```powershell
Copy-Item backend\.env.example backend\.env
```

On macOS/Linux, use `cp backend/.env.example backend/.env`. Set at least `DATABASE_URL` and a randomly generated `JWT_SECRET_KEY` of 32 or more characters. Set provider keys for the AI tools you intend to use.

Create the virtual environment, install development dependencies, and start FastAPI. Apply migrations only after reviewing the warning above and using a disposable database:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-dev.txt
alembic upgrade head
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

On macOS/Linux, activate with `source .venv/bin/activate`. The first backend start initializes the LangGraph PostgreSQL checkpointer and may load the embedding model; cold startup can take longer than a normal API start.

### 4. Install Tesseract OCR

Install the Tesseract executable for your operating system and ensure it is on `PATH`. On Windows, if it is not on `PATH`, set `TESSERACT_CMD` to the full executable path (a common installation location is `C:\Program Files\Tesseract-OCR\tesseract.exe`). The Docker backend image installs Tesseract and clears this Windows-specific setting.

### 5. Run the frontend

In a second terminal, from the repository root:

```powershell
cd frontend
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), create an account, and upload a document. The frontend proxies API calls from `/backend/*` to `http://127.0.0.1:8000` by default.

For a production frontend build, run `npm run build` and then `npm start` from `frontend/`. The backend still needs the configured database and provider settings.

### Environment variables

The backend reads these settings from `backend/.env` (see the complete safe template at [backend/.env.example](./backend/.env.example)). **Never commit real credentials.**

| Variable | Required | Purpose / default |
| --- | --- | --- |
| `DATABASE_URL` | Yes | SQLAlchemy/psycopg PostgreSQL URL; Neon URL must use SSL. |
| `JWT_SECRET_KEY` | Yes | JWT signing secret; at least 32 characters. |
| `JWT_ALGORITHM` | No | JWT signing algorithm; default `HS256`. |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | No | Session lifetime; default `60`. |
| `SESSION_COOKIE_NAME` | No | Cookie name; default `cognivault_access_token`. |
| `COOKIE_SECURE` | Production | Set `true` behind HTTPS; default `false` for local development. |
| `COOKIE_DOMAIN` | No | Optional cookie domain; unset by default. |
| `FRONTEND_ORIGINS` | No | Comma-separated allowed origins; defaults to localhost ports 3000. |
| `UPLOAD_DIR` | No | Private upload directory; defaults to `backend/uploads`. |
| `MAX_FILE_SIZE_MB` | No | Maximum upload size; default `10`. |
| `MAX_PDF_PAGES` | No | Maximum PDF pages; default `20`. |
| `RAG_MAX_DISTANCE` | No | Maximum cosine distance for retrieval; default `0.75`. |
| `GROQ_API_KEY` | AI features | Groq credential for model requests; do not expose in frontend variables. |
| `GROQ_MODEL` | No | Groq model identifier; default `openai/gpt-oss-20b`. |
| `TAVILY_API_KEY` | Web tools | Tavily credential for public web search and research reports. |
| `TESSERACT_CMD` | OCR on Windows | Optional full path to `tesseract.exe`; empty uses `PATH`. |
| `LOGIN_RATE_LIMIT` | No | Login attempts allowed in the configured window; default `5`. |
| `LOGIN_RATE_WINDOW_SECONDS` | No | Login rate-limit window; default `900`. |
| `PRODUCTION` | No | Set `true` in production; requires `COOKIE_SECURE=true`. |
| `BACKEND_INTERNAL_URL` | Docker build | Frontend build-time rewrite target; Compose sets `http://backend:8000`. |

`GROQ_API_KEY` and `TAVILY_API_KEY` are intentionally absent from the browser bundle. The frontend uses a relative API base URL.

## API overview

FastAPI routes are **not currently versioned**, except for the `/api/v1/health` health alias. In local development, open [Swagger UI](http://127.0.0.1:8000/docs) or [ReDoc](http://127.0.0.1:8000/redoc). Through the Next.js proxy, backend paths are reached under `/backend` (for example, `/backend/auth/me`).

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health`, `/api/v1/health` | Public health check |
| `POST` | `/auth/register` | Register and create a session |
| `POST` | `/auth/login` | Authenticate and set the session cookie |
| `GET` | `/auth/me` | Read the current user |
| `POST` | `/auth/logout` | Revoke the current session |
| `POST` | `/auth/logout-all` | Revoke all sessions for the authenticated user |
| `GET` | `/documents` | List the caller’s documents |
| `POST` | `/documents` | Create a document metadata record |
| `POST` | `/documents/upload` | Upload, extract, analyze, and auto-index a PDF/image |
| `GET` | `/documents/{document_id}` | Read owned document metadata |
| `GET` | `/documents/{document_id}/text` | Read extracted text |
| `GET` | `/documents/{document_id}/analysis` | Read classification and candidate fields |
| `DELETE` | `/documents/{document_id}` | Delete an owned document and its chunks/file |
| `POST` | `/rag/index/{document_id}` | Index or reindex an owned document |
| `POST` | `/rag/ask` | Ask a question against selected or all owned indexed documents |
| `POST` | `/agent/conversations` | Create a conversation with optional document IDs |
| `GET` | `/agent/conversations` | List the caller’s conversations |
| `GET` | `/agent/conversations/{conversation_id}` | Read conversation metadata |
| `PATCH` | `/agent/conversations/{conversation_id}` | Rename a conversation |
| `DELETE` | `/agent/conversations/{conversation_id}` | Delete conversation metadata and its checkpoint rows |
| `GET` | `/agent/conversations/{conversation_id}/messages` | Restore messages and any pending approval |
| `POST` | `/agent/chat` | Run an agent interaction without streaming |
| `POST` | `/agent/chat/stream` | Stream tokens, tool events, approvals, and completion over SSE |
| `POST` | `/agent/approve` | Approve or reject a pending agent action |

## How document Q&A and the agent work

1. **Upload:** The API checks the allowed extension, file size, and file content, then stores the file using a generated storage name.
2. **Extract:** PyMuPDF reads selectable PDF text. For image files and PDF pages with little native text, Tesseract attempts OCR. PDF page count and password protection are checked.
3. **Analyze:** A small rule-based classifier identifies broad document types and extracts a limited set of candidate fields. These results are marked as needing review and are not independently verified.
4. **Chunk and embed:** Extracted text is split into overlapping chunks. Sentence Transformers creates normalized 384-dimensional embeddings.
5. **Index:** The chunks and embeddings are saved in PostgreSQL with pgvector. The document’s index state is updated.
6. **Retrieve:** A RAG query embeds the question and ranks chunks by cosine distance. SQL filters by `user_id` and, when selected, the requested document IDs.
7. **Answer:** Groq receives the question and retrieved passages with instructions to treat document content as untrusted evidence and cite provided sources.
8. **Agent:** LangGraph can select tools for document search, summarization, comparison, web search, and report generation. Conversation state is persisted in PostgreSQL.
9. **Human approval:** A requested deletion pauses the graph. The user must approve or reject it; on resume, the tool checks ownership again before deletion.

## Testing and verification

Run backend checks from `backend/` with the project virtual environment activated:

```bash
python -m pytest
python -m ruff check app tests scripts
python -m ruff format --check app tests scripts
```

Run frontend checks from `frontend/`:

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
```

**Locally verified results:** backend tests passed (**51 passed**), Ruff lint passed, Ruff format check passed (**38 files**), frontend regression tests passed (**1 passed**), ESLint and TypeScript checks passed, and the production Next.js build completed. The frontend production dependency audit reported no vulnerabilities; the full development dependency audit reported moderate advisories in a transitive lint-tool dependency. These are local results, not a claim that the hosted GitHub Actions workflow has run.

To validate the main user flows manually, start PostgreSQL and both development servers, register an account, reload to check session persistence, upload a searchable PDF and an image/scanned PDF, inspect extracted text and candidate analysis, ask a RAG question and check its sources, reopen a conversation, and request a deletion to test approve/reject behavior. A second account can be used to verify that foreign document and conversation IDs are not accessible.

The automated backend suite focuses on security primitives, upload helpers, CSRF, rate limiting, unauthenticated route behavior, and the trailing-slash regression. The frontend test covers restoring document attachments when reopening a conversation. Full database-backed end-to-end flows require a configured PostgreSQL database and provider credentials.

## Security

- **Passwords:** Argon2 password hashes using `pwdlib`; registration enforces a minimum length and basic strength checks.
- **Sessions:** Short-lived JWTs are stored in HttpOnly cookies and backed by revocable PostgreSQL `auth_sessions` rows. Tokens are not stored in `localStorage`.
- **Cookie and CSRF protections:** Cookies use `SameSite=Lax`; production configuration requires `Secure`. Mutating requests are checked against allowed Origin/Referer values and cross-site Fetch Metadata.
- **Authorization:** Document reads, writes, retrieval, and agent document tools are scoped to the authenticated owner in SQL. Foreign IDs return 404.
- **Agent actions:** Destructive document deletion is paused until explicit approval and rechecks ownership when resumed.
- **Uploads:** Extensions, file size, content, PDF page count, image dimensions, generated names, and storage paths are checked. Files are stored outside the frontend’s public directory.
- **Secrets:** API credentials belong only in the ignored backend `.env` file or deployment secret store. The committed `.env.example` contains placeholders.

### Security and operational limitations

- Login and registration rate limiting is process-local memory, so it is not shared across multiple workers or instances.
- Uploaded files are on local disk (or the configured Docker volume), not object storage.
- Extraction and embedding run during the upload request; there is no background job queue.
- OCR and regex extraction can be incomplete or wrong. Candidate fields require human review.
- HTTPS, production cookie domains, deployment settings, and hosted CI have not been verified here.
- The checked-in initial users migration has potentially destructive checkpoint-table drops; migration safety must be fixed and reverified before applying to a populated database.
- The full npm development dependency tree currently reports moderate advisories in a transitive lint-tool dependency; `npm audit --omit=dev` reported zero production dependency vulnerabilities at the last local check.

## Project structure

```text
cognivault/
├── .github/
│   └── workflows/ci.yml             # backend/frontend CI jobs
├── backend/
│   ├── app/
│   │   ├── agents/                  # LangGraph graph and checkpointer lifespan
│   │   ├── core/                    # config, auth, CSRF, rate limit, request context
│   │   ├── routers/                 # auth, documents, RAG, agent endpoints
│   │   ├── services/                # OCR, uploads, indexing, retrieval, tools
│   │   ├── main.py                  # FastAPI app, middleware, health routes
│   │   ├── models.py                # SQLAlchemy models
│   │   └── schemas.py               # Pydantic API schemas
│   ├── alembic/                     # PostgreSQL migrations
│   ├── scripts/                     # operator scripts, including legacy ownership
│   ├── tests/                       # pytest tests
│   ├── .env.example                 # safe configuration template
│   ├── Dockerfile
│   ├── pyproject.toml               # Ruff configuration
│   └── requirements*.txt            # pinned runtime/dev dependencies
├── frontend/
│   ├── app/
│   │   ├── (workspace)/             # protected dashboard, chat, research, settings
│   │   ├── login/                   # sign-in page
│   │   ├── register/                # account creation page
│   │   └── globals.css              # Tailwind theme and global styles
│   ├── components/                  # app shell, chat, dashboard, auth, UI
│   │   └── AgentWorkspace.test.tsx  # chat attachment regression test
│   ├── lib/                         # API clients
│   ├── public/                      # static assets
│   ├── vitest.config.mts            # frontend test configuration
│   ├── next.config.ts               # same-origin API rewrite
│   └── Dockerfile
├── docker-compose.yml               # local containers
├── AGENTS.md                        # project-specific agent workflow
├── LEARNING.md                      # development learning journal
└── README.md
```

## Roadmap

### Implemented

- Authenticated workspaces and revocable sessions.
- Owner-scoped documents, chunks, conversations, and agent tools.
- PDF/image processing, OCR, candidate analysis, indexing, and RAG.
- Persistent LangGraph conversations, SSE streaming, multi-document tools, and approval-gated deletion.
- Responsive frontend, backend/frontend tests, CI workflow, Dockerfiles, and Compose configuration.

### Planned improvements

- Add a picker to attach documents already in the library without uploading them again.
- Move long-running extraction and embedding work out of the upload request if usage makes that necessary.
- Use shared rate limiting for multi-instance deployments.
- Consider object storage for uploaded files and operational cleanup for retained data.
- Build and exercise the Docker images, then document and verify a real deployment.
- Expand database-backed integration coverage for account lifecycle, ownership isolation, OCR/RAG, chat history, streaming, and approvals.
- Add real, privacy-safe product screenshots to `docs/screenshots/`.
- Choose and add a project license before presenting the repository as open source.

## Author

- **GitHub:** [iamkapilll](https://github.com/iamkapilll)
- **Portfolio:** [kapildevchaudhary.vercel.app](https://kapildevchaudhary.vercel.app/)
- **LinkedIn:** [Kapil Dev Chaudhary](https://www.linkedin.com/in/kapil-dev-chaudhary/)

## Project notes

- [Learning journal](./LEARNING.md)
- [Agent contribution guide](./AGENTS.md)
- [Backend environment template](./backend/.env.example)
- [CI workflow](./.github/workflows/ci.yml)

**License:** Not yet selected. No license badge is shown, and reuse rights should not be assumed until a license is added.
