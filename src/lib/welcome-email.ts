import { credentialBox, ctaButton, EMAIL_WRAP_END, EMAIL_WRAP_START, escapeHtml, step } from "@/lib/email-theme";

export interface WelcomeEmailInput {
  ownerName: string;
  ownerEmail: string;
  eventName: string;
  eventDate: Date;
  albumUrl: string;
  adminUrl: string;
  accessCode: string;
  /** Present only when the account was newly created; shown once. */
  temporaryPassword?: string;
}

export interface WelcomeEmailContent {
  subject: string;
  text: string;
  html: string;
}

/** Onboarding email sent to the host the moment their album is provisioned. */
export function buildWelcomeEmail(input: WelcomeEmailInput): WelcomeEmailContent {
  const eventDate = input.eventDate.toISOString().slice(0, 10);
  const subject = `Your photo album for ${input.eventName} is ready`;

  const passwordTextLine = input.temporaryPassword
    ? `Temporary password: ${input.temporaryPassword} (change it after your first sign-in, in Settings)`
    : "Password: use your existing TakeAPik password.";

  const text = [
    `Hi ${input.ownerName},`,
    "",
    `Your private photo album for ${input.eventName} is ready.`,
    "",
    "Your sign-in details:",
    `Admin page: ${input.adminUrl}`,
    `Email: ${input.ownerEmail}`,
    passwordTextLine,
    "",
    "The code your guests use (share this one, never your password):",
    `Access code: ${input.accessCode}`,
    "",
    "How TakeAPik works:",
    "1. Add your friends in Settings — each one automatically receives an invitation email with their personal link and the access code.",
    `2. Uploads open one week before your event date (${eventDate}). Guests take or choose photos on their phones; everything lands in one shared album only your guests can see.`,
    "3. The album stays live for 90 days after that. Export your photos from Settings before the window closes.",
    "",
    `Your album: ${input.albumUrl}`,
    "",
    "Questions? Just reply to this email."
  ].join("\n");

  const html = `${EMAIL_WRAP_START}
    <p style="margin:0 0 12px;">Hi ${escapeHtml(input.ownerName)},</p>
    <p style="margin:0 0 22px;">Your private photo album for <strong>${escapeHtml(input.eventName)}</strong> is ready.</p>
    ${ctaButton(input.adminUrl, "Open your admin page")}
    <p style="color:#5c5470;font-size:14px;margin:0 0 10px;">Sign in with <strong>${escapeHtml(input.ownerEmail)}</strong>${input.temporaryPassword ? " and this temporary password (change it after your first sign-in):" : " and your existing TakeAPik password."}</p>
    ${input.temporaryPassword ? credentialBox("Temporary password", input.temporaryPassword) : ""}
    <p style="color:#5c5470;font-size:14px;margin:18px 0 10px;">The code your guests use — share <em>this</em>, never your password:</p>
    ${credentialBox("Guest access code", input.accessCode)}
    <p style="font-size:16px;font-weight:700;margin:26px 0 14px;">How it works</p>
    ${step(1, "Add your friends", "In Settings, add each guest's name and email — they automatically receive an invitation with their personal link and the access code.")}
    ${step(2, "Everyone shoots, one album", `Uploads open a week before your event (${eventDate}). Photos are resized on each phone and only your guests can see them.`)}
    ${step(3, "Keep what matters", "The album stays live for 90 days after that — export everything from Settings before the window closes.")}
    <p style="color:#8a8398;font-size:13px;margin:18px 0 0;">Your album lives at <a href="${escapeHtml(input.albumUrl)}" style="color:#ff684f;">${escapeHtml(input.albumUrl)}</a>. Questions? Just reply to this email.</p>${EMAIL_WRAP_END}`;

  return { subject, text, html };
}
