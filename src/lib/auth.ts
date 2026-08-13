import "server-only";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";

export const SESSION_COOKIE = "recime_session";
const SESSION_DAYS = 60;

export type User = {
  id: number;
  username: string;
  display_name: string | null;
  created_by: number | null;
  created_at: string;
};

export type SessionUser = User & { sessionToken: string };

function expiryTimestamp(days: number): string {
  return new Date(Date.now() + days * 86_400_000)
    .toISOString()
    .replace("T", " ")
    .slice(0, 19);
}

export function createSession(userId: number, userAgent?: string | null): {
  token: string;
  maxAge: number;
} {
  const token = randomBytes(32).toString("base64url");
  db.prepare(
    "INSERT INTO sessions (token, user_id, user_agent, expires_at) VALUES (?, ?, ?, ?)",
  ).run(token, userId, userAgent?.slice(0, 200) ?? null, expiryTimestamp(SESSION_DAYS));
  return { token, maxAge: SESSION_DAYS * 86_400 };
}

export function destroySession(token: string) {
  db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

export function destroyAllSessionsFor(userId: number) {
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
}

/** The signed-in user, or null. Never throws — safe to call anywhere. */
export async function currentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const row = db
    .prepare(
      `SELECT u.id, u.username, u.display_name, u.created_by, u.created_at
         FROM sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.token = ? AND s.expires_at > datetime('now')`,
    )
    .get(token) as User | undefined;

  return row ? { ...row, sessionToken: token } : null;
}

/** For pages and layouts: bounces to the sign-in screen when signed out. */
export async function requireUser(returnTo?: string): Promise<SessionUser> {
  const user = await currentUser();
  if (user) return user;
  redirect(returnTo ? `/login?next=${encodeURIComponent(returnTo)}` : "/login");
}

export function getUsers(): Array<User & { session_count: number }> {
  return db
    .prepare(
      `SELECT u.id, u.username, u.display_name, u.created_by, u.created_at,
              (SELECT COUNT(*) FROM sessions s
                WHERE s.user_id = u.id AND s.expires_at > datetime('now')) AS session_count
         FROM users u
        ORDER BY u.id`,
    )
    .all() as Array<User & { session_count: number }>;
}

export function countUsers(): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n;
}
