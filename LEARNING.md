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
