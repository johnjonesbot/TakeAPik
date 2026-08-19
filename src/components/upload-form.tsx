"use client";

import { ChangeEvent, FormEvent, useRef, useState } from "react";
import { prepareImageForUpload, uploadPreparedImage, UploadError, type PreparedImage } from "@/lib/upload-flow.client";

type Stage =
  | { step: "pick" }
  | { step: "preparing" }
  | { step: "preview"; prepared: PreparedImage; previewUrl: string; filename: string }
  | { step: "uploading"; progress: number }
  | { step: "done" };

export function UploadForm() {
  const [stage, setStage] = useState<Stage>({ step: "pick" });
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  async function onFileChosen(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    setStage({ step: "preparing" });
    try {
      const prepared = await prepareImageForUpload(file);
      setStage({ step: "preview", prepared, previewUrl: URL.createObjectURL(prepared.blob), filename: file.name });
    } catch (cause) {
      setError(cause instanceof UploadError ? cause.message : "That photo couldn't be read.");
      setStage({ step: "pick" });
    }
  }

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (stage.step !== "preview") return;
    const description = String(new FormData(event.currentTarget).get("description") ?? "").trim();
    const { prepared, previewUrl, filename } = stage;
    setError("");
    setStage({ step: "uploading", progress: 0 });
    try {
      await uploadPreparedImage(prepared, filename, description, (fraction) =>
        setStage({ step: "uploading", progress: fraction })
      );
      URL.revokeObjectURL(previewUrl);
      setStage({ step: "done" });
    } catch (cause) {
      setError(cause instanceof UploadError ? cause.message : "Something went wrong; try again.");
      setStage({ step: "preview", prepared, previewUrl, filename });
    }
  }

  function reset() {
    if (stage.step === "preview") URL.revokeObjectURL(stage.previewUrl);
    if (fileInput.current) fileInput.current.value = "";
    setError("");
    setStage({ step: "pick" });
  }

  return (
    <div className="upload-flow">
      {stage.step === "pick" || stage.step === "preparing" ? (
        <label className={`upload-drop${stage.step === "preparing" ? " is-busy" : ""}`}>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            onChange={(event) => void onFileChosen(event)}
            disabled={stage.step === "preparing"}
          />
          <strong>{stage.step === "preparing" ? "Preparing…" : "Take or choose a photo"}</strong>
          <span>It's resized on your phone before it leaves — location data never uploads.</span>
        </label>
      ) : null}

      {stage.step === "preview" ? (
        <form className="upload-preview" onSubmit={(event) => void publish(event)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={stage.previewUrl} alt="Your photo, ready to publish" />
          <div className="field">
            <label htmlFor="description">Say something about it (optional)</label>
            <input id="description" name="description" maxLength={1000} placeholder="The moment right before…" />
          </div>
          <div className="upload-actions">
            <button type="button" className="ghost" onClick={reset}>Different photo</button>
            <button type="submit">Add to the album</button>
          </div>
        </form>
      ) : null}

      {stage.step === "uploading" ? (
        <div className="upload-progress" role="status">
          <div className="upload-bar"><i style={{ width: `${Math.round(stage.progress * 100)}%` }} /></div>
          <p>Uploading… {Math.round(stage.progress * 100)}%</p>
        </div>
      ) : null}

      {stage.step === "done" ? (
        <div className="upload-done" role="status">
          <p><strong>It's in the album.</strong></p>
          <div className="upload-actions">
            <button type="button" className="ghost" onClick={reset}>Add another</button>
            <a className="button-link" href="/">See the album</a>
          </div>
        </div>
      ) : null}

      <p className="form-status" aria-live="polite">{error}</p>
    </div>
  );
}
