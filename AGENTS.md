# AGENTS.md — Instructions for AI Coding Agents

> This file is the working agreement between the project owner (a learner) and any
> AI agent operating in this repository — Codex, OpenCode, Antigravity, or similar.
> If an agent's default behavior conflicts with this file, **this file wins**.

---

## 0. How to use this file

1. Read this file completely before doing anything.
2. Treat `LEARNING.md` as the owner's progress log. Read the latest phase entry
   before starting work, so you know what has actually been built and understood.
3. Treat `README.md` as the public, factual description of the project. It must
   never overstate what exists.
4. When you are unsure, **ask** instead of assuming.

This file is intentionally tool-agnostic. Different agents discover it differently;
see the "Tool compatibility" note at the end.

---

## 1. Project vision

**Cognivault AI** is a full-stack, AI-powered document intelligence and research
workspace. The end goal is a workspace where a user can:

- upload documents and have their text extracted,
- chat with an LLM about those documents,
- ask questions answered with retrieval-augmented generation (RAG) grounded in
  their own files,
- run a multi-step research agent that gathers and synthesizes information,
- keep chat history organized into workspaces.

The project is **also a learning vehicle**. The owner is building it to become an
independent AI/software engineer. Understanding matters more than speed, feature
count, or looking impressive on GitHub.

### Definition of success

- The owner can explain every part of the system without reading the code.
- The architecture stays small, readable, and replaceable.
- Each phase ends with working software, an honest status update, and a journal entry.

---

## 2. Technology stack

| Layer | Choice | Status |
| --- | --- | --- |
| Frontend | Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui | implemented (no shadcn/ui components added) |
| Backend | Python, FastAPI, Pydantic | implemented |
| Database | PostgreSQL, SQLAlchemy, Alembic | implemented |
| AI orchestration | LangChain, LangGraph, LLM APIs | implemented (Groq provider) |
| Retrieval | PostgreSQL + pgvector | implemented (all-MiniLM-L6-v2, 384-dim) |
| OCR | Tesseract or EasyOCR | implemented with Tesseract |
| Authentication | JWT | implemented (JWT in an HttpOnly cookie + revocable server-side sessions) |

### Stack rules

- Do not introduce a new framework or library if the stack above already solves
  the problem.
- Do not add a dependency without stating: **(a)** what job it does, **(b)** why
  the current stack cannot do that job, **(c)** its maintenance and license status.
- Pin versions only in the phase that introduces them. Do not pre-install
  "convenience" libraries.
- Prefer official documentation as the source of truth. Prefer the simplest tool
  that works.

---

## 3. Planned architecture (target — most of this does not exist yet)

```text
Browser
  │  HTTPS / JSON
  ▼
Next.js frontend  (App Router: server components + client components)
  │  fetch() → REST API
  ▼
FastAPI backend
  ├── API layer      (routers, request/response validation)
  ├── Service layer  (business logic, orchestration)
  ├── Data layer     (SQLAlchemy models, Alembic migrations)
  ├── AI layer       (LLM calls, LangChain / LangGraph — added in later phases)
  └── Storage layer  (uploaded files on disk)
        │
        ▼
  PostgreSQL + pgvector
```

### Architecture principles

- The **backend owns data and business rules**. The frontend owns presentation only.
- The frontend must never talk to PostgreSQL directly.
- The frontend must never call an LLM provider directly — API keys must never
  reach the browser bundle.
- The REST API is the only coupling point between frontend and backend.
- Keep layers thin. A layer earns its existence when it has a real job; avoid
  layers that only forward calls.
- Long-running work (parsing, OCR, agent runs) will eventually need a background
  strategy, but not before it is actually slow enough to matter.

---

## 4. Code organization guidelines

### Current repository layout

```text
cognivault-ai/
├── AGENTS.md
├── README.md
├── LEARNING.md
├── .gitignore
├── docker-compose.yml
├── .github/workflows/ci.yml
├── frontend/        # Next.js app router, components, lib, Dockerfile
└── backend/         # FastAPI app, alembic, scripts, tests, Dockerfile
```

