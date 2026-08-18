"use client";

import { FormEvent, useState } from "react";

interface AccessFormProps {
  /** "root" locates the album and follows a handoff; "tenant" signs in directly. */
  surface?: "root" | "tenant";
  /** Prefills from an invitation link; the access code is always typed. */
  defaultEmail?: string;
}

interface FriendLoginResponse {
  data?: { handoff?: { token: string; action: string } };
  error?: { message?: string };
}

/** Cross-subdomain navigation POST that lets the tenant host set its cookie. */
function submitHandoff(action: string, token: string): void {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = action;
  const field = document.createElement("input");
  field.type = "hidden";
  field.name = "token";
  field.value = token;
  form.appendChild(field);
  document.body.appendChild(form);
  form.submit();
}

export function AccessForm({ surface = "root", defaultEmail }: AccessFormProps) {
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
          accessCode: formData.get("code")
        })
      });
      const payload = (await response.json()) as FriendLoginResponse;
      if (!response.ok) {
        setMessage(payload.error?.message ?? "Something went wrong; try again");
        return;
      }
      if (surface === "root" && payload.data?.handoff) {
        setMessage("Opening your album…");
        submitHandoff(payload.data.handoff.action, payload.data.handoff.token);
        return;
      }
      window.location.assign("/");
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
