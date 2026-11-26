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

[Overview](#overview) · [Features](#features) · [Application Showcase](#application-showcase) · [Architecture](#architecture) · [Technology stack](#technology-stack) · [Getting started](#getting-started)

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
| Agent tools | Yes | Document search, details, summaries, comparisons, candidate fields, Tavily web search, and research reports. Custom agents have a server allowlisted LangChain model registry. |
| Multi-document research | Yes | The agent can search or compare multiple user-owned documents; RAG requests can select multiple document IDs. |
| Chat history | Yes | Conversation metadata is in PostgreSQL; messages and graph state are persisted by the LangGraph PostgreSQL checkpointer. |
| Streaming | Yes | Server-Sent Events stream assistant text, tool activity, approval requests, and completion/error events. |
| Human approval | Yes | Agent-initiated document deletion pauses for explicit approval or rejection, then rechecks ownership before acting. |
| Responsive workspace | Yes | Dark-themed authentication, dashboard, chat workspace, navigation, loading states, and mobile navigation are implemented. |
| CI and containers | Configured | GitHub Actions workflow and Dockerfiles/Compose configuration exist. Hosted CI and a Docker image build/run have not been verified. |

## Application Showcase

These screenshots highlight implemented document, AI, and account workflows. The AI workspace capture also shows the entry point for document and web research, while the approval capture shows tool activity together with its human approval gate.

### Document Dashboard

Browse the document library, check processing and indexing status, and open extracted text or analysis.

![Cognivault AI Document Dashboard](docs/screenshots/document-dashboard.png)

### AI Agent Workspace and Research

Start a private research session across documents and the web, or choose a suggested prompt for document-grounded work.

![Cognivault AI Agent and Research Workspace](docs/screenshots/agent_workspace.png)

### Document Upload

Choose a PDF or image to add to the library, with quick actions for grounded questions and research across files.

![Cognivault AI Document Upload](docs/screenshots/document-upload.png)

### OCR and Document Analysis

Review text extracted from an image document. OCR and extracted fields are candidates for review, not verified facts.

![Cognivault AI OCR Extracted Text](docs/screenshots/ocr_generated_text.png)

### RAG Document Q&A

Ask about an attached document and inspect the answer alongside the source context used to ground it.

![Cognivault AI RAG Document Q&A](docs/screenshots/rag-document-qa.png)

### Agent Tool Execution and Human-in-the-Loop Approval

See a document deletion tool in progress and the approval prompt that pauses the agent until a person approves or rejects the action.

![Cognivault AI Agent Tool Approval](docs/screenshots/human_approval.png)

### Authentication

Sign in to the private workspace through the account authentication screen.

![Cognivault AI Authentication](docs/screenshots/authentication.png)

### Settings

Review account details, session controls, backend status, and privacy information.

![Cognivault AI Settings](docs/screenshots/settings.png)

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
| AI and orchestration | LangChain, LangGraph, Groq, OpenAI, Anthropic, Google Gemini chat models, Tavily search |
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
- A Groq API key for the default chat/RAG/agent features
- Optional OpenAI, Anthropic, or Google API keys to enable those providers for custom agents
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
| `GROQ_API_KEY` | Default AI features | Groq credential for the existing assistant and Groq-backed model requests; do not expose in frontend variables. |
| `GROQ_MODEL` | No | Groq model identifier; default `openai/gpt-oss-20b`. |
| `OPENAI_API_KEY` | Optional | Enables allowlisted OpenAI models for custom agents. |
| `ANTHROPIC_API_KEY` | Optional | Enables allowlisted Anthropic models for custom agents. |
| `GOOGLE_API_KEY` | Optional | Enables allowlisted Gemini models for custom agents. |
| `TAVILY_API_KEY` | Web tools | Tavily credential for public web search and research reports. |
| `TESSERACT_CMD` | OCR on Windows | Optional full path to `tesseract.exe`; empty uses `PATH`. |
| `LOGIN_RATE_LIMIT` | No | Login attempts allowed in the configured window; default `5`. |
| `LOGIN_RATE_WINDOW_SECONDS` | No | Login rate-limit window; default `900`. |
| `CUSTOM_AGENT_MAX_MESSAGE_LENGTH` | No | Maximum custom-agent input characters; default `4000` (maximum allowed setting `10000`). |
| `CUSTOM_AGENT_MAX_DOCUMENTS` | No | Maximum selected documents per custom-agent run; default `20` (maximum allowed setting `20`). |
| `CUSTOM_AGENT_EXECUTION_TIMEOUT_SECONDS` | No | Custom-agent execution and provider request deadline; default `90`, allowed range `1`–`600`. |
| `CUSTOM_AGENT_RECURSION_LIMIT` | No | LangGraph step limit for custom agents; default `16`, allowed range `2`–`100`. |
| `CUSTOM_AGENT_MAX_CONCURRENCY` | No | Maximum concurrent LangGraph tool calls; default `4`, allowed range `1`–`16`. |
| `PRODUCTION` | No | Set `true` in production; requires `COOKIE_SECURE=true`. |
| `BACKEND_INTERNAL_URL` | Docker build | Frontend build-time rewrite target; Compose sets `http://backend:8000`. |

All model-provider credentials (`GROQ_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, and `GOOGLE_API_KEY`) and `TAVILY_API_KEY` stay on the backend and are intentionally absent from the browser bundle. Additional provider clients load only when a configured custom agent selects that provider; deployments using only Groq need no other provider keys. The model registry currently allows Groq `openai/gpt-oss-20b`, `openai/gpt-oss-120b`, `llama-3.3-70b-versatile`, and `llama-3.1-8b-instant`; OpenAI `gpt-5.6-sol`; Anthropic `claude-haiku-4-5-20251001`; and Google Gemini `gemini-4-hydrogen`. Temperature limits and tool-calling support are validated per model.

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
| `POST` | `/agents/{agent_id}/invoke` | Execute a stateless or persistent custom-agent turn |
| `POST` | `/agents/{agent_id}/stream` | Stream a stateless or persistent custom-agent turn as typed SSE events |
| `GET` | `/agents/{agent_id}/approvals` | List unexpired pending approvals for an owned agent |
| `GET` | `/agents/{agent_id}/approvals/{approval_id}` | Read sanitized details for one owned approval |
| `POST` | `/agents/{agent_id}/approvals/{approval_id}/approve` | Record an owner decision to approve the exact stored action |
| `POST` | `/agents/{agent_id}/approvals/{approval_id}/reject` | Record an owner decision to reject the exact stored action |
| `POST` | `/agents/{agent_id}/approvals/{approval_id}/resume` | Resume the matching paused graph as an SSE stream |
| `POST` | `/agents/{agent_id}/conversations` | Create an owner-scoped conversation for an agent with memory enabled |
| `GET` | `/agents/{agent_id}/conversations` | List the agent's conversations with offset/limit pagination |
| `GET` | `/agents/{agent_id}/conversations/{conversation_id}` | Read owned conversation metadata |
| `GET` | `/agents/{agent_id}/conversations/{conversation_id}/messages` | Read the paginated public user/assistant history |
| `PATCH` | `/agents/{agent_id}/conversations/{conversation_id}` | Rename an owned conversation |
| `DELETE` | `/agents/{agent_id}/conversations/{conversation_id}` | Delete an owned conversation and its checkpoint state |

## Custom agent execution

Custom-agent execution is separate from the startup-built `/agent/chat` graph. Each request authenticates the session cookie, retrieves the saved agent through the owner-scoped service, revalidates provider/model/tool configuration, checks selected documents against the caller before graph construction, and builds an ephemeral graph through the dynamic factory. Trusted user and document context is set only around graph work and reset in a `finally` block. The startup graph and custom graphs share the checkpointer owned by the FastAPI lifespan; only custom agents saved with `memory_enabled: true` receive it. Existing `/agent/conversations` records remain distinct from custom-agent conversations through a nullable `conversations.agent_id` association.

Persistent memory is available for custom agents when `memory_enabled` is true. Create a conversation first, then pass its numeric `conversation_id` with each invoke or stream request. The server resolves that ID to its private checkpoint thread; clients cannot set or receive raw LangGraph thread IDs. A stateless agent rejects conversation IDs, and a memory-enabled agent requires one. Conversations are scoped to both the authenticated owner and agent. Per-conversation PostgreSQL advisory locks serialize model runs, approvals, renames, deletes and checkpoint changes across workers. Model prompts use a configurable recent-history budget (`CUSTOM_AGENT_CONTEXT_MAX_MESSAGES` and `CUSTOM_AGENT_CONTEXT_MAX_CHARS`); persisted history is not truncated. If a prior run left an unfinished checkpoint, another user turn is rejected until the approval workflow resumes or safely rejects it.

For custom agents, `human_approval_required: true` means every tool call pauses for an explicit owner decision. Even when it is false, the server always requires approval for tools classified as side-effecting, high risk, or destructive. Approval-capable agents must have persistent memory and a server-owned PostgreSQL checkpointer. `delete_document` is available to custom agents only through a custom-specific implementation behind the approval gate; the startup-built legacy graph keeps its existing interrupt implementation. An agent with no tools is supported.

The runtime validates every model tool call with the registered Pydantic tool schema, rejects parallel tool batches, enforces the server tool allowlist, and independently verifies document ownership before the call. Approval records store the exact normalized tool arguments and a SHA-256 digest, but approval APIs expose only a safe action summary. The resume route uses the server-held conversation/checkpoint association, verifies the matching LangGraph interrupt, and resumes with a server-built `Command`; clients cannot submit arguments or thread IDs. The graph checks the stored owner decision and argument digest again, rechecks document ownership, and atomically claims each approved execution. If a claimed side effect has an uncertain outcome, the call is not retried automatically. These controls reduce prompt-injection risk but cannot eliminate it; authorization is enforced in database and tool code, not by system prompts.

### Custom-agent conversation lifecycle

Conversation creation accepts an optional title and an optional list of document IDs. Document ownership is validated when the conversation is created and again when it is used. Omit `document_ids` from an invoke request to use the conversation's saved selection; supply it to choose another owned selection for that turn.

```http
POST /agents/8/conversations
Content-Type: application/json

{"title":"Quarterly review","document_ids":[12]}
```

```json
{
  "id": 31,
  "agent_id": 8,
  "title": "Quarterly review",
  "document_ids": [12],
  "created_at": "2026-11-26T10:30:00Z",
  "updated_at": "2026-11-26T10:30:00Z"
}
```

The response intentionally contains no internal checkpoint/thread identifier. Listing supports `offset` (default `0`) and `limit` (default `20`, maximum `100`) and returns `conversations`, `total`, `offset`, and `limit`. Message history uses the same pagination parameters with a default limit of `50` and maximum of `100`; it returns only non-empty user and final assistant text, never system instructions, tool arguments/results, or provider reasoning.

```http
POST /agents/8/invoke
Content-Type: application/json

{"message":"What did we decide about the delivery date?","conversation_id":31}
```

The invoke response includes that `conversation_id`. Streaming's `run_started` event also includes it. Both omit the checkpoint thread ID. Write endpoints retain the existing cookie authentication and Origin-based CSRF protection.

Phase 1.7 adds revision `f6a71d9c2b40` after `b318a2f7c64e`. The migration creates `agent_approvals` and `agent_audit_events`; it does not rewrite conversations or checkpoint data. Review and apply it in the intended environment using the project's normal procedure (for example, `alembic upgrade head` from `backend/`). The migration is not automatically applied by the application or test suite. Downgrading removes only the two new tables.

### Invoke request and response

`POST /agents/{agent_id}/invoke` accepts JSON such as:

```json
{
  "message": "Summarize the selected report and identify its main risks.",
  "document_ids": [12]
}
```

`document_ids` is optional. Stateless agents default to an empty list; memory-enabled agents default to the conversation's saved selection. IDs must be positive, unique, owned by the authenticated user, and within the configured count limit. The response contains only the final assistant answer and includes `conversation_id` for persistent runs:

```json
{
  "run_id": "c47bcacf-a2df-4fdc-9e4e-93915157c334",
  "agent_id": 8,
  "response": "The report identifies three primary risks...",
  "conversation_id": 31
}
```

For a tool-approval pause, `/invoke` returns an `approval_required` result containing the safe approval summary instead of a final response. Otherwise it returns the final assistant answer. The endpoint returns `401` for an invalid session, `403` for an invalid or missing write Origin, `404` for an agent, conversation, approval, or selected document the user cannot access, `409` for an inactive agent, an expired/decided approval, or an unfinished checkpoint, `422` for invalid configuration/input, `503` for an unavailable provider/tool/checkpointer, `502` for a run failure, and `504` when execution exceeds its deadline. Error bodies are sanitized.

### Streaming events

`POST /agents/{agent_id}/stream` accepts the same body and returns `text/event-stream`. Each event has a named SSE event and JSON data with a matching `type` field:

```text
event: run_started
data: {"type":"run_started","run_id":"...","agent_id":8}

event: text_delta
data: {"type":"text_delta","run_id":"...","text":"The report "}

event: tool_started
data: {"type":"tool_started","run_id":"...","tool_name":"search_documents"}

event: tool_completed
data: {"type":"tool_completed","run_id":"...","tool_name":"search_documents"}

event: text_delta
data: {"type":"text_delta","run_id":"...","text":"identifies three primary risks..."}

event: run_completed
data: {"type":"run_completed","run_id":"..."}
```

The event types are `run_started`, `text_delta`, `tool_started`, `tool_completed`, `approval_required`, `run_paused`, `run_resumed`, `approval_rejected`, `run_completed`, and `error`. Approval events include a server-generated approval ID, tool name, and safe action summary, never the stored raw arguments or checkpoint internals. Tool arguments/results, model reasoning, prompts, and credentials are not placed in events. To allow whole-answer credential scanning, custom-agent text deltas are withheld until a model turn completes; event names and JSON shapes remain compatible. A run failure after streaming begins becomes a generic `error` event with a stable code.

### Approval endpoints and lifecycle

The approval endpoints use the same HttpOnly cookie authentication and write-Origin CSRF protection as other mutating routes. `GET /agents/{agent_id}/approvals` returns only unexpired pending requests for that owner and agent. `GET /agents/{agent_id}/approvals/{approval_id}` returns sanitized details. Approve and reject endpoints accept no request body, so a client cannot replace the stored arguments. After recording a decision, call the matching `/resume` route to continue the paused conversation as SSE.

Example flow:

```http
GET /agents/8/approvals
```

```json
{
  "approvals": [
    {
      "id": "95b7fe13-4cea-5ed4-8795-42e62a601aad",
      "agent_id": 8,
      "conversation_id": 31,
      "run_id": "c47bcacf-a2df-4fdc-9e4e-93915157c334",
      "tool_name": "delete_document",
      "status": "pending",
      "action_summary": "Permanently delete 'report.pdf' (document 12).",
      "created_at": "2026-11-26T10:30:00Z",
      "expires_at": "2026-11-26T10:45:00Z",
      "decided_at": null,
      "executed_at": null
    }
  ],
  "total": 1
}
```

Then make the owner decision and resume with no client-provided arguments:

```http
POST /agents/8/approvals/95b7fe13-4cea-5ed4-8795-42e62a601aad/approve
POST /agents/8/approvals/95b7fe13-4cea-5ed4-8795-42e62a601aad/resume
```

Approvals expire after 15 minutes. Decisions are one-way, resume is tied to the exact pending checkpoint interrupt, and an execution claim cannot be reused. Agent or conversation deletion cascades to approval rows and existing conversation cleanup deletes the corresponding checkpoint thread. Audit rows retain only owner-scoped lifecycle identifiers, tool name, outcome and safe metadata; they never store prompts or tool arguments. Audit records remain until the user account is deleted, at which point the user foreign key cascades and removes them. No scheduled audit-retention job is configured yet.

### Browser calls and CSRF

Use the same-origin Next.js backend proxy so the browser sends the HttpOnly session cookie. Browser requests must include credentials; the browser supplies the `Origin` header checked by the API’s existing CSRF middleware. Do not set a user ID or trust client-provided identity.

```ts
const response = await fetch(`/backend/agents/${agentId}/invoke`, {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ message, document_ids: [12] }),
});
```

For streaming, use `fetch` with the same request options, then read `response.body` with a `ReadableStream` reader and parse the standard SSE `event:` and `data:` lines. Native `EventSource` does not support a JSON POST body.

To test manually, start the backend, log in to an existing account to capture its cookie, create a stateless custom agent, then call either execution route. Keep the same allowed `Origin` on write requests:

```bash
curl -c agent-cookies.txt -X POST http://localhost:8000/auth/login \
  -H 'Origin: http://localhost:3000' -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"your-password"}'

