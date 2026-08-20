"use client";

import { useState } from "react";

interface ShareAlbumButtonProps {
  eventName: string;
  accessCode: string;
}

/**
 * One tap opens the device's native share sheet (Messages, WhatsApp, mail,
 * DMs — whatever the phone offers) with the album link and access code.
 * Desktop browsers without the share API copy the same text instead.
 */
export function ShareAlbumButton({ eventName, accessCode }: ShareAlbumButtonProps) {
  const [status, setStatus] = useState("");

  async function share() {
    setStatus("");
    const albumUrl = window.location.href.replace(/\/admin.*$/, "");
    const text = [
      `You're invited to the photo album for ${eventName}!`,
      `Open ${albumUrl} and sign in with your email address and this access code: ${accessCode}`
    ].join("\n");

    if (navigator.share) {
      try {
        await navigator.share({ title: `Photo album — ${eventName}`, text });
        setStatus("Shared.");
      } catch {
        // The user closed the share sheet; not an error.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Invite text copied — paste it anywhere.");
    } catch {
      setStatus(text);
    }
  }

  return (
    <>
      <button type="button" onClick={() => void share()}>
        Share the album link
      </button>
      <p className="form-status" aria-live="polite">{status}</p>
    </>
  );
}
