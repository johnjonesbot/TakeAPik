import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { getEnv } from "@/lib/env";

/**
 * AES-256-GCM sealing for small server-side secrets (e.g. TOTP seeds) so a
 * database dump alone cannot reveal them. Key is derived from SESSION_SECRET.
 */
function derivedKey(purpose: string): Buffer {
  return Buffer.from(hkdfSync("sha256", getEnv().SESSION_SECRET, "takeapik-secret-box", purpose, 32));
}

export function sealSecret(plaintext: string, purpose: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", derivedKey(purpose), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [iv.toString("base64url"), encrypted.toString("base64url"), cipher.getAuthTag().toString("base64url")].join(".");
}

export function openSecret(sealed: string, purpose: string): string {
  const [iv, encrypted, tag] = sealed.split(".");
  if (!iv || !encrypted || !tag) throw new Error("Malformed sealed secret");
  const decipher = createDecipheriv("aes-256-gcm", derivedKey(purpose), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}