curl -b agent-cookies.txt -X POST http://localhost:8000/agents \
  -H 'Origin: http://localhost:3000' -H 'Content-Type: application/json' \
  -d '{"name":"Research helper","system_prompt":"Answer with concise evidence-based findings.","model_provider":"groq","model_name":"openai/gpt-oss-20b","temperature":0.2,"enabled_tools":[],"memory_enabled":false,"human_approval_required":false,"is_active":true}'

curl -b agent-cookies.txt -X POST http://localhost:8000/agents/AGENT_ID/invoke \
  -H 'Origin: http://localhost:3000' -H 'Content-Type: application/json' \
  -d '{"message":"Summarize the latest project notes.","document_ids":[]}'

curl -N -b agent-cookies.txt -X POST http://localhost:8000/agents/AGENT_ID/stream \
  -H 'Origin: http://localhost:3000' -H 'Content-Type: application/json' \
  -d '{"message":"Summarize the latest project notes.","document_ids":[]}'
```

Replace `AGENT_ID` with the ID returned when the agent is created. Configure the selected provider credential in `backend/.env`; all calls above use the server-managed key.

For a destructive-action check, create a custom agent with `memory_enabled: true` and `enabled_tools: ["delete_document"]`, create an agent conversation, and invoke it with that `conversation_id` and an owned `document_id` in the request context. The stream or invoke response should return a pending approval without deleting the file. List the approval, then approve or reject it and resume:

```bash
curl -b agent-cookies.txt http://localhost:8000/agents/AGENT_ID/approvals

