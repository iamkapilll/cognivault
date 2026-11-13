# Cognivault AI — Learning Journal

This is my personal engineering journal. Its purpose is to make sure I can explain
what I built, not just that it runs. Each phase gets one entry, filled in by me
while and after building.

## How I use this journal

- One section per phase, in order. Never delete or rewrite old entries; append
  corrections if I later learn something was wrong.
- Write in my own words. If I cannot explain it, I do not understand it yet.
- Record real commands I ran and real errors I hit — not idealized versions.
- Commit the entry together with the phase's code.
- A phase is not finished until its checklist is fully checked.

## Entry template

Copy this block for every new phase.

```markdown
## Phase N — <Short title>

**Date:** YYYY-MM-DD
**Status:** not started | in progress | done
**Time spent:** <optional>

### Topic
What area of the system this phase covers, in one or two sentences.

### What problem are we solving?
Why this phase exists. What was impossible or painful before it.

### Concepts to understand
- Concept — one-line definition in my own words.
- ...

### How it works internally
The request/data flow end to end. Where data enters, where it is transformed,
where it is stored, and what the user sees.

### Commands and their explanations
| Command | What it does | Why I used it |
| --- | --- | --- |
| `...` | ... | ... |

### Code I wrote
Short excerpts with file paths, plus one sentence on why it looks like this.
(Not the whole file — the interesting parts.)

### Bugs encountered
For each bug: symptom → my hypothesis → what I tried → cause → fix.

### How I fixed them
The final fix, and how I confirmed it worked.

### What I learned
Three to five bullets. Include one thing that surprised me.

### Questions I still have
Open questions, with a note on how I plan to answer them.

### Completion checklist
- [ ] The phase's main behavior works locally.
- [ ] I ran the tests/smoke check and saw them pass.
- [ ] I can explain the end-to-end flow without reading code.
- [ ] README status/roadmap updated if needed.
- [ ] No secrets or debug leftovers committed.
```

---

# Phase 0 — Repository documentation and structure

**Date:** 2026-11-08
**Status:** in progress
**Time spent:** —

### Topic
Project scaffolding: documentation, instruction files for AI agents, ignore rules,
and the empty `frontend/` and `backend/` boundaries. No application code.

### What problem are we solving?
Before writing code, I need a shared source of truth for *what* is being built,
*how* agents should behave, and *where* my own learning gets recorded. Without it,
an AI agent will happily generate an entire app I do not understand, and the
project will drift.

### Concepts to understand
- **`AGENTS.md`** — a file that tells AI coding agents the rules of this repository.
- **Repository root** — the top-level folder Git tracks; tool configuration files
  are usually discovered from here.
- **`.gitignore`** — patterns for files Git should never track (secrets, build
  output, caches).
- **`.env.example`** — a committed file listing required environment variables with
  fake values, so others know what to configure.
- **`.gitkeep`** — an empty placeholder file whose only purpose is to make Git track
  a folder that has no real content yet.
- **Monorepo (two apps, one repo)** — `frontend/` and `backend/` live together and
  are versioned together, but remain independently runnable.

### How it works internally
Git tracks *files*, not directories: an empty folder is invisible to Git. Placing
`.gitkeep` inside `frontend/` and `backend/` gives Git something to track, so the
folder structure survives a clone. Meanwhile `.gitignore` is evaluated top-down,
and later negation rules (`!.env.example`) re-include files that earlier patterns
would have excluded.

### Commands and their explanations
| Command | What it does | Why I used it |
| --- | --- | --- |
| — | No commands run in this phase (documentation only) | — |

### Code I wrote
No application code. Files created:

- `AGENTS.md` — agent rules and project conventions
- `README.md` — public project description and roadmap
- `LEARNING.md` — this journal
- `.gitignore` — ignore rules for Python, Node/Next.js, env files, logs, OS files
- `frontend/.gitkeep`, `backend/.gitkeep` — placeholders so the folders are tracked

