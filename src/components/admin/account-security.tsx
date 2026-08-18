"use client";

import { FormEvent, useState } from "react";

interface Envelope<T> {
  data?: T;
  error?: { message?: string };
}

export function AccountSecurity() {
  const [passwordMessage, setPasswordMessage] = useState("");
  const [mfaMessage, setMfaMessage] = useState("");
  const [enrollmentUri, setEnrollmentUri] = useState("");

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const response = await fetch("/api/v1/admin/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPassword: formData.get("currentPassword"),
        newPassword: formData.get("newPassword")
      })
    });
    const payload = (await response.json()) as Envelope<unknown>;
    if (response.ok) {
      form.reset();
      setPasswordMessage("Password changed. Other devices were signed out.");
    } else {
      setPasswordMessage(payload.error?.message ?? "Couldn't change the password");
    }
  }

  async function startMfa() {
    const response = await fetch("/api/v1/admin/mfa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start" })
    });
    const payload = (await response.json()) as Envelope<{ enrollmentUri: string }>;
    if (response.ok && payload.data) {
      setEnrollmentUri(payload.data.enrollmentUri);
      setMfaMessage("Add the account to your authenticator app, then confirm with a code.");
    } else {
      setMfaMessage(payload.error?.message ?? "Couldn't start enrollment");
    }
  }

  async function confirmMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const response = await fetch("/api/v1/admin/mfa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "confirm", code: formData.get("code") })
    });
    const payload = (await response.json()) as Envelope<unknown>;
    if (response.ok) {
      setEnrollmentUri("");
      setMfaMessage("Two-factor authentication is on.");
    } else {
      setMfaMessage(payload.error?.message ?? "That code didn't match");
    }
  }

  return (
    <div className="admin-panels">
      <form className="admin-panel" onSubmit={(event) => void changePassword(event)}>
        <h2>Change password</h2>
        <div className="field">
          <label htmlFor="current-password">Current password</label>
          <input id="current-password" name="currentPassword" type="password" autoComplete="current-password" required />
        </div>
        <div className="field">
          <label htmlFor="new-password">New password (12+ characters)</label>
          <input id="new-password" name="newPassword" type="password" autoComplete="new-password" minLength={12} required />
        </div>
        <button type="submit">Change password</button>
        <p className="form-status" aria-live="polite">{passwordMessage}</p>
      </form>

      <section className="admin-panel">
        <h2>Two-factor authentication</h2>
        <p className="panel-note">Protects code rotation, exports, and account changes.</p>
        {enrollmentUri ? (
          <>
            <p className="enrollment-uri">{enrollmentUri}</p>
            <form onSubmit={(event) => void confirmMfa(event)} className="mfa-confirm">
              <div className="field">
                <label htmlFor="mfa-code">6-digit code</label>
                <input id="mfa-code" name="code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required />
              </div>
              <button type="submit">Confirm</button>
            </form>
          </>
        ) : (
          <button type="button" onClick={() => void startMfa()}>Set up authenticator app</button>
        )}
        <p className="form-status" aria-live="polite">{mfaMessage}</p>
      </section>
    </div>
  );
}
