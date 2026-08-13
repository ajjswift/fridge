"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb } from "./db";
import {
  SESSION_COOKIE,
  countUsers,
  createSession,
  currentUser,
  destroyAllSessionsFor,
  destroySession,
} from "./auth";
import {
  hashPassword,
  passwordProblem,
  usernameProblem,
  verifyPassword,
} from "./password";
import type { ActionResult } from "./actions";

/** Same message whether the username or the password was wrong. */
const BAD_CREDENTIALS = "That username and password don't match.";

export async function signIn(input: {
  username: string;
  password: string;
  next?: string;
}): Promise<ActionResult<{ redirectTo: string }>> {
  const username = input.username.trim();
  if (!username || !input.password) {
    return { ok: false, error: "Type your username and password." };
  }

  const db = await getDb();
  const row = await db.get<{ id: number; password_hash: string }>(
    "SELECT id, password_hash FROM users WHERE LOWER(username) = LOWER(?)",
    username,
  );

  if (!row || !verifyPassword(input.password, row.password_hash)) {
    return { ok: false, error: BAD_CREDENTIALS };
  }

  const userAgent = (await headers()).get("user-agent");
  const { token, maxAge } = await createSession(row.id, userAgent);

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });

  // Only ever send people to a path on this app, never an absolute URL.
  const next =
    input.next && input.next.startsWith("/") && !input.next.startsWith("//")
      ? input.next
      : "/";

  revalidatePath("/", "layout");
  return { ok: true, data: { redirectTo: next } };
}

export async function signOut(): Promise<void> {
  const user = await currentUser();
  if (user) await destroySession(user.sessionToken);
  (await cookies()).delete(SESSION_COOKIE);
  revalidatePath("/", "layout");
  redirect("/login");
}

export async function createUser(input: {
  username: string;
  password: string;
}): Promise<ActionResult<{ username: string }>> {
  const actor = await currentUser();
  if (!actor) return { ok: false, error: "Sign in again to add someone." };

  const username = input.username.trim();
  const nameProblem = usernameProblem(username);
  if (nameProblem) return { ok: false, error: nameProblem };

  const pwProblem = passwordProblem(input.password);
  if (pwProblem) return { ok: false, error: pwProblem };

  const db = await getDb();
  const taken = await db.get("SELECT id FROM users WHERE LOWER(username) = LOWER(?)", username);
  if (taken) return { ok: false, error: `Someone already uses "${username}".` };

  await db.run(
    "INSERT INTO users (username, password_hash, created_by) VALUES (?, ?, ?)",
    username, hashPassword(input.password), actor.id,
  );

  revalidatePath("/", "layout");
  return { ok: true, data: { username } };
}

export async function changeOwnPassword(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<ActionResult> {
  const actor = await currentUser();
  if (!actor) return { ok: false, error: "Sign in again to change your password." };

  const db = await getDb();
  const row = await db.get<{ password_hash: string }>(
    "SELECT password_hash FROM users WHERE id = ?", actor.id,
  );
  if (!row || !verifyPassword(input.currentPassword, row.password_hash)) {
    return { ok: false, error: "Your current password isn't right." };
  }

  const problem = passwordProblem(input.newPassword);
  if (problem) return { ok: false, error: problem };

  await db.run("UPDATE users SET password_hash = ? WHERE id = ?",
    hashPassword(input.newPassword),
    actor.id,
  );

  // Anything signed in elsewhere with the old password gets kicked out, except
  // the device doing the changing.
  await db.run("DELETE FROM sessions WHERE user_id = ? AND token != ?",
    actor.id,
    actor.sessionToken,
  );

  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

export async function resetOtherPassword(input: {
  userId: number;
  newPassword: string;
}): Promise<ActionResult> {
  const actor = await currentUser();
  if (!actor) return { ok: false, error: "Sign in again first." };
  if (actor.id === input.userId) {
    return { ok: false, error: "Use “Change my password” for your own account." };
  }

  const problem = passwordProblem(input.newPassword);
  if (problem) return { ok: false, error: problem };

  const db = await getDb();
  const target = await db.get<{ id: number }>("SELECT id FROM users WHERE id = ?", input.userId);
  if (!target) return { ok: false, error: "That person no longer has an account." };

  await db.run("UPDATE users SET password_hash = ? WHERE id = ?",
    hashPassword(input.newPassword),
    input.userId,
  );
  await destroyAllSessionsFor(input.userId);

  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

export async function deleteUser(userId: number): Promise<ActionResult> {
  const actor = await currentUser();
  if (!actor) return { ok: false, error: "Sign in again first." };
  if (actor.id === userId) {
    return { ok: false, error: "You can't remove your own account." };
  }
  if ((await countUsers()) <= 1) {
    return { ok: false, error: "There has to be at least one account." };
  }

  await (await getDb()).run("DELETE FROM users WHERE id = ?", userId);
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}
