import argon2 from "argon2";

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456, // 19 MiB — OWASP-recommended Argon2id baseline
  timeCost: 2,
  parallelism: 1
} as const;

export const MIN_PASSWORD_LENGTH = 12;

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

/**
 * Hash of the empty string, verified against when no account matches so
 * lookups take the same time whether or not the identifier exists.
 */
let dummyHashPromise: Promise<string> | undefined;

export function getDummyPasswordHash(): Promise<string> {
  dummyHashPromise ??= hashPassword("dummy-password-for-constant-behavior");
  return dummyHashPromise;
}
