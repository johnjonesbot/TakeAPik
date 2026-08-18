import { createHmac } from "node:crypto";
import { getEnv } from "@/lib/env";
import { constantTimeEquals } from "@/lib/tokens";

export interface PhotoCursor {
  createdAt: string; // ISO-8601
  id: string;
}

function sign(payload: string): string {
  return createHmac("sha256", getEnv().SESSION_SECRET).update(`cursor:${payload}`).digest("base64url").slice(0, 24);
}

/** Opaque, tamper-evident cursor so clients can never construct or edit one. */
export function encodeCursor(cursor: PhotoCursor): string {
  const payload = Buffer.from(JSON.stringify(cursor)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function decodeCursor(value: string): PhotoCursor | null {
  const [payload, signature] = value.split(".");
  if (!payload || !signature || !constantTimeEquals(sign(payload), signature)) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as PhotoCursor).createdAt !== "string" ||
      typeof (parsed as PhotoCursor).id !== "string"
    ) {
      return null;
    }
    return parsed as PhotoCursor;
  } catch {
    return null;
  }
}
