import { beforeEach, describe, expect, it } from 'vitest';
import {
  checkRateLimit,
  parseJsonObject,
  RATE_LIMITS,
  rejectIfRateLimited,
  resetRateLimits,
} from '../../server/http';
import { response } from '../harness';

describe('parseJsonObject', () => {
  it.each([
    [undefined, {}],
    [null, {}],
    ['', {}],
    ['   ', {}],
    ['{"a":1}', { a: 1 }],
    [{ a: 1 }, { a: 1 }],
  ])('accepts %j', (input, expected) => {
    expect(parseJsonObject(input)).toEqual(expected);
  });

  it.each(['{broken', '[1,2]', '"text"', '42', 'null'])('rejects string %j', (input) => {
    expect(parseJsonObject(input)).toBeNull();
  });

  it('rejects arrays and primitives passed as already-parsed bodies', () => {
    expect(parseJsonObject([1])).toBeNull();
    expect(parseJsonObject(5)).toBeNull();
  });
});

describe('rate limiting', () => {
  beforeEach(() => resetRateLimits());

  it('allows exactly the configured budget per minute, then blocks', () => {
    const limit = RATE_LIMITS['paypal-capture'];
    for (let i = 0; i < limit; i++) {
      expect(checkRateLimit('u1', 'paypal-capture', 1_000).allowed).toBe(true);
    }
    const blocked = checkRateLimit('u1', 'paypal-capture', 1_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(60);
  });

  it('isolates users and routes', () => {
    const limit = RATE_LIMITS['paypal-capture'];
    for (let i = 0; i < limit; i++) checkRateLimit('u1', 'paypal-capture', 0);
    expect(checkRateLimit('u2', 'paypal-capture', 0).allowed).toBe(true);
    expect(checkRateLimit('u1', 'paypal-create', 0).allowed).toBe(true);
  });

  it('frees the budget once the window slides past', () => {
    const limit = RATE_LIMITS['paypal-capture'];
    for (let i = 0; i < limit; i++) checkRateLimit('u1', 'paypal-capture', 0);
    expect(checkRateLimit('u1', 'paypal-capture', 59_999).allowed).toBe(false);
    expect(checkRateLimit('u1', 'paypal-capture', 60_000).allowed).toBe(true);
  });

  it('answers 429 with Retry-After when blocked', () => {
    const limit = RATE_LIMITS['image-search'];
    for (let i = 0; i < limit; i++) checkRateLimit('u1', 'image-search');
    const res = response();
    expect(rejectIfRateLimited(res, 'u1', 'image-search')).toBe(true);
    expect(res.statusCode).toBe(429);
    expect(res.body.code).toBe('RATE_LIMITED');
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });
});
