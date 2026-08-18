# TakeAPik

TakeAPik is a multi-tenant collaborative photo album for private events. Guests join with their email address and the event's eight-digit access code, then upload camera photos into a shared, full-screen masonry gallery. Event admins manage guests and invitations; a platform super-admin provisions and archives albums.

This repository is an implementation-ready foundation: a runnable glassmorphism web shell, tenant resolution and browser image-resize utilities, a PostgreSQL schema, route contracts, security rules, deployment guidance, and an ordered implementation backlog.

## Quick start

Requirements: Node.js 22+, npm 10+, and (for persistence work) PostgreSQL 16+.

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000`. For subdomain testing, use `http://jj.localhost:3000` or set `DEV_TENANT_SLUG=jj`.

## Commands

```bash
npm run dev                     # local development
npm run build                   # production build
npm run start                   # production server
npm run typecheck               # TypeScript validation
npm test                        # unit tests
npm run test:integration        # integration tests (needs the docker compose database)
npm run db:migrate              # apply db/migrations to DATABASE_URL
npm run db:bootstrap-super-admin # create the first super-admin, then unset the bootstrap vars
```

## Local database

```bash
docker compose up -d   # PostgreSQL 16 on 127.0.0.1:5432 (user/db: takeapik)
npm run db:migrate
```

Integration tests create and migrate a separate `takeapik_test` database automatically.

## Repository map

- `src/app/` — Next.js routes and UI shell
- `src/components/` — reusable interface components
- `src/lib/` — configuration, tenancy, and media utilities
- `db/schema.sql` — PostgreSQL source-of-truth schema
- `docs/` — architecture, routes, security, deployment, and phased work
- `CLAUDE.md` — instructions and guardrails for Claude Code

## Architecture at a glance

The initial release is a modular monolith: one Node process serves public, guest, admin, and super-admin surfaces while PostgreSQL enforces relational integrity and S3-compatible storage holds images. Tenant identity comes from the validated hostname and is carried explicitly through every tenant query. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Current scope

Implemented now:

- Responsive glassmorphism landing/login shell
- Tenant subdomain parsing and reserved-subdomain protection
- Client-side image validation, orientation-aware resize, and JPEG/WebP output
- Health endpoint and route-level tenant header
- Production-oriented schema and documentation
- Unit tests for tenant resolution

The authenticated product flows are intentionally captured as phased tasks rather than represented as finished. Start with [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md).

## License

Private/proprietary unless the repository owner adds a license.
