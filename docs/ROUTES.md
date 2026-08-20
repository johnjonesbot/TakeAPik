# Route and API contract

## Surfaces

All paths live on the single `takeapik.com` origin (ADR-005).

| Path | Audience | Purpose |
|---|---|---|
| `/` | Friend | Marketing root and event access form (email + code locates the album) |
| `/a/{slug}` | Friend | The album: upload card above the infinite gallery; tap a photo to view it full-screen |
| `/a/{slug}/upload` | Friend | Legacy path; redirects to `/a/{slug}` (uploading lives on the album tab) |
| `/a/{slug}/my-uploads` | Friend | Current friend's photos |
| `/a/{slug}/invite` | Friend | Invitation landing; prefills email from the token. The invitation email also carries the access code, so most guests just retype it |
| `/a/{slug}/admin` | Event admin | Single settings page: event details, access code, friends & invitations, cover photo, export, password & MFA |
| `/super-admin` | Super-admin | Accounts console: provisioning, retention flags, password resets, album and account deletion |

## API conventions

JSON uses camelCase and UTC ISO-8601 timestamps. Mutations require same-origin checks and CSRF protection. IDs are opaque UUIDs. Collection responses use `nextCursor`; clients never construct cursors.

Success:

```json
{ "data": {}, "requestId": "01J..." }
```

Failure:

```json
{
  "error": { "code": "VALIDATION_ERROR", "message": "Check the highlighted fields", "fields": {} },
  "requestId": "01J..."
}
```

Use stable codes: `VALIDATION_ERROR`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `ARCHIVED`, `UPLOAD_INVALID`, `INTERNAL_ERROR`. Resource lookups should generally return `404` rather than reveal cross-tenant existence.

## Endpoints

### Public and session

| Method | Endpoint | Notes |
|---|---|---|
| `POST` | `/api/v1/auth/friend` | Email + 8-digit access code (ADR-003); rate-limited. With a `slug` (login from `/a/{slug}`) the tenant is resolved server-side from it; without one (marketing root) the tenant is located from email + code (ADR-005). Sets the host-only session cookie directly — same origin, no handoff |
| `POST` | `/api/v1/auth/admin` | Admin email/password and optional MFA challenge |
| `POST` | `/api/v1/auth/logout` | Revokes current session and clears cookie |
| `GET` | `/api/v1/session` | Minimal actor and tenant context |
| `GET` | `/api/health` | Process liveness; no dependency or secret detail |
| `GET` | `/api/ready` | Protected/allow-listed readiness check for DB/storage |

### Album and photos

| Method | Endpoint | Authorization |
|---|---|---|
| `GET` | `/api/v1/photos?cursor=&limit=30` | Tenant member |
| `GET` | `/api/v1/photos/mine?cursor=&limit=30` | Tenant member; server uses session membership |
| `POST` | `/api/v1/uploads` | Tenant member; creates pending record and signed URL. Rejected outside the retention window (ADR-007) |
| `POST` | `/api/v1/uploads/{photoId}/complete` | Original uploader in same tenant |
| `PATCH` | `/api/v1/photos/{photoId}` | Original uploader; description only |
| `DELETE` | `/api/v1/photos/{photoId}` | Original uploader or tenant admin; soft delete |

`POST /uploads` accepts final output metadata, not the binary:

```json
{
  "filename": "IMG_1042.jpg",
  "mimeType": "image/jpeg",
  "byteSize": 1842210,
  "width": 1920,
  "height": 1280,
  "checksumSha256": "hex-encoded-sha256"
}
```

### Event admin

| Method | Endpoint | Purpose |
|---|---|---|
| `GET/PATCH` | `/api/v1/admin/event` | Read/update name, timezone, and the required event date; includes retention-window state (ADR-007). Rotate access code separately |
| `POST` | `/api/v1/admin/event/access-code` | Step-up auth; rotates the code. The current code stays visible via `GET /admin/event` (ADR-006) |
| `GET/POST` | `/api/v1/admin/friends` | List/create memberships; every created friend is immediately emailed their invitation (personal link + access code) |
| `PATCH/DELETE` | `/api/v1/admin/friends/{id}` | Edit or disable membership |
| `GET` | `/api/v1/admin/invitations` | List invitations and delivery state |
| `POST` | `/api/v1/admin/invitations/send` | Send selected IDs or all unsent; idempotency key required |
| `POST` | `/api/v1/admin/invitations/{id}/resend` | Resend one failed/expired invitation |
| `POST` | `/api/v1/admin/mfa` | MFA enrollment/challenge management |
| `PUT` | `/api/v1/admin/cover` | Select a ready tenant photo |
| `POST` | `/api/v1/admin/exports` | Queue full ZIP; one active export per tenant |
| `GET` | `/api/v1/admin/exports/{id}` | Poll status; completed response has expiring URL |
| `POST` | `/api/v1/admin/password` | Current password + new password; revoke other sessions |

### Super-admin

| Method | Endpoint | Purpose |
|---|---|---|
| `GET/POST` | `/api/v1/super-admin/tenants` | List/provision tenant and owner; provisioning requires the event date (ADR-007) |
| `GET/PATCH` | `/api/v1/super-admin/tenants/{id}` | View/edit platform-controlled fields |
| `POST` | `/api/v1/super-admin/tenants/{id}/owner-password` | Step-up auth; resets the owner's password to a one-time temporary value (returned once), revokes their sessions. Refuses super-admin targets |
| `PATCH` | `/api/v1/super-admin/account` | Super-admin's own email and/or password; current password required. Password change revokes other sessions |
| `GET` | `/api/v1/super-admin/accounts` | All admin accounts with album, event, and retention-flag state (ADR-007) |
| `POST` | `/api/v1/super-admin/tenants/{id}/purge` | Step-up auth; blank-slate album deletion — permanently removes photos (storage included), guests, invitations, exports; keeps tenant, event row, and owner (ADR-007) |
| `POST` | `/api/v1/super-admin/accounts/{userId}/delete` | Typed-email confirm + step-up auth; full account teardown for emptied albums — deletes the tenant (freeing its slug) and the platform account. Refuses super-admin targets and albums with remaining content |

Provisioning generates a candidate slug from lowercase initials. Try `jj`, then atomic unique candidates `jj1a`, `jj1b` … without a check-then-insert race. The database unique constraint is authoritative; retry collisions in a bounded transaction.

## Rate-limit baseline

| Operation | Starting limit |
|---|---|
| Friend login | 5/IP/15 min and 10/email/60 min |
| Admin login | 5/account/15 min and 20/IP/60 min |
| Upload intent | 30/member/10 min |
| Invite send | 100/tenant/hour |
| Export | 1 active and 3/tenant/day |

Tune from production data. Limits must work across instances before horizontal scaling.