### Bugs encountered
None yet.

### How I fixed them
Not applicable.

### What I learned
- A `.gitignore` can re-include files with `!` patterns; order matters.
- Writing the rules down first makes it much harder for an agent to over-build.
- Documentation that overstates progress is worse than no documentation.

### Questions I still have
- Do Codex, OpenCode, and Antigravity all read `AGENTS.md` automatically, or do
  some need a pointer/configuration file?
- Where exactly will secrets live in local development (`.env` per app, or one
  root `.env`)?

### Completion checklist
- [x] Documentation files created.
- [x] `frontend/` and `backend/` exist and are trackable by Git.
- [ ] Git repository initialized and first commit made (pending my decision).
- [ ] All three tools confirmed to pick up `AGENTS.md`.
- [ ] I can explain why `.gitkeep` exists and why `.env.example` is not ignored.

---

# Phase 1 — Next.js and FastAPI communication

**Date:** —
**Status:** not started

### Topic
Standing up the two applications and proving they can talk to each other over HTTP:
a Next.js page that fetches a small JSON response from a FastAPI endpoint.

### What problem are we solving?
Before databases, documents, or AI, the two halves of the system must be able to
exchange a request and a response. If this contract is unclear, every later feature
inherits the confusion. This phase also forces me to understand ports, HTTP,
JSON serialization, and CORS.

### Concepts to understand
- **Client vs server** — who sends the request, who answers it.
- **Port** — a numbered endpoint on a machine; two servers cannot share one port.
- **HTTP request/response** — method, path, headers, body, status code.
- **JSON** — the text format used to exchange structured data.
- **FastAPI route** — a Python function bound to a method + path.
- **CORS** — the browser rule that blocks cross-origin requests unless the server
  explicitly allows them; distinct from "the API is down".
- **Environment variable for the API base URL** — so the frontend does not hardcode
  `localhost:8000`.
- **`fetch` in Next.js** — server-side vs client-side fetching, and why the choice
  affects CORS.

### How it works internally
1. The browser requests a Next.js page.
2. The page (or a client component) sends `fetch("http://localhost:8000/api/v1/health")`.
3. FastAPI matches the route, runs the handler, and serializes the return value to JSON.
4. The browser receives the response. If the request was cross-origin and the
   backend did not send the right CORS headers, the browser blocks the *response*
   even though the server answered.
5. The page renders the value.

### Commands and their explanations
| Command | What it does | Why I used it |
| --- | --- | --- |
| _(fill in: create the Next.js app)_ | _(what it scaffolds, what it writes to disk)_ | _(why this command)_ |
| _(fill in: create and activate the Python virtual environment)_ | _(isolates dependencies for this project)_ | _(why)_ |
| _(fill in: install backend dependencies)_ | _(writes them where? what changes?)_ | _(why)_ |
| _(fill in: run the FastAPI dev server)_ | _(starts the app on a port, reload behavior)_ | _(why)_ |
| _(fill in: run the Next.js dev server)_ | _(starts the frontend on a port)_ | _(why)_ |

### Code I wrote
- _(file path)_ — _(what it does, one sentence)_

### Bugs encountered
- _(symptom → hypothesis → what I tried → cause → fix)_

### How I fixed them
- _(fix + how I confirmed it)_

### What I learned
- _(fill in)_

### Questions I still have
- _(fill in)_

### Completion checklist
- [ ] Next.js dev server runs and renders a page.
- [ ] FastAPI serves `GET /api/v1/health` returning JSON.
- [ ] The Next.js page displays data fetched from FastAPI.
- [ ] I hit or deliberately reproduced a CORS failure and can explain the fix.
- [ ] I can explain the difference between the frontend and backend ports.
- [ ] At least one smoke test exists and passes.
- [ ] API base URL comes from an environment variable, not a hardcoded string.
- [ ] No secret is exposed in the browser bundle.



## Phase 1 — FastAPI Basics

