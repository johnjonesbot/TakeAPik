"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

interface TenantSummary {
  id: string;
  slug: string;
  displayName: string;
  status: "draft" | "active" | "archived";
  ownerEmail: string;
  eventName: string | null;
  photoCount: number;
  memberCount: number;
}

interface Provisioned {
  slug: string;
  accessCode: string;
  temporaryPassword?: string;
}

interface Envelope<T> {
  data?: T;
  error?: { message?: string };
}

export function TenantsManager() {
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [message, setMessage] = useState("");
  const [provisioned, setProvisioned] = useState<Provisioned | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<TenantSummary | null>(null);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/v1/super-admin/tenants");
    const payload = (await response.json()) as Envelope<{ tenants: TenantSummary[] }>;
    if (response.ok && payload.data) setTenants(payload.data.tenants);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function provision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setMessage("");
    const response = await fetch("/api/v1/super-admin/tenants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ownerEmail: formData.get("ownerEmail"),
        ownerDisplayName: formData.get("ownerDisplayName"),
        eventName: formData.get("eventName"),
        timezone: formData.get("timezone") || undefined
      })
    });
    const payload = (await response.json()) as Envelope<{ provisioned: Provisioned }>;
    if (response.ok && payload.data) {
      setProvisioned(payload.data.provisioned);
      form.reset();
      await refresh();
    } else {
      setMessage(payload.error?.message ?? "Provisioning failed");
    }
  }

  async function archive(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!archiveTarget) return;
    const formData = new FormData(event.currentTarget);
    const response = await fetch(`/api/v1/super-admin/tenants/${archiveTarget.id}/archive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmSlug: formData.get("confirmSlug"), totpCode: formData.get("totpCode") })
    });
    const payload = (await response.json()) as Envelope<unknown>;
    if (response.ok) {
      setArchiveTarget(null);
      setMessage(`Archived ${archiveTarget.slug}`);
      await refresh();
    } else {
      setMessage(payload.error?.message ?? "Archive failed");
    }
  }

  return (
    <div className="admin-panels">
      <form className="admin-panel" onSubmit={(event) => void provision(event)}>
        <h2>Provision an album</h2>
        <div className="field">
          <label htmlFor="p-owner-name">Host name</label>
          <input id="p-owner-name" name="ownerDisplayName" maxLength={120} placeholder="John Jones" required />
        </div>
        <div className="field">
          <label htmlFor="p-owner-email">Host email</label>
          <input id="p-owner-email" name="ownerEmail" type="email" maxLength={320} required />
        </div>
        <div className="field">
          <label htmlFor="p-event">Event name</label>
          <input id="p-event" name="eventName" maxLength={200} placeholder="Maya & Leo" required />
        </div>
        <div className="field">
          <label htmlFor="p-tz">Timezone (optional)</label>
          <input id="p-tz" name="timezone" maxLength={64} placeholder="America/Managua" />
        </div>
        <button type="submit">Provision</button>
        {provisioned ? (
          <div className="rotated-code" role="status">
            <p style={{ margin: 0 }}>
              Created <strong>{provisioned.slug}</strong> · access code <strong>{provisioned.accessCode}</strong>
              {provisioned.temporaryPassword ? (
                <> · owner temp password <strong>{provisioned.temporaryPassword}</strong></>
              ) : null}
            </p>
            <p style={{ margin: "6px 0 0", fontSize: 12 }}>Shown once — pass these to the host now.</p>
          </div>
        ) : null}
      </form>

      <section className="admin-panel admin-panel-wide">
        <h2>Albums ({tenants.length})</h2>
        <ul className="friend-list">
          {tenants.map((tenant) => (
            <li key={tenant.id} className={tenant.status === "archived" ? "is-disabled" : undefined}>
              <div className="friend-identity">
                <strong>{tenant.slug}</strong>
                <span>
                  {tenant.eventName ?? tenant.displayName} · {tenant.ownerEmail} · {tenant.memberCount} members ·{" "}
                  {tenant.photoCount} photos
                </span>
              </div>
              <div className="friend-meta">
                <span className="chip">{tenant.status}</span>
              </div>
              <div className="friend-actions">
                {tenant.status !== "archived" ? (
                  <button type="button" className="ghost danger" onClick={() => setArchiveTarget(tenant)}>
                    Archive
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>

        {archiveTarget ? (
          <form className="archive-confirm" onSubmit={(event) => void archive(event)}>
            <p className="panel-note">
              Archiving <strong>{archiveTarget.slug}</strong> signs everyone out, revokes invitations,
              and takes the album offline. Type the album address name and a fresh authenticator code
              to confirm.
            </p>
            <div className="field">
              <label htmlFor="confirm-slug">Album address name</label>
              <input id="confirm-slug" name="confirmSlug" placeholder={archiveTarget.slug} required />
            </div>
            <div className="field">
              <label htmlFor="confirm-totp">Authenticator code</label>
              <input id="confirm-totp" name="totpCode" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required />
            </div>
            <div className="upload-actions">
              <button type="button" className="ghost" onClick={() => setArchiveTarget(null)}>Cancel</button>
              <button type="submit" className="ghost danger">Archive this album</button>
            </div>
          </form>
        ) : null}
        <p className="form-status" aria-live="polite">{message}</p>
      </section>
    </div>
  );
}
