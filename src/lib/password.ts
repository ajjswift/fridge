import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * scrypt from Node's standard library — no native dependency to keep working,
 * and strong enough that a stolen database file doesn't hand over passwords.
 */
const KEY_LENGTH = 64;
const SCRYPT_COST = { N: 16384, r: 8, p: 1 };

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, KEY_LENGTH, SCRYPT_COST);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltHex, keyHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !keyHex) return false;

  const expected = Buffer.from(keyHex, "hex");
  let actual: Buffer;
  try {
    actual = scryptSync(
      password,
      Buffer.from(saltHex, "hex"),
      expected.length,
      SCRYPT_COST,
    );
  } catch {
    return false;
  }
  // Constant-time so a wrong password can't be narrowed down by timing.
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Deliberately gentle: this is a shared kitchen, not a bank. */
export function passwordProblem(password: string): string | null {
  if (password.length < 8) return "Passwords need to be at least 8 characters.";
  if (password.length > 200) return "That password is too long.";
  return null;
}

export function usernameProblem(username: string): string | null {
  if (username.length < 2) return "Usernames need at least 2 characters.";
  if (username.length > 32) return "That username is too long.";
  if (!/^[a-z0-9._-]+$/i.test(username)) {
    return "Usernames can only use letters, numbers, dots, dashes and underscores.";
  }
  return null;
}
