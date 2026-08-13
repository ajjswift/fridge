import "server-only";

const CHECK_INTERVAL_MS = 5 * 60 * 1000;

// Next re-evaluates modules on hot reload; without this the dev server would
// stack up a new timer on every edit.
const globalForScheduler = globalThis as unknown as {
  __recimeScheduler?: NodeJS.Timeout;
};

/**
 * A plain interval rather than a cron dependency: this app runs as one
 * long-lived process on a machine in the house, so there's nothing to
 * coordinate. Each tick asks whether today's digest is due and still unsent.
 */
export function startDigestScheduler() {
  if (globalForScheduler.__recimeScheduler) return;

  const tick = async () => {
    try {
      const { sendDailyDigestIfDue } = await import("./push");
      const result = await sendDailyDigestIfDue();
      if (result.status === "sent") {
        console.log(`[recime] daily digest sent to ${result.sent} device(s)`);
      }
    } catch (error) {
      console.error("[recime] digest check failed", error);
    }
  };

  const timer = setInterval(tick, CHECK_INTERVAL_MS);
  // Never hold the process open just for this.
  timer.unref?.();
  globalForScheduler.__recimeScheduler = timer;

  // Catch up if the machine was asleep or the server was down at the due time.
  setTimeout(tick, 15_000).unref?.();

  console.log("[recime] reminder scheduler running");
}
