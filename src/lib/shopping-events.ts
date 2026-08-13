import "server-only";

import { createClient } from "redis";

/**
 * A small process-local fan-out for the shopping list. The browser also polls
 * as a fallback, so a brief reconnect or a multi-instance deployment never
 * leaves a device permanently stale.
 */
type Listener = () => void;
type RedisClient = ReturnType<typeof createClient>;
const SHOPPING_CHANNEL = "fridge:shopping:changed";
const REDIS_URL = process.env.REDIS_URL?.trim() || null;

const registry = globalThis as typeof globalThis & {
  __fridgeShoppingListeners?: Set<Listener>;
  __fridgeShoppingRedis?: RedisBridge;
};

type RedisBridge = {
  publisher: RedisClient;
  subscriber: RedisClient;
  ready: Promise<boolean>;
};

function listeners() {
  return (registry.__fridgeShoppingListeners ??= new Set<Listener>());
}

function notifyLocalListeners() {
  for (const listener of listeners()) listener();
}

function reportRedisError(error: Error) {
  // Redis is an optional acceleration layer. The durable source of truth stays
  // in the database, and the browser's polling fallback will reconcile later.
  console.error("[fridge] Redis shopping sync error:", error.message);
}

function redisBridge(): RedisBridge | null {
  if (!REDIS_URL) return null;
  if (registry.__fridgeShoppingRedis) return registry.__fridgeShoppingRedis;

  const publisher = createClient({ url: REDIS_URL });
  const subscriber = publisher.duplicate();
  publisher.on("error", reportRedisError);
  subscriber.on("error", reportRedisError);

  const bridge: RedisBridge = {
    publisher,
    subscriber,
    ready: Promise.all([publisher.connect(), subscriber.connect()])
      .then(async () => {
        await subscriber.subscribe(SHOPPING_CHANNEL, () => notifyLocalListeners());
        return true;
      })
      .catch((error: unknown) => {
        reportRedisError(error instanceof Error ? error : new Error(String(error)));
        return false;
      }),
  };
  registry.__fridgeShoppingRedis = bridge;
  return bridge;
}

export function subscribeToShoppingChanges(listener: Listener) {
  const current = listeners();
  current.add(listener);
  // Bring up the Redis subscriber when this instance first has a browser that
  // needs events. The call is deliberately non-blocking for the SSE response.
  void redisBridge()?.ready;
  return () => current.delete(listener);
}

export function publishShoppingChange() {
  // Keep the local SSE fallback instant even while Redis is reconnecting or
  // misconfigured. A duplicate refresh after the Redis echo is harmless.
  notifyLocalListeners();
  const bridge = redisBridge();
  if (!bridge) return;

  void bridge.ready.then(async (ready) => {
    if (!ready) return;
    try {
      // Every other instance receives this through its dedicated subscriber.
      await bridge.publisher.publish(SHOPPING_CHANNEL, "1");
    } catch (error) {
      reportRedisError(error instanceof Error ? error : new Error(String(error)));
    }
  });
}
