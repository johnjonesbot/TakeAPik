# Hostinger deployment plan

## Recommended topology

- Hostinger VPS or a plan that supports a persistent Node.js 22 process, custom reverse-proxy rules, cron/systemd, and TLS for the single origin (ADR-005: no wildcard or second hostname is needed).
- `takeapik.com` points to the application IP. Optionally add `www.takeapik.com` as a redirect to the canonical origin.
- Nginx terminates TLS and proxies to the Next.js standalone server on loopback.
- Managed/external PostgreSQL is preferred; if PostgreSQL runs on the VPS, bind it to localhost/private networking and maintain encrypted off-site backups.
- S3-compatible external object storage holds all media and exports.

Hostinger plan capabilities change. Confirm DNS/TLS management, Node versions, process management, database availability, backup scope, and outbound SMTP with the current control panel before purchase or launch.

## DNS and TLS

1. Add `A takeapik.com → SERVER_IP`.
2. Optionally add `A www.takeapik.com → SERVER_IP` (or a CNAME) and 301-redirect it to `takeapik.com` at the proxy.
3. Issue a certificate for `takeapik.com` (plus `www` if used). An HTTP-01 challenge is sufficient — no wildcard certificate or DNS challenge is required (ADR-005).
4. Only enable HSTS after the canonical origin serves valid HTTPS and renewal has been tested. Note the app already sends `Strict-Transport-Security` with `includeSubDomains; preload`, so any other name under the domain must also serve valid HTTPS before browsers that saw the header will load it.

## Build and release

Use an unprivileged deploy user and immutable release directories.

```bash
git fetch origin
git checkout <reviewed-commit-sha>
npm ci
npm run typecheck
npm test
npm run build
```

Then run database migrations as a separate, logged step, switch the `current` symlink to the new release, and restart web/worker processes. Do not build using production secrets; only runtime variables belong in the service environment.

For Next.js standalone output, copy `.next/standalone`, `.next/static`, and `public` into the release artifact while preserving their expected layout. Keep at least the previous release for rollback.

## Reverse proxy requirements

- Proxy HTTP/1.1 to the Node loopback port.
- Pass the original `Host`, client IP, scheme, and request ID from a trusted proxy only.
- Set an upload request-body limit slightly above application limits, although photo bytes normally go directly to object storage.
- Apply sensible header/read timeouts; exports must not stream through the web request.
- Deny direct access to dotfiles, environment files, source maps (unless intentionally private), and backup artifacts.
- Route `/api/health` for liveness. Keep dependency-rich readiness checks protected from public detail.

## Runtime configuration

Create production values from `.env.example`. Minimum external dependencies are `DATABASE_URL`, session/token secrets, S3 settings, and SMTP settings. Validate configuration at process startup and abort on placeholder/missing secrets.

Run two managed processes:

- `takeapik-web`: standalone Node server, automatic restart, graceful shutdown.
- `takeapik-worker`: job consumer with single-job locks and retry/backoff.

Use systemd or the hosting platform's process manager. Do not rely on a terminal session or the writable application filesystem.

## Database, jobs, and backups

1. Run forward-compatible migrations before code that needs them; use expand/migrate/contract for destructive changes.
2. Take an on-demand backup before schema changes.
3. Schedule daily encrypted database backups with a defined retention window and a separate storage destination.
4. Object-store versioning/lifecycle rules should protect originals and automatically expire incomplete uploads/exports.
5. Test restore to a non-production database at least quarterly.

## CI/CD stages

1. Pull request: typecheck, unit/integration tests, build, dependency audit, secret scan.
2. Main branch: build one artifact and record commit SHA/checksum.
3. Production approval: backup, migrate, deploy, smoke test.
4. Smoke tests: root page, an album page at `/a/:slug`, rejected foreign `Host` header, health, guest login, upload intent/complete, admin login.
5. Roll back application release if smoke tests fail. Roll back schema only with a tested explicit migration; never improvise destructive reversal.

## Observability

- Structured JSON logs with request ID, actor type/ID, tenant ID, route, duration, status; no PII/secrets.
- Error tracking with source-map access restricted to the service.
- Alerts for availability, 5xx rate, login abuse, job backlog, failed invites, storage/database usage, backup failure, and certificate expiry.
- Synthetic checks for the root page and a non-sensitive album path (`/a/:slug`).

## Launch checklist

- [ ] Production env validation rejects defaults
- [ ] DNS/TLS for the single origin and certificate renewal tested
- [ ] Database connection uses TLS and least privilege
- [ ] Bucket is private; public listing/access blocked
- [ ] SMTP SPF, DKIM, and DMARC configured
- [ ] Worker retries and dead-letter handling tested
- [ ] Backups and restore tested
- [ ] Security release gate in `SECURITY.md` passed
- [ ] Privacy policy, terms, retention, and abuse contact published
- [ ] Rollback and incident contacts documented
