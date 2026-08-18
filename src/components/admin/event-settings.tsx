"use client";

import { FormEvent, useEffect, useState } from "react";

interface Settings {
  name: string;
  timezone: string;
  accessCodeLastChangedAt: string;
}

interface Envelope<T> {
  data?: T;
  error?: { message?: string };
}

export function EventSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [message, setMessage] = useState("");
  const [rotated, setRotated] = useState("");
  const [rotating, setRotating] = useState(false);

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/v1/admin/event");
      const payload = (await response.json()) as Envelope<Settings>;
      if (response.ok && payload.data) setSettings(payload.data);
    })();
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const response = await fetch("/api/v1/admin/event", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: formData.get("name"), timezone: formData.get("timezone") })
    });
    const payload = (await response.json()) as Envelope<Settings>;
    if (response.ok && payload.data) {
      setSettings(payload.data);
      setMessage("Saved");
    } else {
      setMessage(payload.error?.message ?? "Couldn't save");
    }
  }

  async function rotate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (rotating) return;
    setRotating(true);
    setRotated("");
    const formData = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/v1/admin/event/access-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: formData.get("currentPassword") })
      });
      const payload = (await response.json()) as Envelope<{ accessCode: string }>;
      if (response.ok && payload.data) {
        setRotated(payload.data.accessCode);
        event.currentTarget?.reset?.();
      } else {
        setMessage(payload.error?.message ?? "Rotation failed");
      }
    } finally {
      setRotating(false);
    }
  }

  if (!settings) return <p className="gallery-status">Loading…</p>;

  return (
    <div className="admin-panels">
      <form className="admin-panel" onSubmit={(event) => void save(event)}>
        <h2>Event details</h2>
        <div className="field">
          <label htmlFor="event-name">Event name</label>
          <input id="event-name" name="name" defaultValue={settings.name} maxLength={200} required />
        </div>
        <div className="field">
          <label htmlFor="event-tz">Timezone</label>
          <input id="event-tz" name="timezone" defaultValue={settings.timezone} maxLength={64} required />
        </div>
        <button type="submit">Save changes</button>
        <p className="form-status" aria-live="polite">{message}</p>
      </form>

      <form className="admin-panel" onSubmit={(event) => void rotate(event)}>
        <h2>Access code</h2>
        <p className="panel-note">
          Last changed {new Date(settings.accessCodeLastChangedAt).toLocaleDateString()}. Rotating
          invalidates the old code immediately; the new one is shown once, only to you.
        </p>
        <div className="field">
          <label htmlFor="rotate-password">Confirm your password</label>
          <input id="rotate-password" name="currentPassword" type="password" autoComplete="current-password" required />
        </div>
        <button type="submit" disabled={rotating}>{rotating ? "Rotating…" : "Rotate access code"}</button>
        {rotated ? (
          <p className="rotated-code" role="status">
            New code: <strong>{rotated}</strong> — share it with your guests now; it won&apos;t be shown again.
          </p>
        ) : null}
      </form>
    </div>
  );
}
