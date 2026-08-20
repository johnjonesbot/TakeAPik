"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

interface AdminAccount {
  userId: string;
  email: string;
  displayName: string;
  disabled: boolean;
  tenant: {
    id: string;
    slug: string;
    status: "draft" | "active" | "archived";
    createdAt: string;
    eventName: string | null;
    eventStartsAt: string | null;
    photoCount: number;
    memberCount: number;
    flagged: boolean;
    flaggedAt: string;
  } | null;
}

interface Provisioned {
  slug: string;
  accessCode: string;
  temporaryPassword?: string;
  welcomeEmailSent: boolean;
  /** Captured from the form so the credential card can show the sign-in user. */
  ownerEmail: string;
}

interface Envelope<T> {
  data?: T;
  error?: { message?: string };
}

export function AccountsManager() {
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [provisioned, setProvisioned] = useState<Provisioned | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<AdminAccount | null>(null);
  const [purging, setPurging] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminAccount | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [resetTarget, setResetTarget] = useState<AdminAccount | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetResult, setResetResult] = useState<{ ownerEmail: string; temporaryPassword: string } | null>(null);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/v1/super-admin/accounts");
    const payload = (await response.json()) as Envelope<{ accounts: AdminAccount[] }>;
    if (response.ok && payload.data) setAccounts(payload.data.accounts);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function clearBanners() {
    setMessage("");
    setProvisioned(null);
    setResetResult(null);
  }

  async function provision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    clearBanners();
    const response = await fetch("/api/v1/super-admin/tenants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ownerEmail: formData.get("ownerEmail"),
        ownerDisplayName: formData.get("ownerDisplayName"),
        eventName: formData.get("eventName"),
        eventStartsAt: new Date(`${formData.get("eventStartsAt")}T12:00:00Z`).toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      })
    });
    const payload = (await response.json()) as Envelope<{ provisioned: Provisioned }>;
    if (response.ok && payload.data) {
      setProvisioned({ ...payload.data.provisioned, ownerEmail: String(formData.get("ownerEmail") ?? "") });
      form.reset();
      await refresh();
    } else {
      setMessage(payload.error?.message ?? "Provisioning failed");
    }
  }

  async function resetOwnerPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!resetTarget?.tenant || resetting) return;
    setResetting(true);
    const formData = new FormData(event.currentTarget);
    const response = await fetch(`/api/v1/super-admin/tenants/${resetTarget.tenant.id}/owner-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ totpCode: formData.get("totpCode") })
    });
    const payload = (await response.json()) as Envelope<{ ownerEmail: string; temporaryPassword: string }>;
    if (response.ok && payload.data) {
      setResetTarget(null);
      setResetResult(payload.data);
      setMessage("");
    } else {
      setMessage(payload.error?.message ?? "Password reset failed");
    }
    setResetting(false);
  }

  async function purge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!purgeTarget?.tenant || purging) return;
    setPurging(true);
    const formData = new FormData(event.currentTarget);
    const response = await fetch(`/api/v1/super-admin/tenants/${purgeTarget.tenant.id}/purge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ totpCode: formData.get("totpCode") })
    });
    const payload = (await response.json()) as Envelope<{ deletedPhotos: number; deletedObjects: number }>;
    if (response.ok && payload.data) {
      setMessage(
        `Deleted ${purgeTarget.tenant.slug}: ${payload.data.deletedPhotos} photos removed from the database, ` +
          `${payload.data.deletedObjects} files removed from storage. The account remains.`
      );
      setPurgeTarget(null);
      await refresh();
    } else {
      setMessage(payload.error?.message ?? "Delete failed");
    }
    setPurging(false);
  }

  async function deleteAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    const formData = new FormData(event.currentTarget);
    const response = await fetch(`/api/v1/super-admin/accounts/${deleteTarget.userId}/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmEmail: formData.get("confirmEmail"), totpCode: formData.get("totpCode") })
    });
    const payload = (await response.json()) as Envelope<{ deleted: boolean; freedSlug: string | null }>;
    if (response.ok && payload.data) {
      setMessage(
        payload.data.freedSlug
          ? `Deleted ${deleteTarget.email} and its album — the address /a/${payload.data.freedSlug} is available again.`
          : `Deleted ${deleteTarget.email}.`
      );
      setDeleteTarget(null);
      setExpanded(null);
      await refresh();
    } else {
      setMessage(payload.error?.message ?? "Account delete failed");
    }
    setDeleting(false);
  }

  const term = search.trim().toLowerCase();
  const visible = term
    ? accounts.filter((account) =>
        [account.email, account.displayName, account.tenant?.slug ?? "", account.tenant?.eventName ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(term)
      )
    : accounts;

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
          <label htmlFor="p-event-date">Event date (required)</label>
          <input id="p-event-date" name="eventStartsAt" type="date" required />
        </div>
        <button type="submit">Provision</button>
        {provisioned ? (
          <div className="rotated-code" role="status">
            <p style={{ margin: 0 }}>Created :</p>
            <p style={{ margin: "4px 0 0" }}>· takeapik.com/a/{provisioned.slug}</p>
            <p style={{ margin: "4px 0 0" }}>· access code <strong>{provisioned.accessCode}</strong></p>
            <p style={{ margin: "4px 0 0" }}>· user: <strong>{provisioned.ownerEmail}</strong></p>
            {provisioned.temporaryPassword ? (
              <p style={{ margin: "4px 0 0" }}>· owner temp password : <strong>{provisioned.temporaryPassword}</strong></p>
            ) : (
              <p style={{ margin: "4px 0 0" }}>· password: the host&apos;s existing one</p>
            )}
            <p style={{ margin: "8px 0 0", fontSize: 12 }}>
              {provisioned.welcomeEmailSent
                ? "The host received a welcome email with these credentials and instructions."
                : "Warning: the welcome email failed to send — pass these to the host yourself; they are shown once."}
            </p>
          </div>
        ) : null}
      </form>

      <section className="admin-panel admin-panel-wide">
        <div className="panel-head">
          <h2>Admin accounts ({visible.length})</h2>
          <div className="field" style={{ minWidth: 220 }}>
            <label htmlFor="accounts-search">Search</label>
            <input
              id="accounts-search"
              type="search"
              placeholder="Email, name, album, event…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>

        <ul className="friend-list accounts-list">
          {visible.map((account) => {
            const isOpen = expanded === account.userId;
            const flagged = account.tenant?.flagged ?? false;
            const blankSlate =
              account.tenant !== null && account.tenant.photoCount === 0 && account.tenant.memberCount <= 1;
            return (
              <li key={account.userId} className={account.disabled ? "is-disabled" : undefined}>
                <button
                  type="button"
                  className="account-row"
                  aria-expanded={isOpen}
                  onClick={() => setExpanded(isOpen ? null : account.userId)}
                >
                  <span className="friend-identity">
                    <strong>
                      {account.displayName}
                      {flagged ? (
                        <span
                          className="chip chip-flagged"
                          title="Past the 90-day retention window — album due for takedown"
                        >
                          ⚑ takedown due
                        </span>
                      ) : null}
                    </strong>
                    <span>
                      {account.email}
                      {account.tenant
                        ? ` · ${account.tenant.slug} · ${account.tenant.photoCount} photos`
                        : " · no album"}
                    </span>
                  </span>
                  <span aria-hidden="true">{isOpen ? "▾" : "▸"}</span>
                </button>

                {isOpen ? (
                  <div className="account-details">
                    <dl>
                      <div>
                        <dt>Contact</dt>
                        <dd>
                          {account.displayName} · {account.email}
                          {account.disabled ? " · account disabled" : ""}
                        </dd>
                      </div>
                      {account.tenant ? (
                        <>
                          <div>
                            <dt>Album</dt>
                            <dd>
                              /a/{account.tenant.slug} · {account.tenant.status} · created{" "}
                              {new Date(account.tenant.createdAt).toLocaleDateString()}
                            </dd>
                          </div>
                          <div>
                            <dt>Event</dt>
                            <dd>
                              {account.tenant.eventName ?? "—"} ·{" "}
                              {account.tenant.eventStartsAt
                                ? `event date ${new Date(account.tenant.eventStartsAt).toLocaleDateString()}`
                                : "no event date set"}
                            </dd>
                          </div>
                          <div>
                            <dt>Contents</dt>
                            <dd>
                              {account.tenant.photoCount} photos · {account.tenant.memberCount} members ·{" "}
                              {account.tenant.eventStartsAt
                                ? `retention flag ${new Date(account.tenant.flaggedAt).toLocaleDateString()}`
                                : "no retention window until an event date is set"}
                            </dd>
                          </div>
                        </>
                      ) : (
                        <div>
                          <dt>Album</dt>
                          <dd>This account owns no album.</dd>
                        </div>
                      )}
                    </dl>
                    <div className="upload-actions">
                      {account.tenant ? (
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => {
                            clearBanners();
                            setResetTarget(account);
                          }}
                        >
                          Reset owner password
                        </button>
                      ) : null}
                      {account.tenant && !blankSlate ? (
                        <button
                          type="button"
                          className="ghost danger"
                          onClick={() => {
                            clearBanners();
                            setPurgeTarget(account);
                          }}
                        >
                          Delete album
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="ghost danger"
                          onClick={() => {
                            clearBanners();
                            setDeleteTarget(account);
                          }}
                        >
                          Delete account
                        </button>
                      )}
                    </div>
                    {blankSlate && account.tenant ? (
                      <p className="panel-note">
                        Blank slate — the album is empty. The owner signs in, sets a new event date, and starts
                        over; or Delete account removes every remaining trace and frees /a/{account.tenant.slug}.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>

        {resetTarget?.tenant ? (
          <form className="archive-confirm" onSubmit={(event) => void resetOwnerPassword(event)}>
            <p className="panel-note">
              Resetting the password for <strong>{resetTarget.email}</strong> ({resetTarget.tenant.slug}) signs
              them out everywhere and replaces their password with a one-time temporary one, shown only to you,
              once. Confirm with a fresh authenticator code.
            </p>
            <div className="field">
              <label htmlFor="reset-totp">Authenticator code</label>
              <input id="reset-totp" name="totpCode" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required />
            </div>
            <div className="upload-actions">
              <button type="button" className="ghost" onClick={() => setResetTarget(null)}>Cancel</button>
              <button type="submit" className="ghost danger" disabled={resetting}>
                {resetting ? "Resetting…" : "Reset password"}
              </button>
            </div>
          </form>
        ) : null}
        {resetResult ? (
          <div className="rotated-code" role="status">
            <p style={{ margin: 0 }}>
              Temporary password for <strong>{resetResult.ownerEmail}</strong>:{" "}
              <strong>{resetResult.temporaryPassword}</strong>
            </p>
            <p style={{ margin: "6px 0 0", fontSize: 12 }}>
              Shown once — pass it to the host now and have them change it after signing in.
            </p>
          </div>
        ) : null}

        {purgeTarget?.tenant ? (
          <form className="archive-confirm" onSubmit={(event) => void purge(event)}>
            <p className="panel-note">
              <strong>Are you sure?</strong> Deleting <strong>{purgeTarget.tenant.slug}</strong> permanently
              removes all {purgeTarget.tenant.photoCount} photos (including the stored files), every guest,
              invitation, and export. This cannot be undone. {purgeTarget.displayName}&apos;s account survives: at
              their next sign-in the album is a blank slate — they set a new event date, rename the event, and
              re-add friends. Confirm with a fresh authenticator code.
            </p>
            <div className="field">
              <label htmlFor="purge-totp">Authenticator code</label>
              <input id="purge-totp" name="totpCode" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required />
            </div>
            <div className="upload-actions">
              <button type="button" className="ghost" onClick={() => setPurgeTarget(null)}>Cancel</button>
              <button type="submit" className="ghost danger" disabled={purging}>
                {purging ? "Deleting…" : "Delete this album permanently"}
              </button>
            </div>
          </form>
        ) : null}

        {deleteTarget ? (
          <form className="archive-confirm" onSubmit={(event) => void deleteAccount(event)}>
            <p className="panel-note">
              <strong>Are you sure?</strong> This permanently deletes the admin account{" "}
              <strong>{deleteTarget.email}</strong>
              {deleteTarget.tenant ? (
                <>
                  {" "}and its album — the address <strong>/a/{deleteTarget.tenant.slug}</strong> is released and
                  may be assigned to a future album
                </>
              ) : null}
              . Nothing about this account can be recovered afterward. Type the account&apos;s email and a fresh
              authenticator code to confirm.
            </p>
            <div className="field">
              <label htmlFor="delete-confirm-email">Account email</label>
              <input
                id="delete-confirm-email"
                name="confirmEmail"
                type="email"
                placeholder={deleteTarget.email}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="delete-totp">Authenticator code</label>
              <input id="delete-totp" name="totpCode" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required />
            </div>
            <div className="upload-actions">
              <button type="button" className="ghost" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button type="submit" className="ghost danger" disabled={deleting}>
                {deleting ? "Deleting…" : "Delete this account permanently"}
              </button>
            </div>
          </form>
        ) : null}
        <p className="form-status" aria-live="polite">{message}</p>
      </section>
    </div>
  );
}
