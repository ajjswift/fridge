import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** A read-only probe for uptime checks and phone-only troubleshooting. */
export async function GET() {
  try {
    const db = await getDb();
    const result = await db.get<{ ok: number }>("SELECT 1 AS ok");
    if (result?.ok !== 1) throw new Error("Database health query failed");

    return NextResponse.json(
      { ok: true, timestamp: new Date().toISOString() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[recime] health check failed", error);
    return NextResponse.json(
      { ok: false, error: "The database is unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
