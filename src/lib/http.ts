import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type { ZodError } from "zod";

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "ARCHIVED"
  | "UPLOAD_INVALID"
  | "INTERNAL_ERROR";

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  ARCHIVED: 409,
  UPLOAD_INVALID: 422,
  INTERNAL_ERROR: 500
};

export function newRequestId(): string {
  return randomUUID();
}

export function jsonSuccess<T>(data: T, requestId = newRequestId(), init?: ResponseInit): NextResponse {
  return NextResponse.json({ data, requestId }, { ...init, headers: { "Cache-Control": "no-store", ...init?.headers } });
}

export function jsonError(
  code: ErrorCode,
  message: string,
  options: { requestId?: string; fields?: Record<string, string>; status?: number } = {}
): NextResponse {
  return NextResponse.json(
    {
      error: { code, message, ...(options.fields ? { fields: options.fields } : {}) },
      requestId: options.requestId ?? newRequestId()
    },
    { status: options.status ?? STATUS_BY_CODE[code], headers: { "Cache-Control": "no-store" } }
  );
}

export function jsonValidationError(error: ZodError, requestId?: string): NextResponse {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    fields[key] ??= issue.message;
  }
  return jsonError("VALIDATION_ERROR", "Check the highlighted fields", { requestId, fields });
}
