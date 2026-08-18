"use client";

import { FormEvent, useState } from "react";

export function AccessForm() {
  const [message, setMessage] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("The login service is scheduled for Phase 2 of the build.");
  }

  return (
    <form className="access-card" onSubmit={submit} aria-label="Access an event album">
      <div className="field">
        <label htmlFor="event">Event name</label>
        <input id="event" name="event" autoComplete="organization" placeholder="Maya & Leo" required />
      </div>
      <div className="field">
        <label htmlFor="email">Your email</label>
        <input id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required />
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
      <button type="submit">Open the album <span aria-hidden="true">↗</span></button>
      <p className="form-status" aria-live="polite">{message}</p>
    </form>
  );
}
