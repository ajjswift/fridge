import "server-only";
import webpush from "web-push";
import { getDb } from "./db";
import { daysUntil, todayISO } from "./dates";
import { getExpiringLines, getSetting, getSoonDays } from "./queries";

export type PushPayload = { title: string; body: string; tag?: string; url?: string };

async function ensureVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const db = await getDb();
  const stored = await db.all<{ key: string; value: string }>(
    "SELECT key, value FROM settings WHERE key IN ('vapid_public', 'vapid_private')",
  );
  const map = Object.fromEntries(stored.map((row) => [row.key, row.value]));
  if (map.vapid_public && map.vapid_private) {
    return { publicKey: map.vapid_public, privateKey: map.vapid_private };
  }
  const generated = webpush.generateVAPIDKeys();
  await db.run(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    "vapid_public", generated.publicKey,
  );
  await db.run(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    "vapid_private", generated.privateKey,
  );
  return generated;
}

export async function getVapidPublicKey(): Promise<string> {
  return (await ensureVapidKeys()).publicKey;
}

async function configure() {
  const { publicKey, privateKey } = await ensureVapidKeys();
  webpush.setVapidDetails(
    process.env.RECIME_PUSH_CONTACT ?? "mailto:nobody@example.com",
    publicKey,
    privateKey,
  );
}

type SubscriptionRow = { id: number; endpoint: string; p256dh: string; auth: string };

async function subscriptionsFor(userId?: number): Promise<SubscriptionRow[]> {
  const db = await getDb();
  return userId
    ? db.all<SubscriptionRow>(
        "SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?", userId,
      )
    : db.all<SubscriptionRow>("SELECT id, endpoint, p256dh, auth FROM push_subscriptions");
}

export async function sendPush(
  payload: PushPayload,
  userId?: number,
): Promise<{ sent: number; failed: number; removed: number }> {
  const subs = await subscriptionsFor(userId);
  if (subs.length === 0) return { sent: 0, failed: 0, removed: 0 };
  await configure();
  const db = await getDb();
  const body = JSON.stringify(payload);
  const results = await Promise.all(subs.map(async (sub) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        body,
        { TTL: 60 * 60 * 12, urgency: "normal" },
      );
      await db.run(`UPDATE push_subscriptions SET last_sent_at = ${db.nowExpr} WHERE id = ?`, sub.id);
      return "sent" as const;
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await db.run("DELETE FROM push_subscriptions WHERE id = ?", sub.id);
        return "removed" as const;
      }
      return "failed" as const;
    }
  }));
  return {
    sent: results.filter((result) => result === "sent").length,
    failed: results.filter((result) => result === "failed").length,
    removed: results.filter((result) => result === "removed").length,
  };
}

export async function buildExpiryDigest(): Promise<PushPayload | null> {
  const today = todayISO();
  const soonDays = await getSoonDays();
  const lines = await getExpiringLines(soonDays);
  if (lines.length === 0) return null;
  const expired = lines.filter((line) => daysUntil(line.expiry_date, today) < 0);
  const upcoming = lines.filter((line) => daysUntil(line.expiry_date, today) >= 0);
  const headline = expired.length > 0 && upcoming.length > 0
    ? `${expired.length} out of date, ${upcoming.length} to use soon`
    : expired.length > 0
      ? `${expired.length} ${expired.length === 1 ? "thing has" : "things have"} gone out of date`
      : `${upcoming.length} ${upcoming.length === 1 ? "thing needs" : "things need"} eating`;
  const names = [...expired, ...upcoming].slice(0, 4).map((line) => line.name);
  const extra = lines.length - names.length;
  return {
    title: `🥗 ${headline}`,
    body: names.join(", ") + (extra > 0 ? ` and ${extra} more` : "") + ".",
    tag: "recime-expiry-digest",
    url: "/expiring",
  };
}

export async function sendDailyDigestIfDue(force = false): Promise<{
  status: "sent" | "already-sent" | "nothing-to-say" | "disabled" | "too-early";
  sent?: number;
}> {
  if (!force && (await getSetting("notify_enabled", "1")) !== "1") return { status: "disabled" };
  const today = todayISO();
  if (!force && (await getSetting("last_digest_date", "")) === today) return { status: "already-sent" };
  if (!force) {
    const [hour, minute] = (await getSetting("notify_time", "08:30")).split(":").map(Number);
    const now = new Date();
    if (now.getHours() * 60 + now.getMinutes() < (hour || 0) * 60 + (minute || 0)) {
      return { status: "too-early" };
    }
  }
  const payload = await buildExpiryDigest();
  if (!payload) {
    if (!force) await markDigestSent(today);
    return { status: "nothing-to-say" };
  }
  const result = await sendPush(payload);
  if (!force) await markDigestSent(today);
  return { status: "sent", sent: result.sent };
}

async function markDigestSent(day: string) {
  await (await getDb()).run(
    `INSERT INTO settings (key, value) VALUES ('last_digest_date', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`, day,
  );
}

export async function countSubscriptions(userId?: number): Promise<number> {
  return (await subscriptionsFor(userId)).length;
}
