import nodemailer, { type Transporter } from "nodemailer";
import { getLogger } from "@/lib/logger";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface SentMail {
  messageId: string;
}

/** Mailer seam: SMTP in real environments, a fake in tests. */
export interface Mailer {
  send(message: MailMessage): Promise<SentMail>;
}

class SmtpMailer implements Mailer {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor() {
    const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD, EMAIL_FROM } = process.env;
    if (!SMTP_HOST || !EMAIL_FROM) {
      throw new Error("Email is not configured: set SMTP_HOST and EMAIL_FROM");
    }
    this.from = EMAIL_FROM;
    this.transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT ?? 587),
      secure: SMTP_SECURE === "true",
      auth: SMTP_USER && SMTP_PASSWORD ? { user: SMTP_USER, pass: SMTP_PASSWORD } : undefined
    });
  }

  async send(message: MailMessage): Promise<SentMail> {
    const result = await this.transporter.sendMail({ from: this.from, ...message });
    return { messageId: String(result.messageId ?? "") };
  }
}

/** Development fallback when SMTP is unset: log the event, never the content. */
class LogOnlyMailer implements Mailer {
  async send(message: MailMessage): Promise<SentMail> {
    getLogger().info("email suppressed (SMTP not configured)", { subject: message.subject });
    return { messageId: `log-only-${Date.now()}` };
  }
}

let mailer: Mailer | undefined;

export function getMailer(): Mailer {
  if (!mailer) {
    mailer = process.env.SMTP_HOST ? new SmtpMailer() : new LogOnlyMailer();
  }
  return mailer;
}

export function setMailerForTesting(replacement: Mailer | undefined): void {
  mailer = replacement;
}
