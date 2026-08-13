export async function register() {
  // Only the Node.js server runtime can reach the database and web-push.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { startDigestScheduler } = await import("./lib/scheduler");
  startDigestScheduler();
}
