import { credentialBox, ctaButton, EMAIL_WRAP_END, EMAIL_WRAP_START, escapeHtml } from "@/lib/email-theme";

export interface PasswordResetEmailInput {
  ownerName: string;
  ownerEmail: string;
  eventName: string | null;
  adminUrl: string;
  temporaryPassword: string;
}

export interface PasswordResetEmailContent {
  subject: string;
  text: string;
  html: string;
}

/** Sent when the platform resets an album host's password on their behalf. */
export function buildPasswordResetEmail(input: PasswordResetEmailInput): PasswordResetEmailContent {
  const subject = "Your TakeAPik password was reset";
  const albumLine = input.eventName ? ` for ${input.eventName}` : "";

  const text = [
    `Hi ${input.ownerName},`,
    "",
    `Your TakeAPik password${albumLine} was reset, and you've been signed out everywhere.`,
    "",
    "Sign in again with:",
    `Admin page: ${input.adminUrl}`,
    `Email: ${input.ownerEmail}`,
    `Temporary password: ${input.temporaryPassword}`,
    "",
    "Change it right after signing in (Settings → Password).",
    "",
    "If you didn't ask for this reset, reply to this email straight away."
  ].join("\n");

  const html = `${EMAIL_WRAP_START}
    <p style="margin:0 0 12px;">Hi ${escapeHtml(input.ownerName)},</p>
    <p style="margin:0 0 22px;">Your TakeAPik password${albumLine ? ` for <strong>${escapeHtml(input.eventName ?? "")}</strong>` : ""} was reset, and you've been signed out everywhere.</p>
    ${ctaButton(input.adminUrl, "Sign in again")}
    <p style="color:#5c5470;font-size:14px;margin:0 0 10px;">Use <strong>${escapeHtml(input.ownerEmail)}</strong> with this temporary password, then change it right after signing in (Settings &rarr; Password):</p>
    ${credentialBox("Temporary password", input.temporaryPassword)}
    <p style="color:#8a8398;font-size:13px;margin:14px 0 0;">If you didn't ask for this reset, reply to this email straight away.</p>${EMAIL_WRAP_END}`;

  return { subject, text, html };
}
