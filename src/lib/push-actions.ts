"use server";

import { revalidatePath } from "next/cache";
import { currentUser } from "./auth";
import {
  buildExpiryDigest,
  countSubscriptions,
  sendDailyDigestIfDue,
  sendPush,
} from "./push";
import type { ActionResult } from "./actions";

export async function sendTestNotification(): Promise<
  ActionResult<{ sent: number }>
> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Sign in again first." };

  if ((await countSubscriptions(user.id)) === 0) {
    return {
      ok: false,
      error: "Turn reminders on for this device first.",
    };
  }

  const digest = await buildExpiryDigest();
  const result = await sendPush(
    digest ?? {
      title: "🥗 Recime reminders are on",
      body: "Nothing needs eating right now — this is what a reminder looks like.",
      tag: "recime-test",
      url: "/expiring",
    },
    user.id,
  );

  if (result.sent === 0) {
    return {
      ok: false,
      error:
        result.removed > 0
          ? "This device's subscription had expired. Turn reminders off and on again."
          : "Couldn't reach any of your devices.",
    };
  }
  return { ok: true, data: { sent: result.sent } };
}

/** "Send it now" — ignores the time of day and the once-a-day rule. */
export async function sendDigestNow(): Promise<ActionResult<{ sent: number }>> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Sign in again first." };

  const result = await sendDailyDigestIfDue(true);
  if (result.status === "nothing-to-say") {
    return { ok: false, error: "Nothing needs eating — no reminder sent." };
  }
  return { ok: true, data: { sent: result.sent ?? 0 } };
}

export async function setNotificationPrefs(input: {
  enabled?: boolean;
  time?: string;
}): Promise<ActionResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Sign in again first." };

  const { getDb } = await import("./db");
  const db = await getDb();

  if (input.enabled !== undefined) {
    await db.run(`INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value`, "notify_enabled", input.enabled ? "1" : "0");
  }
  if (input.time !== undefined) {
    if (!/^\d{2}:\d{2}$/.test(input.time)) {
      return { ok: false, error: "That isn't a valid time." };
    }
    await db.run(`INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value`, "notify_time", input.time);
  }

  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

export async function getSubscriptionCount(): Promise<number> {
  const user = await currentUser();
  return user ? countSubscriptions(user.id) : 0;
}
