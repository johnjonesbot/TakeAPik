"use client";

import { FormEvent, useState } from "react";

interface AdminLoginResponse {
  data?: { mfaRequired?: boolean };
  error?: { message?: string };
}

interface AdminLoginFormProps {
  title: string;
  /** Album slug for an event-admin login; omit for the super-admin portal. */
  slug?: string;
}

export function AdminLoginForm({ title, slug }: AdminLoginFormProps) {
  const [message, setMessage] = useState("");
  const [needsMfa, setNeedsMfa] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");

    const formData = new FormData(event.currentTarget);
    const totp = String(formData.get("totp") ?? "");
    try {
      const response = await fetch("/api/v1/auth/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.get("email"),
          password: formData.get("password"),
          ...(slug ? { slug } : {}),
          ...(totp ? { totpCode: totp } : {})
        })
      });
      const payload = (await response.json()) as AdminLoginResponse;
      if (!response.ok) {
        setMessage(payload.error?.message ?? "Something went wrong; try again");
        return;
      }
      if (payload.data?.mfaRequired) {
        setNeedsMfa(true);
        setMessage("Enter the 6-digit code from your authenticator app");
        return;
      }
      window.location.reload();
    } catch {
      setMessage("Network trouble; try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="access-card" onSubmit={submit} aria-label={title}>
      <div className="field">
        <label htmlFor="admin-email">Email</label>
        <input id="admin-email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="field">
        <label htmlFor="admin-password">Password</label>
        <input id="admin-password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {needsMfa ? (
        <div className="field">
          <label htmlFor="admin-totp">Authenticator code</label>
          <input
            id="admin-totp"
            name="totp"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
          />
        </div>
      ) : null}
      <button type="submit" disabled={busy}>{busy ? "Checking…" : "Sign in"}</button>
      <p className="form-status" aria-live="polite">{message}</p>
    </form>
  );
}
