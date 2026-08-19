"use client";

import { FormEvent, useState } from "react";

interface Envelope {
  data?: { updated: boolean };
  error?: { message?: string };
}

async function patchAccount(body: Record<string, unknown>): Promise<{ ok: boolean; message: string }> {
  const response = await fetch("/api/v1/super-admin/account", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = (await response.json()) as Envelope;
  return { ok: response.ok, message: payload.error?.message ?? "" };
}

export function SuperAdminAccountSettings({ email }: { email: string }) {
  const [emailMessage, setEmailMessage] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");

  async function changeEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const result = await patchAccount({
      currentPassword: formData.get("currentPassword"),
      newEmail: formData.get("newEmail")
    });
    if (result.ok) {
      setEmailMessage("Email updated — use it at your next sign-in.");
      form.reset();
    } else {
      setEmailMessage(result.message || "Couldn't update email");
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const result = await patchAccount({
      currentPassword: formData.get("currentPassword"),
      newPassword: formData.get("newPassword")
    });
    if (result.ok) {
      setPasswordMessage("Password changed — other sessions were signed out.");
      form.reset();
    } else {
      setPasswordMessage(result.message || "Couldn't change password");
    }
  }

  return (
    <div className="admin-panels">
      <form className="admin-panel" onSubmit={(event) => void changeEmail(event)}>
        <h2>Account email</h2>
        <p className="panel-note">
          Signed in as <strong>{email}</strong>. Changing it takes effect at your next sign-in.
        </p>
        <div className="field">
          <label htmlFor="acct-new-email">New email</label>
          <input id="acct-new-email" name="newEmail" type="email" maxLength={320} autoComplete="email" required />
        </div>
        <div className="field">
          <label htmlFor="acct-email-password">Confirm your password</label>
          <input
            id="acct-email-password"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>
        <button type="submit">Update email</button>
        <p className="form-status" aria-live="polite">{emailMessage}</p>
      </form>

      <form className="admin-panel" onSubmit={(event) => void changePassword(event)}>
        <h2>Password</h2>
        <p className="panel-note">Changing your password signs out every other session on this account.</p>
        <div className="field">
          <label htmlFor="acct-current-password">Current password</label>
          <input
            id="acct-current-password"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>
        <div className="field">
          <label htmlFor="acct-new-password">New password</label>
          <input id="acct-new-password" name="newPassword" type="password" autoComplete="new-password" required />
        </div>
        <button type="submit">Change password</button>
        <p className="form-status" aria-live="polite">{passwordMessage}</p>
      </form>
    </div>
  );
}