The layout below is what actually exists. It differs from the original plan:
routers live in `app/routers/`, the ORM models and Pydantic schemas are single
modules (`models.py`, `schemas.py`), and the agent lives in `app/agents/`.

### Backend layout

```text
backend/
├── app/
│   ├── main.py            # FastAPI app, middleware, routers
│   ├── routers/           # auth.py, documents.py, rag.py, agent.py
│   ├── core/              # config, security, dependencies, csrf, rate_limit, context
│   ├── agents/            # graph.py (LangGraph), persistence.py (lifespan)
│   ├── services/          # extraction, OCR, retrieval, tools, conversations, uploads
│   ├── models.py          # SQLAlchemy ORM models
│   └── schemas.py         # Pydantic request/response models
├── alembic/               # migrations
├── scripts/               # operator scripts
├── tests/
├── pyproject.toml
└── .env.example
```

### Frontend layout

```text
frontend/
├── app/
│   ├── (workspace)/       # protected route group: /, /agent, /research, /settings
│   ├── login/, register/
│   ├── globals.css
│   └── layout.tsx
├── components/            # AppShell, Sidebar, AgentWorkspace, AuthGuard, Toast, icons
├── lib/                   # api.ts, auth-api.ts, agent-api.ts
├── public/
├── next.config.ts         # /backend proxy, standalone output
└── Dockerfile
```

### Organization rules

- One module, one responsibility. If a file needs "and" to describe it, split it.
- Dependencies point inward: `api → services → models`. Never `models → api`.
- No circular imports. If you need one, the boundaries are wrong.
- Configuration lives in one place per app (`core/config.py`, `src/lib/config.ts`).
- Do not pre-create empty folders "for later". Add structure when the code needs it.
- Name files after what they contain, not after patterns (`documents.py`, not
  `helpers2.py`).
- Comments explain **why**, not **what**. If the code needs a comment to explain
  what it does, rename things instead.

---

## 5. Python coding conventions (backend)

- Target Python 3.13 (installed locally). Use a project-local virtual environment.
- Follow PEP 8: 4-space indentation, `snake_case` functions/variables/modules,
  `PascalCase` classes, `UPPER_SNAKE_CASE` constants.
- **Type hints on every public function and method.** Return types included.
- Use **Pydantic v2** models for anything crossing a boundary (HTTP, config, LLM
  output). Never pass raw `dict` through layers when a model is clearer.
- Keep SQLAlchemy models separate from Pydantic schemas. An ORM object is not a
  response body.
- Prefer `async def` for I/O-bound endpoints; keep CPU-heavy work out of the event
  loop.
- Use the `logging` module. No `print()` in application code.
- No bare `except:` and no silently swallowed exceptions. Catch specific types and
  log with context.
- No mutable default arguments (`def f(x=[])`).
- Settings come from environment variables through a single settings object
  (`pydantic-settings`), not `os.getenv()` scattered across files.
- Formatting and linting: `ruff format` and `ruff check` once tooling is added.
- Imports grouped: standard library, third-party, first-party.

---

## 6. TypeScript coding conventions (frontend)

- `strict: true` in `tsconfig.json`. Do not disable it to make errors disappear.
- **No `any`.** Use `unknown` and narrow it, or define a real type.
- Server components by default; add `"use client"` only when the component needs
  state, effects, or browser APIs.
- Keep components small and presentational. Data fetching and business rules go in
  server components, route handlers, or `src/lib/`.
- One exported component per file; file name matches the component
  (`ChatMessage.tsx`).
- Shared API types live in `src/types/`. All HTTP calls go through one API client
  module (`src/lib/api.ts`), not scattered `fetch` calls.
- Environment variables: only `NEXT_PUBLIC_*` values may reach the browser, and
  only for non-secret configuration. Secrets stay server-side.
- No default exports for utility functions; use named exports. (Next.js requires
  default exports for pages/layouts — that is the exception.)
