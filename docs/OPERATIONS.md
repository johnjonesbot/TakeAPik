# Operations runbook

## Processes

| Process | Command | Notes |
|---|---|---|
| Web | `npm run start` | Next.js standalone server |
| Worker | `npm run worker` | Long-running; drains `jobs` with SKIP LOCKED claims |
| Cron worker | `npm run worker:once` | Alternative to the long-running worker on constrained hosts |
| Housekeeping | `npm run cleanup` | Daily cron: abandoned uploads, expired exports/handoffs/sessions, old jobs |
| Migrations | `npm run db:migrate` | Run before starting new code; concurrency-safe (advisory lock) |

## Backup and restore

- Back up PostgreSQL with `pg_dump -Fc "$DATABASE_URL" > takeapik-$(date +%F).dump` daily; keep 30 days.
- Object storage holds originals under `tenants/{tenantId}/photos/`; rely on the provider's versioning or replication. Exports are disposable.
- Restore rehearsal (do this quarterly, against a scratch database):
  1. `createdb takeapik_restore && pg_restore -d takeapik_restore takeapik-<date>.dump`
  2. Point a staging app at it, sign in, confirm a gallery renders and an object URL resolves.
  3. Record the time it took; that is your current RTO.
- A database restore without the bucket loses no photo bytes; a bucket loss without the database loses everything meaningful. Protect the bucket first.

## Rollback

Deploys are git-SHA based: keep the previous build output, and roll back by starting the prior standalone build. Migrations are forward-only — write a new migration to undo a change rather than editing an applied file (the runner rejects edited applied migrations by checksum).

## Certificates and DNS

- Wildcard cert for `*.takeapik.com` plus apex; auto-renew (Let's Encrypt DNS-01) and alert two weeks before expiry.
- Reverse proxy must replace (never append) forwarded host headers; only `takeapik.com` and one label beneath it are served.

## Monitoring baseline

- Uptime checks: `GET /api/health` (process) and `GET /api/ready` (database) every minute from two regions.
- Synthetic tenant: keep a `synthetic` tenant with one member; a scheduled probe logs in and loads one gallery page hourly. Alert on failure.
- Log-based alerts (all logs are JSON): any `level":"error"`, repeated `job failed`, and `auth.*.failure` bursts (possible credential stuffing).
- Watch `jobs` for `status = 'dead'` rows (dead-letter) — page the operator; each row carries `last_error`.
- Disk/database growth: `photos`, `audit_logs`, and bucket size monthly review.

## Incidents

1. Declare: note UTC time, symptom, and blast radius (one tenant or all).
2. Stabilize: prefer disabling a feature (e.g. stop the worker) over restarting the database.
3. For a suspected credential/token leak: rotate `SESSION_SECRET` + `TOKEN_HASH_PEPPER` (invalidates all sessions and requires re-login), rotate S3 keys, then audit `audit_logs` for the window.
4. Postmortem within a week; add the failure mode to tests or monitoring.

## Retention (current policy)

| Data | Retention |
|---|---|
| Pending/rejected uploads | 24 h, then deleted with objects (`cleanup`) |
| Export archives | 7 days after completion |
| Sessions | 30 days after expiry |
| Succeeded/dead jobs, idempotency keys | 30 days |
| Audit logs | Indefinite until a legal/privacy review sets a limit |
| Archived tenant media | Kept until the documented super-admin deletion runbook is executed |
