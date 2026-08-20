import { credentialBox, ctaButton, EMAIL_WRAP_END, EMAIL_WRAP_START, escapeHtml, step } from "@/lib/email-theme";

export interface InviteEmailInput {
  friendName: string;
  eventName: string;
  inviteUrl: string;
  /** Plaintext access code (ADR-006); null for legacy events until rotation. */
  accessCode: string | null;
  expiresAt: Date;
}

export interface InviteEmailContent {
  subject: string;
  text: string;
  html: string;
}

/**
 * Invitation email carrying everything a friend needs: the personal album
 * link and the event's access code (a product decision superseding the old
 * link-only invite — the email is the credential envelope).
 */
export function buildInviteEmail(input: InviteEmailInput): InviteEmailContent {
  const expires = input.expiresAt.toISOString().slice(0, 10);
  const subject = `You're invited to the photo album for ${input.eventName}`;

  const codeLineText = input.accessCode
    ? `Your access code: ${input.accessCode}`
    : "You'll also need the event's 8-digit access code from your host.";

  const text = [
    `Hi ${input.friendName},`,
    "",
    `You've been invited to share and see photos from ${input.eventName} on TakeAPik.`,
    "",
    "How it works:",
    "1. Open your album with the link below.",
    "2. Sign in with this email address and the access code.",
    "3. Take or choose photos — they're resized on your phone and only the album's guests can see them.",
    "",
    `Open your album: ${input.inviteUrl}`,
    codeLineText,
    "",
    `This link is personal to you and expires on ${expires}.`,
    "",
    "If you weren't expecting this, you can ignore this email."
  ].join("\n");

  const html = `${EMAIL_WRAP_START}
    <p style="margin:0 0 12px;">Hi ${escapeHtml(input.friendName)},</p>
    <p style="margin:0 0 22px;">You've been invited to share and see photos from <strong>${escapeHtml(input.eventName)}</strong>.</p>
    ${step(1, "Open your album", "Use the button below — the link is personal to you.")}
    ${step(2, "Sign in", "Enter this email address and the access code.")}
    ${step(3, "Add your photos", "Take or choose pictures; they're resized on your phone and only the album's guests see them.")}
    <div style="margin:22px 0 0;">
    ${ctaButton(input.inviteUrl, "Open your album")}
    ${input.accessCode ? credentialBox("Access code", input.accessCode) : `<p style="color:#5c5470;font-size:13px;margin:0 0 14px;">You'll also need the event's 8-digit access code from your host.</p>`}
    </div>
    <p style="color:#8a8398;font-size:13px;margin:10px 0 0;">This link is personal to you and expires on ${expires}.</p>${EMAIL_WRAP_END}`;

  return { subject, text, html };
}
