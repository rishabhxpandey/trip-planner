import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const LIMIT = 30;
const WINDOW_MS = 60_000;

const upstash =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Ratelimit({
        redis: Redis.fromEnv(),
        limiter: Ratelimit.slidingWindow(LIMIT, '1 m'),
        prefix: 'outward:agent',
      })
    : null;

// Best-effort per-instance fallback when Upstash isn't configured.
const hits = new Map<string, number[]>();

export async function allow(key: string): Promise<boolean> {
  if (upstash) return (await upstash.limit(key)).success;
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= LIMIT) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) hits.clear();
  return true;
}
