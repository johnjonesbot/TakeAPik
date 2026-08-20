/**
 * Shared pieces for transactional email. Deliverability-first aesthetics:
 * multipart text+html, table-free simple layout, inline styles only, no
 * remote images (the wordmark is styled text), moderate link count, and a
 * plain-language footer. Anything spammy-looking (all caps, urgency, image
 * walls) stays out.
 */

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export const EMAIL_WRAP_START = `<!doctype html><html><body style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;background:#f6f4fb;margin:0;padding:32px 16px;color:#241d31;">
  <div style="max-width:540px;margin:0 auto;background:#ffffff;border:1px solid #eee8f6;border-radius:18px;padding:34px;">
    <p style="font-size:23px;font-weight:800;letter-spacing:-0.04em;margin:0 0 26px;">take<span style="color:#ff684f;">a</span>pik</p>`;

export const EMAIL_WRAP_END = `
    <p style="border-top:1px solid #eee8f6;color:#8a8398;font-size:12px;line-height:1.6;margin:28px 0 0;padding-top:16px;">
      TakeAPik — private photo albums for real events. This message was sent because an album host added
      this address. If you weren't expecting it, you can safely ignore it.
    </p>
  </div>
</body></html>`;

/** The white-on-dark pill that makes a code or password easy to read and copy. */
export function credentialBox(label: string, value: string): string {
  return `<div style="background:#171022;border-radius:12px;margin:0 0 14px;padding:14px 18px;">
      <p style="color:#b8b1c9;font-size:11px;letter-spacing:0.09em;margin:0 0 4px;text-transform:uppercase;">${escapeHtml(label)}</p>
      <p style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:0.08em;margin:0;">${escapeHtml(value)}</p>
    </div>`;
}

export function ctaButton(url: string, label: string): string {
  return `<p style="margin:0 0 24px;"><a href="${escapeHtml(url)}" style="background:#ff684f;border-radius:10px;color:#ffffff;display:inline-block;font-weight:700;padding:13px 22px;text-decoration:none;">${escapeHtml(label)}</a></p>`;
}

export function step(n: number, title: string, body: string): string {
  return `<p style="margin:0 0 12px;"><strong style="color:#ff684f;">${n}.</strong> <strong>${escapeHtml(title)}</strong><br>
      <span style="color:#5c5470;font-size:14px;">${escapeHtml(body)}</span></p>`;
}
