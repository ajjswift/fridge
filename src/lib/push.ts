import "server-only";
import webpush from "web-push";
import { db } from "./db";
import { daysUntil, todayISO } from "./dates";
import { getExpiringLines, getSetting, getSoonDays } from "./queries";

export type PushPayload = {
  title: string;
  body: string;
  tag?: string;
  url?: string;
};

/**
 * VAPID keys identify this server to the browser's push service. They're
 * generated once and kept in the database so there's nothing to configure —
 * but they must stay stable, or every existing subscription stops working.
 */
function ensureVapidKeys(): { publicKey: string; privateKey: string } {
  const stored = db
    .prepare("SELECT key, value FROM settings WHERE key IN ('vapid_public', 'vapid_private')")
    .all() as Array<{ key: string; value: string }>;

  const map = Object.fromEntries(stored.map((r) => [r.key, r.value]));
  if (map.vapid_public && map.vapid_private) {
    return { publicKey: map.vapid_public, privateKey: map.vapid_private };
  }

  const generated = webpush.generateVAPIDKeys();
  const insert = db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  );
  insert.run("vapid_public", generated.publicKey);
  insert.run("vapid_private", generated.privateKey);
  return generated;
}

export function getVapidPublicKey(): string {
  return ensureVapidKeys().publicKey;
}

function configure() {
  const { publicKey, privateKey } = ensureVapidKeys();
  // A mailto: subject is required by the spec so push services can reach the
  // operator; it never leaves the push service.
  webpush.setVapidDetails(
    process.env.RECIME_PUSH_CONTACT ?? "mailto:nobody@example.com",
    publicKey,
    privateKey,
  );
}

type SubscriptionRow = {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
};

function subscriptionsFor(userId?: number): SubscriptionRow[] {
  return userId
    ? (db
        .prepare(
          "SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?",
        )
        .all(userId) as SubscriptionRow[])
    : (db
        .prepare("SELECT id, endpoint, p256dh, auth FROM push_subscriptions")
        .all() as SubscriptionRow[]);
}

/**
 * Sends to every registered device (or one user's devices). Subscriptions the
 * push service rejects as gone are pruned — that's how you find out someone
 * uninstalled the app or cleared their browser data.
 */
export async function sendPush(
  payload: PushPayload,
  userId?: number,
): Promise<{ sent: number; failed: number; removed: number }> {
  const subs = subscriptionsFor(userId);
  if (subs.length === 0) return { sent: 0, failed: 0, removed: 0 };

  configure();
  const body = JSON.stringify(payload);
  let sent = 0;
  let failed = 0;
  let removed = 0;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          body,
          { TTL: 60 * 60 * 12, urgency: "normal" },
        );
        db.prepare(
          "UPDATE push_subscriptions SET last_sent_at = datetime('now') WHERE id = ?",
        ).run(sub.id);
        sent += 1;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          db.prepare("DELETE FROM push_subscriptions WHERE id = ?").run(sub.id);
          removed += 1;
        } else {
          failed += 1;
        }
      }
    }),
  );

  return { sent, failed, removed };
}

/** Null when there's nothing worth interrupting someone for. */
export function buildExpiryDigest(): PushPayload | null {
  const today = todayISO();
  const soonDays = getSoonDays();
  const lines = getExpiringLines(soonDays);
  if (lines.length === 0) return null;

  const expired = lines.filter((l) => daysUntil(l.expiry_date, today) < 0);
  const upcoming = lines.filter((l) => daysUntil(l.expiry_date, today) >= 0);

  const headline =
    expired.length > 0 && upcoming.length > 0
      ? `${expired.length} out of date, ${upcoming.length} to use soon`
      : expired.length > 0
        ? `${expired.length} ${expired.length === 1 ? "thing has" : "things have"} gone out of date`
        : `${upcoming.length} ${upcoming.length === 1 ? "thing needs" : "things need"} eating`;

  const names = [...expired, ...upcoming].slice(0, 4).map((l) => l.name);
  const extra = lines.length - names.length;
  const body =
    names.join(", ") + (extra > 0 ? ` and ${extra} more` : "") + ".";

  return {
    title: `🥗 ${headline}`,
    body,
    tag: "recime-expiry-digest",
    url: "/expiring",
  };
}

/**
 * Sends today's digest unless it's already gone out. Safe to call repeatedly —
 * the scheduler does exactly that.
 */
export async function sendDailyDigestIfDue(force = false): Promise<{
  status: "sent" | "already-sent" | "nothing-to-say" | "disabled" | "too-early";
  sent?: number;
}> {
  if (!force && getSetting("notify_enabled", "1") !== "1") return { status: "disabled" };

  const today = todayISO();
  if (!force && getSetting("last_digest_date", "") === today) {
    return { status: "already-sent" };
  }

  if (!force) {
    const [hour, minute] = getSetting("notify_time", "08:30").split(":").map(Number);
    const now = new Date();
    const dueMinutes = (hour || 0) * 60 + (minute || 0);
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    if (nowMinutes < dueMinutes) return { status: "too-early" };
  }

  const payload = buildExpiryDigest();
  if (!payload) {
    // Record the day anyway so a quiet morning doesn't trigger a late send.
    if (!force) markDigestSent(today);
    return { status: "nothing-to-say" };
  }

  const result = await sendPush(payload);
  if (!force) markDigestSent(today);
  return { status: "sent", sent: result.sent };
}

function markDigestSent(day: string) {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES ('last_digest_date', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(day);
}

export function countSubscriptions(userId?: number): number {
  return subscriptionsFor(userId).length;
}