- Avoid barrel files (`index.ts` re-exporting everything) unless a real need appears.
- Formatting and linting: the Next.js ESLint/Prettier defaults introduced in Phase 1.

---

## 7. API design guidelines

- Base path is versioned: `/api/v1/...`. Breaking changes require a new version.
- Resources are plural nouns, lowercase, hyphenated: `/api/v1/documents`,
  `/api/v1/chat-sessions`.
- Use HTTP methods for intent: `GET` read, `POST` create/action, `PATCH` partial
  update, `DELETE` remove. No verbs in paths (`/getDocuments` is wrong).
- Use meaningful status codes: `200`, `201`, `204`, `400`, `401`, `403`, `404`,
  `409`, `422`, `500`.
- Validate input at the edge with Pydantic. Validate output with `response_model`.
- Never return ORM objects directly. Never return stack traces to clients.
- Pick one error shape and keep it everywhere (FastAPI's `{"detail": ...}` is fine
  until a real need for more structure appears).
- Pagination: `limit` + `offset` query parameters with a total count, or cursor
  pagination if a concrete performance need appears. Do not invent both.
- Every endpoint documents itself: path, purpose, request model, response model,
  error cases.
- A health endpoint (`GET /api/v1/health`) exists from the first backend phase.
- Do not design endpoints for features that are not in the current phase.

---

## 8. Database and migration guidelines

- **Alembic is the only way to change a PostgreSQL schema.** Do not rely on
  `Base.metadata.create_all()` at runtime for real databases.
- `alembic revision --autogenerate` produces a **draft**. Always read the generated
  file and fix it before committing.
- One logical change per migration. Use descriptive messages
  (`add_documents_table`, not `update`).
- Never edit a migration that has been applied or shared. Add a new one.
- Every migration must have a working `downgrade()`.
- Test both `alembic upgrade head` and `alembic downgrade -1` locally before
  declaring the migration done.
- Set explicit constraint/index naming conventions in SQLAlchemy metadata so future
  autogenerate output stays stable.
- pgvector is enabled through a migration (`CREATE EXTENSION IF NOT EXISTS vector`),
  not by hand on one developer machine.
- Do not add indexes "just in case". Add them when a query or measurement needs them.

---

## 9. Security and environment-variable rules

- **Never commit secrets.** `.env` and `.env.*` are git-ignored; `.env.example`
  (placeholders only) is committed.
- No secret in source code, tests, fixtures, logs, screenshots, or commit messages.
- The backend reads configuration from the environment through one settings object.
- The frontend may only use `NEXT_PUBLIC_*` variables, and only for non-secret
  values (e.g. the public API base URL).
- CORS: an explicit allowlist of origins. Never `allow_origins=["*"]` together with
  credentials.
- File uploads: validate type and size, generate safe storage names, store outside
  the web root, and never execute or render user-supplied content unsafely.
- SQL: use SQLAlchemy constructs or parameterized queries. Never interpolate user
  input into SQL strings.
- Logs: no PII, tokens, or document contents by default. Log identifiers and
  request IDs instead.
- Auth (implemented): short-lived JWTs signed with a ≥32-character secret, Argon2
  password hashes, tokens never logged. The JWT lives in an HttpOnly cookie and is
  backed by a revocable `auth_sessions` row; never store tokens in `localStorage`.
- Rate-limit endpoints that cost money (LLM calls) once they exist.
- Dependency updates are deliberate. No blind bulk upgrades.

---

## 10. Testing expectations

- **Backend:** `pytest` with `httpx.AsyncClient` against the FastAPI app. Tests do
  not hit real LLM APIs or the network; use fakes/mocks.
- **Frontend:** Vitest + React Testing Library when there is component logic worth
  testing. Not every component needs a test file.
- Test **behavior**, not implementation details. Test names describe expected
  behavior (`test_health_returns_ok`).
- Every phase must end with at least one automated smoke test that proves the
  phase's main claim.
- Bug fix = regression test first, then the fix.
- Run the full test suite and report the real output before marking a phase done.
  If tests fail, say so.

---

## 11. Development phases

