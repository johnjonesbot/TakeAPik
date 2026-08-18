# Claude Code guide for TakeAPik

## Mission

Build TakeAPik as a secure, mobile-first, multi-tenant event photo album. The root domain handles guest access. Tenant subdomains host albums and `/admin`; the root `/super-admin` surface is platform-only.

## Read before changing code

1. `README.md`
2. `docs/ARCHITECTURE.md`
3. `docs/SECURITY.md`
4. `docs/ROUTES.md`
5. The active phase in `docs/IMPLEMENTATION_PLAN.md`

If a decision changes architecture, add or supersede an ADR rather than silently changing the design.

## Non-negotiable invariants

- Derive tenant context from a normalized, allow-listed hostname; never trust a tenant ID from the browser.
- Every tenant-owned database query includes `tenant_id`, even when querying by globally unique ID.
- Guest login requires a member email match and the event's eight-digit code (ADR-003); the tenant comes from the hostname, never from input.
- Store access codes, invite tokens, session tokens, and passwords only as strong one-way hashes. Never log them.
- Guest sessions expire after 24 hours and use `HttpOnly`, `Secure`, `SameSite=Lax`, host-only cookies.
- Friends can read the album and manage only their own uploads. Event admins can manage only their tenant. Only super-admins provision/archive tenants; only event admins can request full-album exports.
- Resize in the browser to at most 1920 px before upload, but independently verify MIME type, dimensions, and byte size server-side.
- Upload through short-lived signed object-storage URLs. Object keys are generated server-side and tenant-prefixed.
- Archived albums are read-only and reject login, uploads, invites, and mutations.
- Write audit events for login outcomes, member/invite changes, access-code rotation, export, archive, and privileged actions.

## Coding conventions

- TypeScript strict mode; avoid `any` and unchecked type assertions.
- Parse every request at the boundary with Zod and return the error envelope documented in `docs/ROUTES.md`.
- Keep route handlers thin: authentication/authorization → validation → service → response.
- Pass an explicit `Actor` and `TenantContext` into service methods.
- Use cursor pagination (`created_at`, `id`) for photo feeds; never offset pagination.
- Prefer small modules and named exports. Put browser-only code in `*.client.ts` or a `"use client"` component.
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
