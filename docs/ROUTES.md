# Route and API contract

## Surfaces

| Host/path | Audience | Purpose |
|---|---|---|
| `takeapik.com/` | Friend | Event access form |
| `{slug}.takeapik.com/` | Friend | Infinite album gallery |
| `{slug}.takeapik.com/upload` | Friend | Camera/file selection, preview, description, publish |
| `{slug}.takeapik.com/my-uploads` | Friend | Current friend's photos |
| `{slug}.takeapik.com/admin` | Event admin | Single settings page: event details, access code, friends & invitations, cover photo, export, password & MFA |
| `{slug}.takeapik.com/admin/{friends,album,account}` | Event admin | Legacy URLs; permanent redirects to `/admin` |
| `takeapik.com/super-admin` | Super-admin | Tenant provisioning and archive controls |

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

## Planned endpoints

### Public and session

| Method | Endpoint | Notes |
|---|---|---|
| `POST` | `/api/v1/auth/friend` | Email + 8-digit access code (ADR-003); rate-limited. On the root host it returns a single-use 60-second handoff instead of a cookie |
| `POST` | `/api/v1/auth/friend/handoff` | Tenant host only. Consumes a root-login handoff token (cross-subdomain form POST) and sets the host-only session cookie |
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
| `POST` | `/api/v1/uploads` | Tenant member; creates pending record and signed URL |
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
| `GET/PATCH` | `/api/v1/admin/event` | Read/update name, timezone; rotate access code separately |
| `POST` | `/api/v1/admin/event/access-code` | Step-up auth; returns new code once, never afterward |
| `GET/POST` | `/api/v1/admin/friends` | List/create memberships |
| `PATCH/DELETE` | `/api/v1/admin/friends/{id}` | Edit or disable membership |
| `POST` | `/api/v1/admin/invitations/send` | Send selected IDs or all unsent; idempotency key required |
| `PUT` | `/api/v1/admin/cover` | Select a ready tenant photo |
| `POST` | `/api/v1/admin/exports` | Queue full ZIP; one active export per tenant |
| `GET` | `/api/v1/admin/exports/{id}` | Poll status; completed response has expiring URL |
| `POST` | `/api/v1/admin/password` | Current password + new password; revoke other sessions |

### Super-admin

| Method | Endpoint | Purpose |
|---|---|---|
| `GET/POST` | `/api/v1/super-admin/tenants` | List/provision tenant and owner |
| `GET/PATCH` | `/api/v1/super-admin/tenants/{id}` | View/edit platform-controlled fields |
| `POST` | `/api/v1/super-admin/tenants/{id}/archive` | Confirm + step-up auth + revoke tenant sessions |

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
