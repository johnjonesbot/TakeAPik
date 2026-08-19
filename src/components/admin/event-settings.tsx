"use client";

import { FormEvent, useEffect, useState } from "react";

interface Settings {
  name: string;
  timezone: string;
  accessCode: string | null;
  accessCodeLastChangedAt: string;
}

interface Envelope<T> {
  data?: T;
  error?: { message?: string };
}

export function EventSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [message, setMessage] = useState("");
  const [rotateMessage, setRotateMessage] = useState("");
  const [confirmingRotate, setConfirmingRotate] = useState(false);
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
    setRotateMessage("");
    const formData = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/v1/admin/event/access-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: formData.get("currentPassword") })
      });
      const payload = (await response.json()) as Envelope<{ accessCode: string }>;
      if (response.ok && payload.data) {
        setSettings((prev) =>
          prev
            ? { ...prev, accessCode: payload.data!.accessCode, accessCodeLastChangedAt: new Date().toISOString() }
            : prev
        );
        setConfirmingRotate(false);
        setRotateMessage("Access code rotated — the old code no longer works.");
      } else {
        setRotateMessage(payload.error?.message ?? "Rotation failed");
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

      <div className="admin-panel">
        <h2>Access code</h2>
        {settings.accessCode ? (
          <p className="rotated-code" role="status">
            Current code: <strong>{settings.accessCode}</strong> — share it with any guest, any time.
          </p>
        ) : (
          <p className="panel-note">
            Your current code was set before codes became viewable here. It still works — rotate once and
            the new code will stay visible on this page.
          </p>
        )}
        <p className="panel-note">
          Last changed {new Date(settings.accessCodeLastChangedAt).toLocaleDateString()}.
        </p>
        {!confirmingRotate ? (
          <button type="button" className="ghost" onClick={() => { setRotateMessage(""); setConfirmingRotate(true); }}>
            Rotate access code
          </button>
        ) : (
          <form className="archive-confirm" onSubmit={(event) => void rotate(event)}>
            <p className="panel-note">
              <strong>Are you sure?</strong> Rotating creates a new code and invalidates the current one
              immediately — guests who only have the old code won&apos;t be able to log in until you share
              the new one.
            </p>
            <div className="field">
              <label htmlFor="rotate-password">Confirm your password</label>
              <input
                id="rotate-password"
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>
            <div className="upload-actions">
              <button type="button" className="ghost" onClick={() => setConfirmingRotate(false)}>
                Cancel
              </button>
              <button type="submit" className="ghost danger" disabled={rotating}>
                {rotating ? "Rotating…" : "Yes, rotate the code"}
              </button>
            </div>
          </form>
        )}
        <p className="form-status" aria-live="polite">{rotateMessage}</p>
      </div>
    </div>
  );
}
