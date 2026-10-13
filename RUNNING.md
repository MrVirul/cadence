# Running Cadence

How to get every part of the monorepo running locally.

| Service            | Folder      | Port | What it is                                        |
| ------------------ | ----------- | ---- | ------------------------------------------------- |
| API                | `api/`      | 8000 | FastAPI backend (async SQLAlchemy + Postgres)     |
| Marketing site     | `site/`     | 3000 | Static landing page (TanStack Start, SSG)         |
| Customer app       | `app/`      | 3001 | The product engineers and leads use               |
| Internal console   | `internal/` | 3002 | Staff-only admin panel                            |

Front ends talk to the API at `http://localhost:8000` (set in each
`.env.development` via `VITE_API_URL`).

## Prerequisites

- Python 3.12 and [uv](https://docs.astral.sh/uv/)
- Node.js 24+ — run `nvm use` inside any front-end folder to pick up `.nvmrc`
- Postgres 16 (a Docker container is the easiest route — see below)
- [Docker](https://www.docker.com/), only needed for the local database and tests

## 1. Start Postgres

The host Postgres may be the wrong major version, so run Postgres 16 in Docker:

```bash
docker run -d --name cadence-postgres \
  -e POSTGRES_USER=chamoda \
  -e POSTGRES_DB=cadence \
  -e POSTGRES_HOST_AUTH_METHOD=trust \
  -p 5432:5432 \
  postgres:16
```

On later days just start the existing container:

```bash
docker start cadence-postgres
```

> `cadence` is the current database name baked into the container and
> `api/.env`. Keep them in sync, or change both together.

## 2. First-time setup

### API

```bash
cd api
uv sync                          # create venv + install deps
cp .env.example .env             # then edit values
uv run alembic upgrade head      # apply migrations
```

Edit `api/.env` so `SQLALCHEMY_DATABASE_URI` points at the container above,
e.g. `postgresql+asyncpg://chamoda:@localhost:5432/cadence`, and set a
non-empty `SECRET_KEY`. Leave `GOOGLE_API_KEY=` empty to run with the AI
features disabled — planning works without it.

### Front ends

`site/`, `app/`, and `internal/` each need their dependencies installed:

```bash
cd app      && npm install    # repeat in site/ and internal/
```

### Git hooks (once, from the repo root)

```bash
uv run --project api pre-commit install
```

## 3. Run everything

From the repo root, [tmuxp](https://tmuxp.git-pull.com/) builds the full dev
session (one window per service):

```bash
tmuxp load .
```

Or start services individually with each folder's `Makefile`:

```bash
cd api      && make run    # http://localhost:8000  (API docs at /app/docs)
cd site     && make run    # http://localhost:3000
cd app      && make run    # http://localhost:3001
cd internal && make run    # http://localhost:3002
```

## 4. Create a login

There is no sign-up for staff. Create a user from the CLI (add `--admin` to
grant platform-staff access for `internal/`):

```bash
cd api
uv run manage.py create-user \
  --first-name Admin \
  --last-name User \
  --email admin@example.com \
  --admin
```

The password is generated and printed unless you pass `--password`.

## Common tasks

### Tests

```bash
cd api && uv run pytest
```

Tests spin up their own Postgres 16 container via `testcontainers` — no manual
database setup, and they pass with no API key and no network.

### Migrations

Never hand-write schema SQL. Autogenerate, then review the file.

```bash
cd api
uv run alembic revision --autogenerate -m "describe change"
uv run alembic upgrade head
```

### Regenerate the typed API client

After any API change, with the API dev server running at `http://localhost:8000`:

```bash
cd app      && npm run generate    # repeat in internal/
```

Generated files are committed — do not edit them by hand.

### Lint, format, type-check

```bash
# Whole monorepo
uv run --project api pre-commit run --all-files

# A single front end
cd app && npm run validate
```

### Production builds

```bash
cd app      && make build    # -> dist/client/
cd internal && make build    # -> dist/client/
cd site     && make build    # -> dist/client/
```

The front ends are static SPAs/SSG output, deployable to a CDN (Cloudflare
Pages). Publish `dist/client/`.

## Troubleshooting

- **`SECRET_KEY cannot be empty` / `SQLALCHEMY_DATABASE_URI cannot be empty`**
  — copy `api/.env.example` to `api/.env` and fill it in.
- **Connection refused on 5432** — the Postgres container is not running:
  `docker start cadence-postgres`.
- **Port already in use** — another service is on 3000–3002 or 8000; stop it or
  pass a different `--port`.
- **AI features return `ai_unavailable`** — expected when `GOOGLE_API_KEY` is
  empty. The product still works; review and draft are just hidden/disabled.

See each folder's `README.md` for deeper detail.