### What I learned
- FastAPI is a Python framework for building APIs.
- Uvicorn is an ASGI server.
- A GET endpoint returns data to a client.
- A Python dictionary can be serialized into JSON.

### Commands
- python -m venv .venv
- python -m pip install fastapi "uvicorn[standard]"
- uvicorn app.main:app --reload

### My implementation
Explain how my /health endpoint works.

### Problems encountered
Record errors and their solutions.


## Phase 1 — Step 2: Next.js Setup

### Goal
Initialize the frontend of Cognivault AI.

### Concepts
- React vs Next.js
- TypeScript
- App Router
- Development server
- package.json

### Commands
Record the commands I used and explain each.

### What I understood
Explain what happens when I visit localhost:3000.

### Problems
Record errors and how I solved them.



## Phase 1 — Next.js + FastAPI Integration

### What we built
A Next.js frontend that communicates with FastAPI
using an HTTP GET request.

### How it works
1. The browser loads the Next.js page.
2. React executes useEffect after mounting.
3. fetch() sends a GET request to FastAPI.
4. Uvicorn receives the request.
5. FastAPI executes the /health endpoint.
6. FastAPI returns JSON.
7. React stores the response using useState.
8. The UI re-renders and displays the result.

### Concepts learned
- HTTP: Communication protocol between client and server.
- REST API: An API style based on resources and HTTP.
- JSON: Data exchange format.
- CORS: Browser-enforced cross-origin access rules.
- useState: Stores React component state.
- useEffect: Runs effects after rendering.
- fetch: Browser API for HTTP requests.
- async/await: Syntax for working with Promises.

### Architecture
Next.js (3000) -> HTTP GET -> FastAPI (8000)
FastAPI -> JSON response -> Next.js

### Next milestone
Connect FastAPI to PostgreSQL using SQLAlchemy.




## Phase 3 — Next.js Document Dashboard

### What we built
A document dashboard connected to FastAPI and PostgreSQL.

### Features
- Create document metadata
- Retrieve document records
- Display document list
- Loading and error states
- Persistent data after refresh

### Concepts learned
- GET and POST HTTP requests
- React state management
- useEffect and useState
- Controlled form inputs
- JSON.stringify
- API helper functions
- Rendering lists using map()
- Database persistence

### Full-stack data flow
1. User enters a filename in Next.js.
2. React handles the form submission.
3. fetch() sends a POST request to FastAPI.
4. Pydantic validates the request.
5. SQLAlchemy inserts the record.
6. PostgreSQL stores the document metadata.
7. FastAPI returns the saved document.
8. Next.js fetches the updated list.
9. React displays the new record.

### Next milestone
Implement actual PDF uploads, file storage,
and text extraction using FastAPI.









## Phase 4 — PDF Upload and Text Extraction

### Technologies
- FastAPI UploadFile
- python-multipart
- PyMuPDF
- SQLAlchemy
- PostgreSQL
- Next.js FormData

### What I built
- Real PDF file upload
- PDF validation and size limit
- Unique stored filenames using UUID
- Local PDF storage
- Text extraction using PyMuPDF
- Page count extraction
- Document processing status
- PostgreSQL metadata and text storage
- View extracted text in Next.js

### Important concepts
1. multipart/form-data sends files over HTTP.
2. UploadFile receives uploaded files in FastAPI.
3. FormData packages files in the browser.
4. UUIDs prevent stored filename collisions.
5. PyMuPDF extracts selectable PDF text.
6. SQLAlchemy saves extracted text and metadata.
7. Alembic updates the database schema.
8. Scanned PDFs require OCR.

### Data flow
Next.js
  -> FormData
  -> FastAPI UploadFile
  -> PDF validation
  -> Local file storage
  -> PyMuPDF extraction
  -> SQLAlchemy
  -> PostgreSQL
  -> Next.js dashboard

### Next phase
OCR for scanned PDFs and document images.








