"use client";

import { useEffect, useRef, useState } from "react";

interface ExportView {
  id: string;
  status: "queued" | "running" | "completed" | "failed";
  photoCount: number | null;
  downloadUrl?: string;
  expiresAt: string | null;
}

interface Envelope<T> {
  data?: T;
  error?: { message?: string };
}

export function ExportPanel() {
  const [current, setCurrent] = useState<ExportView | null>(null);
  const [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  function watch(exportId: string) {
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => {
      void (async () => {
        const response = await fetch(`/api/v1/admin/exports/${exportId}`);
        const payload = (await response.json()) as Envelope<{ export: ExportView }>;
        if (response.ok && payload.data) {
          setCurrent(payload.data.export);
          if (payload.data.export.status === "completed" || payload.data.export.status === "failed") {
            if (timer.current) clearInterval(timer.current);
          }
        }
      })();
    }, 4000);
  }

  async function start() {
    setMessage("");
    const response = await fetch("/api/v1/admin/exports", { method: "POST" });
    const payload = (await response.json()) as Envelope<{ export: ExportView }>;
    if (response.ok && payload.data) {
      setCurrent(payload.data.export);
      watch(payload.data.export.id);
    } else {
      setMessage(payload.error?.message ?? "Couldn't start the export");
    }
  }

  return (
    <section className="admin-panel">
      <h2>Download everything</h2>
      <p className="panel-note">
        Packages every photo into a ZIP in the background. The download link works for 7 days and is
        available only to you.
      </p>
      {current?.status === "completed" && current.downloadUrl ? (
        <a className="button-link" href={current.downloadUrl}>
          Download {current.photoCount} photos (ZIP)
        </a>
      ) : current && current.status !== "failed" ? (
        <p className="panel-note" role="status">Export {current.status}…</p>
      ) : (
        <button type="button" onClick={() => void start()}>Export the album</button>
      )}
      {current?.status === "failed" ? <p className="form-status">The export failed; try again.</p> : null}
      <p className="form-status" aria-live="polite">{message}</p>
    </section>
  );
}