| Phase | Goal | Status |
| --- | --- | --- |
| 0 | Repository documentation and structure | done |
| 1 | Next.js and FastAPI communicate (health check + one fetch) | done |
| 2 | PostgreSQL + SQLAlchemy + Alembic integration | done |
| 3 | Document upload and text extraction | done |
| 4 | AI chat with an LLM | done |
| 5 | RAG-based document Q&A with pgvector | done |
| 6 | OCR and structured document extraction | done |
| 7 | LangGraph research agent | done |
| 8 | Chat history and user workspaces | done |
| 9 | JWT authentication and security hardening | done |
| 10 | Full test pass and deployment | tests, Docker and CI configuration done; deployment not performed |

Rules:

- Do not work on phase *n+1* while phase *n* is not verified.
- Do not create files "needed later" during an earlier phase.
- A phase is done only when its checklist in `LEARNING.md` is complete and the
  owner can explain what was built.

---

## 12. Mandatory learning-first workflow

This is the core rule of the project. Follow it on every task.

1. **Propose before building.** State the task, why it matters, and what "done"
   means. Keep the scope small enough to finish and explain in one sitting.
2. **Get approval on scope** before writing application code.
3. **Explain commands before running them.** For every terminal command: what it
   does, what it changes, and how to undo it if relevant. Do not run installs or
   destructive commands without explicit approval.
4. **The owner writes the application code.** Provide structure, hints, references,
   and reviews — not finished implementations.
5. **Hints before solutions.** When the owner is stuck, give the smallest useful
   hint, then a stronger one. Provide a full solution only when they ask for it or
   after a genuine attempt.
6. **Review with reasons.** Point to the line, explain the risk or improvement, and
   cite the concept (e.g. "this is an N+1 query").
7. **Verify, don't assume.** Run the build/tests/linters when possible. Never say
   "done" without evidence.
8. **Close the loop.** Remind the owner to fill in `LEARNING.md` for the phase.

Communication style: beginner-friendly, define jargon on first use, prefer plain
language, use diagrams when they clarify, avoid unexplained commands.

---

## 13. Anti-overengineering and scope discipline

- **Never build a feature that was not requested.** This includes "small"
  conveniences, extra endpoints, and speculative abstractions.
- YAGNI by default. Apply the rule of three before abstracting.
- No microservices, message queues, caches, Docker Compose stacks, or orchestration
  layers until a measured problem requires them.
- No authentication, roles, or multi-tenancy before Phase 9.
- No premature performance optimization. Measure first.
- No generated boilerplate the owner cannot explain line by line.
- No patterns by name ("repository pattern", "CQRS") unless they clearly earn their
  place in this codebase.
- When tempted to add something, ask: *does this phase's definition of done need it?*
  If no, skip it and mention it as a future consideration.

---

## 14. Definition of done (per phase)

A phase is complete only when all of these are true:

- [ ] The app runs locally with documented commands.
- [ ] The phase's main behavior is demonstrated (manually and/or by a smoke test).
- [ ] Tests and linters pass; actual output was shown.
- [ ] No secrets, debug leftovers, or commented-out code were committed.
- [ ] `README.md` status/roadmap reflects reality.
- [ ] `LEARNING.md` has a filled-in entry for the phase.
- [ ] The owner can explain the flow end to end.

---

## 15. Tool compatibility

`AGENTS.md` is a cross-tool convention. Behavior differs between tools and should
be verified against current documentation:

- **Codex** reads `AGENTS.md` from the repository root (and nested directories) as
  its instruction file.
- **OpenCode** also supports `AGENTS.md` at the project root and can be pointed at
  global instructions; verify its current discovery order in the OpenCode docs.
- **Antigravity** is a newer agentic IDE. Its support for `AGENTS.md` and any
  required project-level configuration file should be verified in its docs rather
  than assumed.

If a tool ignores this file, reference it explicitly in the task prompt
("follow AGENTS.md") or copy the relevant rules into that tool's own instruction
file. Do not maintain two divergent rule sets: this file is the source of truth.
