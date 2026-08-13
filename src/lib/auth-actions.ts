"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "./db";
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

  const row = db
    .prepare("SELECT id, password_hash FROM users WHERE username = ?")
    .get(username) as { id: number; password_hash: string } | undefined;

  if (!row || !verifyPassword(input.password, row.password_hash)) {
    return { ok: false, error: BAD_CREDENTIALS };
  }

  const userAgent = (await headers()).get("user-agent");
  const { token, maxAge } = createSession(row.id, userAgent);

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
  if (user) destroySession(user.sessionToken);
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

  const taken = db
    .prepare("SELECT id FROM users WHERE username = ?")
    .get(username);
  if (taken) return { ok: false, error: `Someone already uses "${username}".` };

  db.prepare(
    "INSERT INTO users (username, password_hash, created_by) VALUES (?, ?, ?)",
  ).run(username, hashPassword(input.password), actor.id);

  revalidatePath("/", "layout");
  return { ok: true, data: { username } };
}

export async function changeOwnPassword(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<ActionResult> {
  const actor = await currentUser();
  if (!actor) return { ok: false, error: "Sign in again to change your password." };

  const row = db
    .prepare("SELECT password_hash FROM users WHERE id = ?")
    .get(actor.id) as { password_hash: string } | undefined;
  if (!row || !verifyPassword(input.currentPassword, row.password_hash)) {
    return { ok: false, error: "Your current password isn't right." };
  }

  const problem = passwordProblem(input.newPassword);
  if (problem) return { ok: false, error: problem };

  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(
    hashPassword(input.newPassword),
    actor.id,
  );

  // Anything signed in elsewhere with the old password gets kicked out, except
  // the device doing the changing.
  db.prepare("DELETE FROM sessions WHERE user_id = ? AND token != ?").run(
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

  const target = db
    .prepare("SELECT id FROM users WHERE id = ?")
    .get(input.userId) as { id: number } | undefined;
  if (!target) return { ok: false, error: "That person no longer has an account." };

  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(
    hashPassword(input.newPassword),
    input.userId,
  );
  destroyAllSessionsFor(input.userId);

  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

export async function deleteUser(userId: number): Promise<ActionResult> {
  const actor = await currentUser();
  if (!actor) return { ok: false, error: "Sign in again first." };
  if (actor.id === userId) {
    return { ok: false, error: "You can't remove your own account." };
  }
  if (countUsers() <= 1) {
    return { ok: false, error: "There has to be at least one account." };
  }

  db.prepare("DELETE FROM users WHERE id = ?").run(userId);
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}
