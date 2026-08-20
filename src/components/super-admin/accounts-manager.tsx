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

interface Envelope<T> {
  data?: T;
  error?: { message?: string };
}

export function AccountsManager() {
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<AdminAccount | null>(null);
  const [purging, setPurging] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminAccount | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    const response = await fetch("/api/v1/super-admin/accounts");
    const payload = (await response.json()) as Envelope<{ accounts: AdminAccount[] }>;
    if (response.ok && payload.data) setAccounts(payload.data.accounts);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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

      <ul className="friend-list">
        {visible.map((account) => {
          const isOpen = expanded === account.userId;
          const flagged = account.tenant?.flagged ?? false;
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
                      <span className="chip chip-flagged" title="Past the 90-day retention window — album due for takedown">
                        ⚑ takedown due
                      </span>
                    ) : null}
                  </strong>
                  <span>
                    {account.email}
                    {account.tenant ? ` · ${account.tenant.slug} · ${account.tenant.photoCount} photos` : " · no album"}
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
                  {account.tenant && (account.tenant.photoCount > 0 || account.tenant.memberCount > 1) ? (
                    <button
                      type="button"
                      className="ghost danger"
                      onClick={() => {
                        setMessage("");
                        setPurgeTarget(account);
                      }}
                    >
                      Delete album
                    </button>
                  ) : account.tenant ? (
                    <>
                      <p className="panel-note">
                        Blank slate — nothing left in the album. The owner signs in, sets a new event date, and
                        starts over. Or remove every remaining trace:
                      </p>
                      <button
                        type="button"
                        className="ghost danger"
                        onClick={() => {
                          setMessage("");
                          setDeleteTarget(account);
                        }}
                      >
                        Delete account
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="ghost danger"
                      onClick={() => {
                        setMessage("");
                        setDeleteTarget(account);
                      }}
                    >
                      Delete account
                    </button>
                  )}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      {purgeTarget?.tenant ? (
        <form className="archive-confirm" onSubmit={(event) => void purge(event)}>
          <p className="panel-note">
            <strong>Are you sure?</strong> Deleting <strong>{purgeTarget.tenant.slug}</strong> permanently removes
            all {purgeTarget.tenant.photoCount} photos (including the stored files), every guest, invitation, and
            export. This cannot be undone. {purgeTarget.displayName}&apos;s account survives: at their next sign-in
            the album is a blank slate — they set a new event date, rename the event, and re-add friends. Confirm
            with a fresh authenticator code.
          </p>
          <div className="field">
            <label htmlFor="purge-totp">Authenticator code</label>
            <input id="purge-totp" name="totpCode" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required />
          </div>
          <div className="upload-actions">
            <button type="button" className="ghost" onClick={() => setPurgeTarget(null)}>Cancel</button>
            <button type="submit" className="ghost danger" disabled={purging}>{purging ? "Deleting…" : "Delete this album permanently"}</button>
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
                {" "}and its album — the address <strong>/a/{deleteTarget.tenant.slug}</strong> is released and may be
                assigned to a future album
              </>
            ) : null}
            . Nothing about this account can be recovered afterward. Type the account&apos;s email and a fresh
            authenticator code to confirm.
          </p>
          <div className="field">
            <label htmlFor="delete-confirm-email">Account email</label>
            <input id="delete-confirm-email" name="confirmEmail" type="email" placeholder={deleteTarget.email} required />
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
  );
}
