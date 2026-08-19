"use client";

import { FormEvent, useState } from "react";

interface AccessFormProps {
  /** "root" locates the album from email+code; "tenant" logs into a known album. */
  surface?: "root" | "tenant";
  /** Required for the "tenant" surface — the album this form signs into. */
  slug?: string;
  /** Prefills from an invitation link; the access code is always typed. */
  defaultEmail?: string;
}

interface FriendLoginResponse {
  data?: { slug?: string };
  error?: { message?: string };
}

export function AccessForm({ surface = "root", slug, defaultEmail }: AccessFormProps) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");

    const formData = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/v1/auth/friend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.get("email"),
          accessCode: formData.get("code"),
          ...(surface === "tenant" && slug ? { slug } : {})
        })
      });
      const payload = (await response.json()) as FriendLoginResponse;
      if (!response.ok || !payload.data?.slug) {
        setMessage(payload.error?.message ?? "Something went wrong; try again");
        return;
      }
      setMessage("Opening your album…");
      window.location.assign(`/a/${payload.data.slug}`);
    } catch {
      setMessage("Network trouble; try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="access-card" onSubmit={submit} aria-label="Access an event album">
      <div className="field">
        <label htmlFor="email">Your email</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          defaultValue={defaultEmail}
          required
        />
      </div>
      <div className="field">
        <label htmlFor="code">8-digit event code</label>
        <input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{8}"
          maxLength={8}
          placeholder="••••••••"
          required
        />
      </div>
      <button type="submit" disabled={busy}>
        {busy ? "Checking…" : "Open the album"} <span aria-hidden="true">↗</span>
      </button>
      <p className="form-status" aria-live="polite">{message}</p>
    </form>
  );
}
