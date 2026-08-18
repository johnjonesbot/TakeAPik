export interface InviteEmailInput {
  friendName: string;
  eventName: string;
  inviteUrl: string;
  expiresAt: Date;
}

export interface InviteEmailContent {
  subject: string;
  text: string;
  html: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * Invitation email. The link selects the event and membership; the shared
 * eight-digit access code is intentionally never included.
 */
export function buildInviteEmail(input: InviteEmailInput): InviteEmailContent {
  const expires = input.expiresAt.toISOString().slice(0, 10);
  const subject = `You're invited to the photo album for ${input.eventName}`;
  const text = [
    `Hi ${input.friendName},`,
    "",
    `You've been invited to share and see photos from ${input.eventName} on TakeAPik.`,
    "",
    `Open your album: ${input.inviteUrl}`,
    "",
    "You'll also need the event's 8-digit access code from your host.",
    `This link is personal to you and expires on ${expires}.`,
    "",
    "If you weren't expecting this, you can ignore this email."
  ].join("\n");

  const html = `<!doctype html><html><body style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;background:#f6f4fb;margin:0;padding:32px 16px;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px;">
    <p style="font-size:22px;font-weight:800;letter-spacing:-0.04em;margin:0 0 24px;">take<span style="color:#ff684f;">a</span>pik</p>
    <p style="margin:0 0 12px;">Hi ${escapeHtml(input.friendName)},</p>
    <p style="margin:0 0 20px;">You've been invited to share and see photos from <strong>${escapeHtml(input.eventName)}</strong>.</p>
    <p style="margin:0 0 24px;"><a href="${escapeHtml(input.inviteUrl)}" style="background:#ff684f;border-radius:10px;color:#ffffff;display:inline-block;font-weight:700;padding:12px 20px;text-decoration:none;">Open your album</a></p>
    <p style="color:#666;font-size:13px;margin:0 0 6px;">You'll also need the event's 8-digit access code from your host.</p>
    <p style="color:#666;font-size:13px;margin:0;">This link is personal to you and expires on ${expires}. If you weren't expecting it, you can ignore this email.</p>
  </div>
</body></html>`;

  return { subject, text, html };
}
