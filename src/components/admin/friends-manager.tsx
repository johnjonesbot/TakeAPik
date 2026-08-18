"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

interface Friend {
  id: string;
  email: string;
  name: string;
  role: "admin" | "friend";
  disabled: boolean;
}

interface Invitation {
  id: string;
  membershipId: string;
  status: "pending" | "sent" | "delivered" | "failed" | "revoked";
  attempts: number;
  failureReason: string | null;
}

interface Envelope<T> {
  data?: T;
  error?: { message?: string };
}

export function FriendsManager() {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [friendsResponse, invitesResponse] = await Promise.all([
      fetch("/api/v1/admin/friends"),
      fetch("/api/v1/admin/invitations")
    ]);
    const friendsPayload = (await friendsResponse.json()) as Envelope<{ friends: Friend[] }>;
    const invitesPayload = (await invitesResponse.json()) as Envelope<{ invitations: Invitation[] }>;
    if (friendsResponse.ok && friendsPayload.data) setFriends(friendsPayload.data.friends);
    if (invitesResponse.ok && invitesPayload.data) setInvitations(invitesPayload.data.invitations);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function latestInvite(membershipId: string): Invitation | undefined {
    return invitations.find((invitation) => invitation.membershipId === membershipId);
  }

  async function addFriend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const response = await fetch("/api/v1/admin/friends", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: formData.get("email"), name: formData.get("name") })
    });
    const payload = (await response.json()) as Envelope<unknown>;
    if (response.ok) {
      form.reset();
      setMessage("Added");
      await refresh();
    } else {
      setMessage(payload.error?.message ?? "Couldn't add");
    }
  }

  async function sendInvites(membershipIds?: string[]) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/v1/admin/invitations/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(membershipIds ? { membershipIds } : {}),
          idempotencyKey: crypto.randomUUID()
        })
      });
      const payload = (await response.json()) as Envelope<{ invitations: Invitation[] }>;
      if (response.ok && payload.data) {
        const sent = payload.data.invitations.filter((invitation) => invitation.status === "sent").length;
        const failed = payload.data.invitations.length - sent;
        setMessage(`Sent ${sent}${failed ? `, ${failed} failed` : ""}`);
        await refresh();
      } else {
        setMessage(payload.error?.message ?? "Sending failed");
      }
    } finally {
      setBusy(false);
    }
  }

  async function resend(invitationId: string) {
    const response = await fetch(`/api/v1/admin/invitations/${invitationId}/resend`, { method: "POST" });
    const payload = (await response.json()) as Envelope<unknown>;
    setMessage(response.ok ? "Resent" : (payload.error?.message ?? "Resend failed"));
    await refresh();
  }

  async function disable(membershipId: string) {
    const response = await fetch(`/api/v1/admin/friends/${membershipId}`, { method: "DELETE" });
    const payload = (await response.json()) as Envelope<unknown>;
    setMessage(response.ok ? "Disabled" : (payload.error?.message ?? "Couldn't disable"));
    await refresh();
  }

  return (
    <div className="admin-panels">
      <form className="admin-panel" onSubmit={(event) => void addFriend(event)}>
        <h2>Add a friend</h2>
        <div className="field">
          <label htmlFor="friend-name">Name</label>
          <input id="friend-name" name="name" maxLength={120} required />
        </div>
        <div className="field">
          <label htmlFor="friend-email">Email</label>
          <input id="friend-email" name="email" type="email" maxLength={320} required />
        </div>
        <button type="submit">Add to the list</button>
      </form>

      <section className="admin-panel admin-panel-wide">
        <div className="panel-head">
          <h2>Friends ({friends.filter((friend) => !friend.disabled).length})</h2>
          <button type="button" onClick={() => void sendInvites()} disabled={busy}>
            {busy ? "Sending…" : "Send all unsent invites"}
          </button>
        </div>
        <ul className="friend-list">
          {friends.map((friend) => {
            const invite = latestInvite(friend.id);
            return (
              <li key={friend.id} className={friend.disabled ? "is-disabled" : undefined}>
                <div className="friend-identity">
                  <strong>{friend.name}</strong>
                  <span>{friend.email}</span>
                </div>
                <div className="friend-meta">
                  {friend.role === "admin" ? <span className="chip">admin</span> : null}
                  {friend.disabled ? <span className="chip">disabled</span> : null}
                  {invite ? <span className={`chip chip-${invite.status}`}>{invite.status}</span> : null}
                </div>
                <div className="friend-actions">
                  {!friend.disabled && friend.role === "friend" ? (
                    <>
                      <button type="button" className="ghost" onClick={() => void sendInvites([friend.id])} disabled={busy}>
                        Invite
                      </button>
                      {invite?.status === "failed" ? (
                        <button type="button" className="ghost" onClick={() => void resend(invite.id)}>
                          Retry
                        </button>
                      ) : null}
                      <button type="button" className="ghost danger" onClick={() => void disable(friend.id)}>
                        Disable
                      </button>
                    </>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
        <p className="form-status" aria-live="polite">{message}</p>
      </section>
    </div>
  );
}
