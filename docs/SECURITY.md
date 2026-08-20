# Security rules and threat model

## Highest-risk assets

Private photographs, guest emails, admin credentials, access codes, session/invite tokens, object-storage credentials, and export archives. Main threats are cross-tenant data access, credential/code guessing, malicious uploads, leaked signed URLs, compromised admin accounts, and archive/download abuse.

## Required controls

### Tenant isolation

- Accept only the configured canonical host (single origin, ADR-005); configure the reverse proxy to replace—not append—forwarded host values.
- Load the tenant from the server-side slug lookup. Ignore any client tenant ID for authorization. The slug names an album but never grants access: album pages and routes verify the session's `tenant_id` matches the requested album before rendering or mutating.
- Use repository signatures that require `tenantId`; select/update/delete with `WHERE tenant_id = ? AND id = ?`.
- Test every protected operation with a resource ID belonging to a different tenant.
- Set session cookies host-only (no `domain` attribute). Because all albums share one origin (ADR-005), the cookie host cannot isolate albums — the session→tenant binding above is the isolation boundary, and the cookie's job is `HttpOnly; Secure; SameSite=Lax`.

### Credentials and sessions

- Hash admin passwords with Argon2id using OWASP-current parameters; enforce 12+ characters and allow password managers/paste.
- Generate codes with a cryptographically secure RNG, preserving leading zeroes. The keyed slow hash stays authoritative for verification; additionally the current code is stored sealed (app-secret encryption) so the event admin's settings page can always display it (ADR-006). It is decrypted only for the authenticated event admin and never logged.
- Generate 256-bit random session/invite tokens and persist only SHA-256/HMAC hashes with a server pepper.
- Session cookie: `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=86400`, host-only.
- Rotate/revoke sessions on privilege changes, password change, membership disable, access-code rotation (policy choice), and archive.
- Use generic login failures and constant-behavior comparisons to limit account/event enumeration.
- Guest login is member email + eight-digit access code (ADR-003); both must match the tenant resolved from the album slug (or located server-side from email + code at the marketing root — ADR-005), and the code is verified with a keyed slow hash even when the email is unknown. Product decision: invitation and onboarding emails deliver both the personal link and the code, so a compromised guest mailbox grants album access for that member — the mailbox is treated as the trust anchor, as with any emailed credential.

### Web protections

- Require HTTPS; enable HSTS once the canonical origin serves valid TLS (single origin, ADR-005 — the app sends `includeSubDomains; preload`, so don't point other names at unencrypted services).
- Use CSP with nonces/hashes, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`.
- Validate `Origin`/`Sec-Fetch-Site` and use CSRF tokens for authenticated mutations.
- Encode descriptions as text; never render user HTML. Apply length limits at API and DB layers.
- Rate-limit at both network and account/member keys. Add exponential backoff and security audit events.
- Keep CORS disabled unless a separate trusted client is introduced.

### Media

- Browser resizing is a performance control, not a security boundary.
- Allow-list final MIME types; inspect magic bytes and decode server-side/worker-side before `ready`.
- Enforce 15 MB input, 1920 px width, reasonable pixel count, checksum, and object `Content-Length`.
- Generate non-guessable object keys. Buckets are private; signed URLs expire in minutes.
- Serve media from a separate cookieless CDN/storage host with `Content-Disposition: inline` and safe content type.
- Strip EXIF by re-encoding in the browser; confirm with server decoder. This removes GPS and device metadata.
- Quarantine invalid files, avoid SVG, and never execute image tooling with shell-built filenames.

### Authorization matrix

| Action | Friend | Event admin | Super-admin |
|---|---:|---:|---:|
| View tenant album | Yes | Yes | Support workflow only |
| Upload photo | Yes | Optional | No |
| Edit/delete own upload | Yes | Yes | No |
| Manage friends/invites/code/cover | No | Own tenant | No |
| Download full album | No | Own tenant | No by default |
| Provision/archive tenant | No | No | Yes |
| Change platform roles | No | No | Yes |

Super-admin does not automatically gain album-media access. Any support access should be explicit, time-bound, justified, and audited.

## Secrets and privacy

- Store production secrets in Hostinger environment configuration, never repository files or build output.
- Use distinct secrets across environments and rotate on suspected exposure.
- Log stable internal IDs, action, outcome, and request ID; do not log codes, tokens, passwords, raw emails, signed URLs, descriptions, or image metadata.
- Define retention before launch: original photos, archived tenants, audit logs, failed uploads, and exports need explicit periods and deletion jobs.
- Provide admin flows for guest-data export/deletion and document the business privacy policy.

## Security release gate

- [ ] Cross-tenant integration test suite passes
- [ ] Admin and super-admin MFA enabled
- [ ] Dependency and secret scanning enabled in CI
- [ ] CSP, TLS, cookie, CSRF, and rate-limit tests pass
- [ ] Upload polyglot/oversize/decompression-bomb tests pass
- [ ] Backup restore and tenant archive procedures rehearsed
- [ ] External security review completed before handling real private albums
