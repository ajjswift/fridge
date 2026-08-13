import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

const Subscription = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({
    p256dh: z.string().min(1).max(500),
    auth: z.string().min(1).max(500),
  }),
  label: z.string().max(120).optional().nullable(),
});

/** Registers this browser to receive the daily expiry digest. */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const parsed = Subscription.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Bad subscription" }, { status: 400 });
  }
  const { endpoint, keys, label } = parsed.data;

  // An endpoint is unique to a browser install; re-subscribing on the same
  // device should move it to the current user rather than duplicate it.
  await (await getDb()).run(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, label)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET
       user_id = excluded.user_id,
       p256dh  = excluded.p256dh,
       auth    = excluded.auth,
       label   = excluded.label`,
    user.id, endpoint, keys.p256dh, keys.auth, label ?? null,
  );

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { endpoint?: string } | null;
  if (!body?.endpoint) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  await (await getDb()).run("DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?",
    body.endpoint,
    user.id,
  );
  return NextResponse.json({ ok: true });
}
