import { randomInt } from "node:crypto";
import argon2 from "argon2";
import { getEnv } from "@/lib/env";

/** Eight digits, cryptographically random, leading zeroes preserved. */
export function generateAccessCode(): string {
  return String(randomInt(0, 100_000_000)).padStart(8, "0");
}

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456, // 19 MiB — OWASP-recommended Argon2id baseline
  timeCost: 2,
  parallelism: 1
} as const;

function pepper(): Buffer {
  return Buffer.from(getEnv().TOKEN_HASH_PEPPER, "utf8");
}

/** Keyed slow hash so a leaked database alone cannot be brute-forced offline. */
export async function hashAccessCode(code: string): Promise<string> {
  return argon2.hash(code, { ...ARGON2_OPTIONS, secret: pepper() });
}

export async function verifyAccessCode(hash: string, code: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, code, { secret: pepper() });
  } catch {
    return false;
  }
}