## Phase 5 — OCR and Document Analysis

### Technologies
- Tesseract OCR
- pytesseract
- Pillow
- PyMuPDF
- FastAPI
- PostgreSQL

### What I built
- Image document uploads (JPG, PNG)
- OCR for scanned PDF pages
- Hybrid PDF text extraction
- Basic document classification
- Candidate field extraction using regex
- Document analysis endpoint
- Human-review status tracking

### Concepts learned
1. OCR converts images of text into machine-readable text.
2. PyMuPDF extracts selectable PDF text.
3. Tesseract recognizes text from rendered images.
4. Hybrid extraction combines PDF text extraction and OCR.
5. Regex identifies text patterns such as emails.
6. Document classification can begin with rules.
7. Extraction is different from verification.
8. Human review is necessary for uncertain results.

### Architecture
Next.js Upload
  -> FastAPI
  -> File Validation
  -> PyMuPDF / Tesseract
  -> Document Analysis
  -> SQLAlchemy
  -> PostgreSQL
  -> Dashboard

### Next
RAG pipeline using chunking, embeddings,
pgvector, and semantic retrieval.







## Phase 6 — RAG with PostgreSQL + pgvector

### Technologies
- FastAPI
- PostgreSQL
- pgvector
- SQLAlchemy
- Alembic
- sentence-transformers
- all-MiniLM-L6-v2
- LangChain Text Splitters
- Groq LLM
- Next.js

### What I built
1. Document text chunking
2. Local embedding generation
3. Vector storage in PostgreSQL
4. Semantic similarity search
5. Document-specific retrieval
6. LLM answer generation
7. Source passage display
8. RAG frontend workspace

### Concepts learned
- RAG = Retrieval-Augmented Generation
- Chunking splits documents into smaller passages.
- Chunk overlap helps preserve context.
- Embeddings represent text as numerical vectors.
- pgvector stores vectors in PostgreSQL.
- Cosine distance measures vector similarity.
- Semantic search retrieves related passages.
- Retrieved context grounds LLM answers.
- Source citations help inspect answers.

### Indexing pipeline
Extracted Text
 -> Text Splitter
 -> Embedding Model
 -> 384-Dimensional Vectors
 -> PostgreSQL pgvector

### Question-answering pipeline
User Question
 -> Query Embedding
 -> Cosine Similarity Search
 -> Top-K Relevant Chunks
 -> Groq LLM
 -> Answer + Sources

### Current limitations
- Indexing is manually triggered.
- No authentication or user isolation.
- No background processing.
- No vector search index for large datasets.
- No retrieval relevance threshold.
- No formal RAG evaluation.
- No conversation memory yet.

### Next
Phase 7 — LangGraph AI Agents.








## Phase 7 — LangGraph AI Agents

### Technologies
- LangGraph
- LangChain Core
- ChatGroq
- Tavily Search
- PostgreSQL Checkpointer
- FastAPI
- Next.js

### What I built
1. Stateful AI agent using StateGraph
2. Document search tool using pgvector
3. Web search tool using Tavily
4. Tool calling with ToolNode
5. Conditional routing with tools_condition
6. Persistent conversation checkpoints
7. Human approval using interrupt()
8. Resume execution using Command(resume=...)
9. Next.js agent chat interface

### Important concepts

StateGraph:
Defines nodes and edges of an agent workflow.

MessagesState:
Maintains conversation messages between graph nodes.

ToolNode:
Executes tool calls requested by the LLM.

tools_condition:
Routes execution based on whether the LLM
requested tools.

Checkpointer:
Persists graph state across API requests.

thread_id:
Identifies a specific conversation.

interrupt():
Pauses execution until human input is provided.

Command(resume=...):
Resumes a previously interrupted graph.

### Agent workflow
User Message
 -> LangGraph
 -> LLM
 -> Tool Decision
    -> Document Search
    -> Web Search
    -> Approval-Protected Deletion
 -> LLM Response
 -> PostgreSQL Checkpoint
 -> Next.js

