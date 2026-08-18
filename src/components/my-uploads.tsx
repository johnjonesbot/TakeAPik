"use client";

import { useState } from "react";
import { PhotoGallery, type GalleryPhoto } from "@/components/photo-gallery";

function EditControls({ photo, refresh }: { photo: GalleryPhoto; refresh: () => void }) {
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState("");

  async function saveDescription(formData: FormData) {
    const description = String(formData.get("description") ?? "").trim();
    const response = await fetch(`/api/v1/photos/${photo.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: description || null })
    });
    if (response.ok) {
      setEditing(false);
      refresh();
    } else {
      setMessage("Couldn't save; try again");
    }
  }

  async function remove() {
    const response = await fetch(`/api/v1/photos/${photo.id}`, { method: "DELETE" });
    if (response.ok) refresh();
    else setMessage("Couldn't remove; try again");
  }

  if (editing) {
    return (
      <form
        className="extras-edit"
        onSubmit={(event) => {
          event.preventDefault();
          void saveDescription(new FormData(event.currentTarget));
        }}
      >
        <input name="description" defaultValue={photo.description ?? ""} maxLength={1000} placeholder="Description" />
        <button type="submit">Save</button>
        <button type="button" className="ghost" onClick={() => setEditing(false)}>Cancel</button>
        <span className="form-status">{message}</span>
      </form>
    );
  }

  return (
    <div className="extras-actions">
      <button type="button" className="ghost" onClick={() => setEditing(true)}>Edit</button>
      <button type="button" className="ghost danger" onClick={() => void remove()}>Remove</button>
      <span className="form-status">{message}</span>
    </div>
  );
}

export function MyUploads() {
  return (
    <PhotoGallery
      endpoint="/api/v1/photos/mine"
      emptyMessage="You haven't added any photos yet."
      renderExtras={(photo, refresh) => <EditControls photo={photo} refresh={refresh} />}
    />
  );
}
