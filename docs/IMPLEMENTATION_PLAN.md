# Phased implementation plan

Each checkbox should become a small reviewed change. A phase is complete only when its acceptance criteria and security tests pass.

## Phase 0 — Foundation (this scaffold)

- [x] Establish TypeScript/Next.js app and mobile glassmorphism shell
- [x] Add hostname parsing with reserved-label checks
- [x] Add browser resize primitive and baseline schema
- [x] Document architecture, API, security, deployment, and Claude Code rules
- [ ] Add CI workflow after the repository owner selects the CI provider

Acceptance: `npm run typecheck`, `npm test`, and `npm run build` pass; root page and health endpoint render.

## Phase 1 — Persistence and tenant core

- [x] Add migration tooling and split `db/schema.sql` into numbered migrations
- [x] Add startup environment validation and structured/redacted logging
- [x] Implement typed repositories; tenant ID mandatory in every tenant-owned method
- [x] Implement hostname → active tenant lookup and archived/not-found behavior
- [x] Implement super-admin bootstrap command that is safe to rerun and then disable
- [x] Add tenant provisioning transaction and collision-safe initials algorithm (`jj`, `jj1a`, …)
- [x] Add audit service and append-only privileged-action events

Acceptance: integration tests prove resources cannot be read/changed across tenants; concurrent slug provisioning produces unique results.

## Phase 2 — Authentication and portals

- [x] Implement opaque hashed sessions and host-only secure cookies
- [x] Friend login: normalized event name + member email + eight-digit code
- [x] Admin password login, Argon2id hashing, password change, session revocation
- [x] MFA enrollment/challenge for admins and mandatory MFA for super-admin
- [x] CSRF/origin validation and distributed-ready rate-limit interface
- [x] Build sticky tenant navigation, album shell, admin shell, and super-admin shell
- [x] Enforce authorization matrix in services and route tests

Acceptance: 24-hour expiry is enforced server-side; generic login failures do not enumerate data; friend/admin/super-admin boundaries pass tests.

## Phase 3 — Upload and gallery vertical slice

- [ ] Build mobile camera/file picker, preview, optional description, and progress/error states
- [ ] Feature-detect HEIC/HEIF and add a reviewed fallback decoder if required
- [ ] Resize/orient/re-encode to max 1920 px, strip metadata, compute SHA-256
- [ ] Create short-lived signed upload intent using server-generated tenant-prefixed key
- [ ] Verify stored object magic bytes/size/dimensions and transition pending → ready
- [ ] Build cursor-paginated infinite masonry gallery and `My uploads` filter
- [ ] Implement own-photo edit/soft-delete and admin moderation
- [ ] Clean up abandoned pending uploads and rejected objects

Acceptance: current iOS Safari/Android Chrome upload camera photos; malicious/oversize/mismatched files are rejected; gallery handles at least 1,000 photos without unbounded requests.

## Phase 4 — Event administration and email

- [ ] Event name/timezone and access-code rotation with step-up authentication
- [ ] Friend create/edit/disable/import with normalized-email uniqueness
- [ ] Single and send-all invitation workflow with idempotency key
- [ ] Transactional email templates with canonical tenant links and expiration
- [ ] Delivery/failure state, bounded retries, and admin resend UX
- [ ] Cover-photo selection restricted to ready photos in the tenant

Acceptance: disabled members lose active sessions; send-all never duplicates successful sends on retry; SPF/DKIM/DMARC pass.

## Phase 5 — Export, archival, and operations

- [ ] Background job runner with locking, backoff, dead-letter status, and metrics
- [ ] Admin-only streaming ZIP export with one-active-job constraint and expiring URL
- [ ] Super-admin archive confirmation, step-up auth, session/invite revocation, read-only enforcement
- [ ] Retention/deletion jobs for failed uploads, exports, and archived tenants
- [ ] Backup/restore, rollback, certificate, and incident runbooks
- [ ] Production monitoring, alerts, dashboards, and synthetic tenant check

Acceptance: export does not load all files into memory or proxy bytes through web; archived tenant mutations fail; backup restore rehearsal succeeds.

## Phase 6 — Hardening and launch

- [ ] Accessibility audit (WCAG 2.2 AA target), keyboard and screen-reader flows
- [ ] Load tests for gallery, login, upload intents, and worker queue
- [ ] External penetration test and remediation
- [ ] Dependency/secret/container scanning and update policy
- [ ] Privacy/terms/retention/user-deletion workflows reviewed by counsel
- [ ] Staged pilot with at least two tenants and launch rollback criteria

Acceptance: all `docs/SECURITY.md` release gates pass, no critical/high findings remain, and production owner signs off.