### Current limitations
- No user authentication or document ownership checks
- No secure multi-user isolation
- No thread-history UI
- No streaming responses
- No background agent jobs
- No LangSmith observability
- No production-grade action authorization

### Next improvements
1. Conversation history and thread restoration
2. Streaming agent responses
3. LangSmith tracing and debugging
4. Authentication and document ownership
5. Stronger approval workflows
6. Testing, Docker, and deployment


## Phase 8 - Accounts, ownership, history and streaming

> Summary written during the completion pass. Rewrite it in your own words once
> you have re-read the code; the point of this journal is that you can explain it.

### What was built
- Email/password accounts with Argon2 hashes and a JSON Web Token stored in an
  HttpOnly cookie.
- A server-side session row (`auth_sessions`) keyed by the token `jti`, so logout
  and "revoke all sessions" work immediately instead of waiting for expiry.
- Ownership columns and SQL filters so every document, chunk and conversation
  belongs to exactly one account. Foreign IDs return 404, not 403.
- Conversations stored as metadata rows; messages live in LangGraph checkpoints
  and are replayed by `thread_id`.
- Server-Sent Events streaming for the agent: tokens, tool activity, approval
  requests and a final payload.
- A protected Next.js route group `(workspace)` with a sidebar, chat history,
  documents dashboard, research page and settings page.

### The 401 bug, and why it happened
The dashboard called `/backend/documents/` with a trailing slash. Next.js
redirected to `/backend/documents`, FastAPI then answered `307` pointing at the
absolute backend host (`http://127.0.0.1:8000/documents/`), so the browser
followed a cross-origin request without the session cookie and got `401`.
Fix: `redirect_slashes=False`, canonical routes without a trailing slash, and the
frontend calling the canonical path. A regression test now asserts there is no
`Location` header on `/documents/`.

### Concepts to be able to explain
- Why an HttpOnly cookie beats `localStorage` for a session token.
- What `jti` adds compared with a plain signed token.
- Why CSRF still matters with cookies, and what `Origin` / `Sec-Fetch-Site` prove.
- Why ownership must be enforced in SQL, not in the UI.
- How `contextvars` carry the caller into tools without trusting model input.
- What `interrupt()` and `Command(resume=...)` do in a LangGraph run.
- Why the SSE producer runs in a thread and pushes into an `asyncio.Queue`.
- Why the model is told the attached document IDs instead of asking for them.

### Verified with real evidence
- pytest: 51 passed; Ruff lint and format check clean.
- `tsc --noEmit`, `eslint`, `next build` clean (7 routes).
- Live browser: register, reload, dashboard, agent, upload, grounded answer,
  history after reload, approval -> deletion, logout -> login.
- Live API: cross-user document and conversation access -> 404.
- Alembic: `upgrade head`, `downgrade -1`, re-`upgrade head` all succeeded.

### Limitations I know about
- Attachments must be uploaded from the composer; there is no library picker.
- Deleting a conversation leaves its checkpoint rows behind.
- Rate limiting lives in process memory.
- Extraction and embedding run inside the upload request.
- Legacy documents without an owner stay invisible until assigned with
  `scripts/assign_legacy_documents.py`.

## Phase 9 - Hardening, tests and deployment configuration

### What was built
- CSRF middleware, login/registration rate limits, password policy, security
  headers, upload filename/path hardening, and 404-based isolation.
- A pytest suite for the security primitives and the HTTP surface.
- Pinned `requirements.txt` / `requirements-dev.txt` and Ruff configuration.
- `backend/.env.example`, Dockerfiles for both apps, `.dockerignore` files,
  `docker-compose.yml` and a GitHub Actions CI workflow.

### What is not done yet
The Docker images were not built because the local Docker daemon was not running;
only `docker compose config` was validated. Nothing is deployed. Deployment and a
first `docker compose up --build` are the next real step.
