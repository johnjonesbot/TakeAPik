# Claude Code guide for TakeAPik

## Mission

Build TakeAPik as a secure, mobile-first, multi-tenant event photo album. Everything runs on the single `takeapik.com` origin (ADR-005): marketing and guest access at the root, albums and their admin at `/a/:slug`, and the platform-only `/super-admin` surface.

## Read before changing code

1. `README.md`
2. `docs/ARCHITECTURE.md`
3. `docs/SECURITY.md`
4. `docs/ROUTES.md`
5. The active phase in `docs/IMPLEMENTATION_PLAN.md`

If a decision changes architecture, add or supersede an ADR rather than silently changing the design.

## Non-negotiable invariants

- Single origin (ADR-005): the whole app runs on `takeapik.com` — marketing, album login, albums at `/a/:slug`, and `/super-admin`. Tenancy is path-derived: the slug names an album but never grants access on its own — authorization always compares the session's `tenant_id` (from the session row) against the requested album, and every tenant-owned query is scoped by that `tenant_id`. Never trust a tenant id or slug from the browser as an authority.
- Because all albums share one origin, isolation lives in the app, not the cookie host: keep the session→tenant binding authoritative, the strict nonce CSP and the security headers in `proxy.ts`, and `HttpOnly` cookies. Do not weaken the CSP (no `unsafe-inline`/`unsafe-eval` in `script-src`) or serve photo bytes from the app origin.
- Every tenant-owned database query includes `tenant_id`, even when querying by globally unique ID.
- Guest login requires a member email OR phone match and the event's eight-digit code (ADR-003); the tenant is resolved server-side from the album slug (or located from identifier + code at the marketing root), and a client-supplied tenant id is never an authority (ADR-005). Guests carry email and/or phone (at least one); invites prefer SMS when a phone exists (android-sms-gateway), else email.
- Store invite tokens, session tokens, and passwords only as strong one-way hashes. Access codes keep the authoritative hash for verification but are additionally stored sealed so the event admin can always view the current code (ADR-006). Never log any of them.
- Member sessions (friends and event admins) last 18 hours — events run all day — while super-admin sessions keep the configured `SESSION_TTL_HOURS`. All session cookies are `HttpOnly`, `Secure`, `SameSite=Lax`, host-only.
- Friends can read the album and manage only their own uploads. Event admins can manage only their tenant. Only super-admins provision tenants and perform takedowns (album purge, account deletion — ADR-007/008); only event admins can request full-album exports.
- Resize in the browser to at most 1920 px before upload, but independently verify MIME type, dimensions, and byte size server-side.
- Upload through short-lived signed object-storage URLs. Object keys are generated server-side and tenant-prefixed.
- The `archived` tenant status is a defensive dead-state: such rows are unreachable and reject login and mutations, but nothing sets the status anymore (ADR-008 removed archiving in favor of purge + account deletion).
- Retention (ADR-007): the event date is required; uploads only within [event − 7 days, +90 days]; past the window the album is flagged for manual, TOTP-confirmed super-admin purge that keeps the tenant, event row, and owner but permanently removes content and storage objects.
- Write audit events for login outcomes, member/invite changes, access-code rotation, export, archive, and privileged actions.

## Coding conventions

- TypeScript strict mode; avoid `any` and unchecked type assertions.
- Parse every request at the boundary with Zod and return the error envelope documented in `docs/ROUTES.md`.
- Keep route handlers thin: authentication/authorization → validation → service → response.
- Pass an explicit `Actor` and `TenantContext` into service methods.
- Use cursor pagination (`created_at`, `id`) for photo feeds; never offset pagination.
- Prefer small modules and named exports. Put browser-only code in `*.client.ts` or a `"use client"` component.
- Every async pending state renders `<BrandLoader>` (the animated brand mark) — never bare "Loading…" text or ad-hoc spinners.
- Add tests for authorization and tenant isolation with every protected route.

## Change workflow

1. Select one checklist item from the implementation plan.
2. Add/adjust tests first for security-sensitive behavior.
3. Implement the smallest complete vertical slice.
4. Run `npm run typecheck`, `npm test`, and `npm run build`.
5. Update route/schema/docs in the same change if behavior changed.

## Definition of done

- Happy path, denied path, and cross-tenant path are tested.
- No secret or personal data appears in logs or client bundles.
- Mobile layout and keyboard flow work at 320 px width.
- Database mutations are transactional where partial completion would be harmful.
- Documentation matches the behavior shipped.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