curl -b agent-cookies.txt -X POST http://localhost:8000/agents/AGENT_ID/approvals/APPROVAL_UUID/approve \
  -H 'Origin: http://localhost:3000'

curl -N -b agent-cookies.txt -X POST http://localhost:8000/agents/AGENT_ID/approvals/APPROVAL_UUID/resume \
  -H 'Origin: http://localhost:3000'
```

Use `/reject` instead of `/approve` to verify that the document remains. The approval ID comes from the approval response; there is no client-supplied tool argument or checkpoint thread ID in this flow.

### Limits and security considerations

The defaults are 4,000 message characters, 20 selected documents, a 90-second execution/provider request timeout, and a 16-step LangGraph recursion limit. Each setting is configurable through the `CUSTOM_AGENT_*` environment variables above and checked against a server-side range. For safety, a custom agent executes at most one tool call from each model response; the graph's `max_concurrency` remains bounded as an additional runtime limit. These controls do not replace production rate limiting, quotas, or provider spend controls.

Invocation and streaming run synchronous LangGraph/provider/tool work in worker threads so they do not block the ASGI event loop. Model SDK request timeouts and a server-side execution deadline are configured. Python cannot forcibly terminate a synchronous SDK or external tool call already in progress; after a client disconnect or deadline, cancellation is cooperative between graph events and a daemon worker may continue until that call returns. Tool execution is serialized per model response and remains bounded by LangGraph's `max_concurrency` setting.

Document content selected for a run can be sent to the configured model provider. Web/research tools can send query text to Tavily, and summarization/comparison/report tools may send extracted document content to the configured Groq service. Keep provider data-retention terms in mind and enable only tools needed for the agent. Retrieved document and web text are treated as untrusted input, but prompt-injection risks cannot be eliminated by prompt instructions alone; SQL ownership checks and the server tool allowlist remain the authorization boundary.

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

**Locally verified results:** backend tests passed (**214 passed**), Ruff lint passed, and Ruff format check is checked separately for the current source tree. Frontend regression tests passed (**1 passed**), ESLint and TypeScript checks passed, and the production Next.js build completed in the prior frontend verification. The frontend production dependency audit reported no vulnerabilities; the full development dependency audit reported moderate advisories in a transitive lint-tool dependency. These are local results, not a claim that the hosted GitHub Actions workflow has run.

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
