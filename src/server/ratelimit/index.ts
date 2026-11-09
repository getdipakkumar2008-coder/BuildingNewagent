import Redis from "ioredis";

export type RateResult = { allowed: boolean; retryAfterSec: number };

export interface RateLimiter {
  /** Fixed-window counter: at most `limit` hits per `windowSec` for `key`. */
  hit(key: string, limit: number, windowSec: number): Promise<RateResult>;
}

/** Single-process limiter for tests and for dev without Redis. Not shared across instances. */
export class MemoryRateLimiter implements RateLimiter {
  private windows = new Map<string, { count: number; resetAt: number }>();

  constructor(private now: () => number = Date.now) {}

  async hit(key: string, limit: number, windowSec: number): Promise<RateResult> {
    const t = this.now();
    let w = this.windows.get(key);
    if (!w || w.resetAt <= t) {
      w = { count: 0, resetAt: t + windowSec * 1000 };
      this.windows.set(key, w);
    }
    w.count += 1;
    return {
      allowed: w.count <= limit,
      retryAfterSec: Math.max(1, Math.ceil((w.resetAt - t) / 1000)),
    };
  }
}

export class RedisRateLimiter implements RateLimiter {
  constructor(private redis: Redis) {}

  async hit(key: string, limit: number, windowSec: number): Promise<RateResult> {
    const k = `rl:${key}`;
    const count = await this.redis.incr(k);
    if (count === 1) await this.redis.expire(k, windowSec);
    const ttl = await this.redis.ttl(k);
    if (ttl < 0) await this.redis.expire(k, windowSec); // repair a key left without TTL
    return { allowed: count <= limit, retryAfterSec: Math.max(1, ttl < 0 ? windowSec : ttl) };
  }
}

const g = globalThis as unknown as { __limiter?: RateLimiter };

export function getRateLimiter(): RateLimiter {
  if (!g.__limiter) {
    const url = process.env.REDIS_URL;
    g.__limiter = url
      ? new RedisRateLimiter(new Redis(url, { maxRetriesPerRequest: 2, enableOfflineQueue: false }))
      : new MemoryRateLimiter();
  }
  return g.__limiter;
}
