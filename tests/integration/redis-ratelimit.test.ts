import { randomUUID } from "node:crypto";
import Redis from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RedisRateLimiter } from "@/server/ratelimit";

const url = process.env.REDIS_URL ?? "redis://localhost:6379";
let redis: Redis;

beforeAll(() => {
  redis = new Redis(url, { maxRetriesPerRequest: 2, lazyConnect: false });
});
afterAll(async () => {
  await redis.quit();
});

describe("RedisRateLimiter (real Redis)", () => {
  it("allows up to the limit, then blocks with a positive Retry-After", async () => {
    const rl = new RedisRateLimiter(redis);
    const key = `test:${randomUUID()}`;
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await rl.hit(key, 3, 30));
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results[3]!.retryAfterSec).toBeGreaterThan(0);
    expect(results[3]!.retryAfterSec).toBeLessThanOrEqual(30);
  });

  it("sets a TTL on the key so counters cannot live forever", async () => {
    const rl = new RedisRateLimiter(redis);
    const key = `test:${randomUUID()}`;
    await rl.hit(key, 5, 20);
    const ttl = await redis.ttl(`rl:${key}`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(20);
  });

  it("repairs a key that was left without a TTL", async () => {
    const rl = new RedisRateLimiter(redis);
    const key = `test:${randomUUID()}`;
    await redis.set(`rl:${key}`, "5"); // simulates a crash between INCR and EXPIRE
    await rl.hit(key, 100, 15);
    expect(await redis.ttl(`rl:${key}`)).toBeGreaterThan(0);
  });

  it("counts per key independently", async () => {
    const rl = new RedisRateLimiter(redis);
    const a = `test:${randomUUID()}`;
    const b = `test:${randomUUID()}`;
    await rl.hit(a, 1, 30);
    expect((await rl.hit(a, 1, 30)).allowed).toBe(false);
    expect((await rl.hit(b, 1, 30)).allowed).toBe(true);
  });
});
