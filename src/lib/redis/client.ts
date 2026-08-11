import { createClient, type RedisClientType } from "redis";

let client: RedisClientType | null = null;
let connectPromise: Promise<RedisClientType | null> | null = null;

export function isRedisConfigured() {
  return Boolean(process.env.REDIS_URL?.trim());
}

export async function getRedisClient(): Promise<RedisClientType | null> {
  const url = process.env.REDIS_URL?.trim();

  if (!url) {
    return null;
  }

  if (client?.isOpen) {
    return client;
  }

  if (!connectPromise) {
    connectPromise = (async () => {
      try {
        const nextClient = createClient({ url });
        nextClient.on("error", (error) => {
          console.error("[redis] client error:", error);
        });
        await nextClient.connect();
        client = nextClient as RedisClientType;
        return client;
      } catch (error) {
        console.error("[redis] connect failed:", error);
        connectPromise = null;
        return null;
      }
    })();
  }

  return connectPromise;
}

export async function closeRedisClientForTest() {
  if (client?.isOpen) {
    await client.quit();
  }

  client = null;
  connectPromise = null;
}
