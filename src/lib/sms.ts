import { getLogger } from "@/lib/logger";

export interface SmsMessage {
  /** Recipient in E.164 form. */
  to: string;
  text: string;
}

export interface SentSms {
  messageId: string;
}

/** SMS seam: an android-sms-gateway in real environments, a fake in tests. */
export interface SmsSender {
  send(message: SmsMessage): Promise<SentSms>;
}

/**
 * Sends through android-sms-gateway (SMSGate): POST {base}/3rdparty/v1/message
 * with Basic auth and a { message, phoneNumbers } body. The gateway is the
 * host's own Android phone (cloud, local, or self-hosted), so texts go out as
 * ordinary SMS from a real number — no A2P/10DLC registration.
 */
class GatewaySmsSender implements SmsSender {
  constructor(
    private readonly baseUrl: string,
    private readonly username: string,
    private readonly password: string
  ) {}

  async send(message: SmsMessage): Promise<SentSms> {
    const url = `${this.baseUrl.replace(/\/+$/, "")}/3rdparty/v1/message`;
    const auth = Buffer.from(`${this.username}:${this.password}`).toString("base64");
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
      body: JSON.stringify({ message: message.text, phoneNumbers: [message.to] })
    });
    if (!response.ok) {
      throw new Error(`sms gateway responded ${response.status}`);
    }
    const data = (await response.json().catch(() => ({}))) as { id?: string };
    return { messageId: String(data.id ?? "") };
  }
}

/** Fallback when the gateway is unconfigured: log the event, never the text. */
class LogOnlySmsSender implements SmsSender {
  async send(): Promise<SentSms> {
    getLogger().info("sms suppressed (gateway not configured)");
    return { messageId: `log-only-${Date.now()}` };
  }
}

let smsSender: SmsSender | undefined;

export function getSmsSender(): SmsSender {
  if (!smsSender) {
    const { SMS_GATEWAY_URL, SMS_GATEWAY_USERNAME, SMS_GATEWAY_PASSWORD } = process.env;
    smsSender =
      SMS_GATEWAY_URL && SMS_GATEWAY_USERNAME && SMS_GATEWAY_PASSWORD
        ? new GatewaySmsSender(SMS_GATEWAY_URL, SMS_GATEWAY_USERNAME, SMS_GATEWAY_PASSWORD)
        : new LogOnlySmsSender();
  }
  return smsSender;
}

export function setSmsSenderForTesting(replacement: SmsSender | undefined): void {
  smsSender = replacement;
}
