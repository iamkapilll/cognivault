# Cognivault AI

An AI-powered document intelligence and research workspace.

Cognivault AI is a full-stack application for working with your own documents:
upload them, extract their contents, chat with an LLM about them, ask questions
grounded in their content (RAG), and run multi-step research workflows.

> **Project status: initial setup.**
> Only repository documentation exists at the moment. There is no application
> code, no database, and no running service yet. Everything described below under
> "Planned features" is a plan, not a shipped capability.

---

## Planned features

All items below are **planned**. Checkboxes are updated only when a feature is
actually implemented and verified.

- [ ] **Dashboard** — a Next.js dashboard for navigating documents, chats, and workspaces
- [ ] **REST API** — a FastAPI backend exposing documented, versioned endpoints
- [ ] **PostgreSQL integration** — persistent storage via SQLAlchemy and Alembic migrations
- [ ] **Document upload and extraction** — store files and extract their text
- [ ] **AI chat** — conversational interaction powered by an LLM
- [ ] **RAG-based document Q&A** — answers grounded in retrieved chunks via pgvector
- [ ] **OCR and structured extraction** — read scanned documents and extract structured fields
- [ ] **Research agent** — a multi-step LangGraph agent for research tasks
- [ ] **Chat history and workspaces** — organize conversations and documents per project
- [ ] **Authentication** — JWT-based accounts and protected resources
- [ ] **Testing and deployment** — automated tests and a reproducible deployment path

---

## Technology stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js, TypeScript, Tailwind CSS, shadcn/ui |
| Backend | Python, FastAPI, Pydantic |
| Database | PostgreSQL, SQLAlchemy, Alembic |
| AI orchestration | LangChain, LangGraph, LLM APIs |
| Retrieval | PostgreSQL with pgvector |
| OCR | Tesseract or EasyOCR (later) |
| Authentication | JWT (later) |

---

## High-level architecture

```text
Browser
  │  HTTPS / JSON
  ▼
Next.js frontend
  │  REST calls to /api/v1
  ▼
FastAPI backend
  ├── API layer      (routing, validation)
  ├── Service layer  (business logic)
  ├── Data layer     (SQLAlchemy + Alembic)
  ├── AI layer       (LangChain / LangGraph — later phases)
  └── Storage layer  (uploaded files)
        │
        ▼
  PostgreSQL + pgvector
```

Design boundaries:

- The backend owns data and business logic.
- The frontend never accesses the database directly.
- LLM provider keys stay on the server.
- The REST API is the only contract between frontend and backend.

---

## Development roadmap

| Phase | Scope | Status |
| --- | --- | --- |
| 0 | Documentation and repository structure | In progress |
| 1 | Next.js and FastAPI communication | Not started |
| 2 | PostgreSQL, SQLAlchemy, Alembic | Not started |
| 3 | Document upload and text extraction | Not started |
| 4 | AI chat | Not started |
| 5 | RAG-based document Q&A | Not started |
| 6 | OCR and structured extraction | Not started |
| 7 | LangGraph research agent | Not started |
| 8 | Chat history and workspaces | Not started |
| 9 | JWT authentication | Not started |
| 10 | Testing and deployment | Not started |

The project is built incrementally. Companion documents:

- [`AGENTS.md`](./AGENTS.md) — rules for AI coding agents working in this repository
- [`LEARNING.md`](./LEARNING.md) — the maintainer's learning journal, one entry per phase

---

## Repository structure

```text
cognivault-ai/
├── AGENTS.md
├── README.md
├── LEARNING.md
├── .gitignore
├── frontend/        # Next.js application (empty — future phase)
└── backend/         # FastAPI application (empty — future phase)
```

---

## Getting started

> **Placeholder.** These instructions will be completed in the phase that creates
> each part of the stack. They are not usable yet.

### Prerequisites (to be confirmed in Phase 1)

- Node.js 20 or newer
- Python 3.11 or newer (with a project virtual environment)
- PostgreSQL 16 or newer
- Git
- An LLM API key (only needed from the AI chat phase onward)

### Frontend setup

```bash
# TODO: documented in Phase 1
```

### Backend setup

```bash
# TODO: documented in Phase 1
```

### Environment variables

Each app will ship an `.env.example` file listing the required variables with
placeholder values. Copy it to `.env` and fill in real values locally. `.env`
files are git-ignored and must never be committed.

---

## License

Not decided yet.
