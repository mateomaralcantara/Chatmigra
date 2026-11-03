// Shared HTTP helpers for every /api handler. Server-only.

export interface MinimalResponse {
  status(code: number): MinimalResponse;
  json(body: unknown): void;
  setHeader?(name: string, value: string): void;
}

/**
 * Parses a request body that Vercel may hand over as an object, a JSON string
 * or nothing. Returns null when the body is present but is not a JSON object,
 * so callers can answer 400 instead of crashing with a 500.
 */
export function parseJsonObject(body: unknown): Record<string, unknown> | null {
  if (body == null) return {};

  if (typeof body === 'string') {
    const value = body.trim();
    if (!value) return {};
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }

  return typeof body === 'object' && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

/** Per-route request budgets, per authenticated user, per minute. */
export const RATE_LIMITS = {
  gemini: 30,
  'gemini-live-token': 10,
  'image-search': 30,
  'applicant-tutor': 60,
  'applicant-simulator': 20,
  'applicant-index': 10,
  'paypal-create': 10,
  'paypal-capture': 10,
} as const;

export type RateLimitBucket = keyof typeof RATE_LIMITS;

const WINDOW_MS = 60_000;
const MAX_TRACKED_KEYS = 10_000;
const hits = new Map<string, number[]>();

/**
 * Sliding-window limiter kept in memory of the current serverless instance.
 * It stops bursts and accidental loops from one browser; it is not a global
 * guarantee across instances (the Supabase quota RPCs remain the source of
 * truth for paid Gemini usage).
 */
export function checkRateLimit(
  userId: string,
  bucket: RateLimitBucket,
  now: number = Date.now(),
): { allowed: boolean; retryAfterSeconds: number } {
  const limit = RATE_LIMITS[bucket];
  const key = `${bucket}:${userId}`;
  const recent = (hits.get(key) || []).filter((t) => now - t < WINDOW_MS);

  if (recent.length >= limit) {
    hits.set(key, recent);
    const retryAfterMs = WINDOW_MS - (now - recent[0]);
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
  }

  recent.push(now);
  hits.delete(key);
  hits.set(key, recent);

  // Bound memory: drop the least recently used keys.
  while (hits.size > MAX_TRACKED_KEYS) {
    const oldest = hits.keys().next().value;
    if (oldest === undefined) break;
    hits.delete(oldest);
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

/** Responds 429 and returns true when the caller exceeded its budget. */
export function rejectIfRateLimited(
  res: MinimalResponse,
  userId: string,
  bucket: RateLimitBucket,
): boolean {
  const verdict = checkRateLimit(userId, bucket);
  if (verdict.allowed) return false;

  res.setHeader?.('Retry-After', String(verdict.retryAfterSeconds));
  res.status(429).json({
    error: 'Demasiadas solicitudes. Espera un momento e inténtalo de nuevo.',
    code: 'RATE_LIMITED',
    retryAfterSeconds: verdict.retryAfterSeconds,
  });
  return true;
}

/** Test-only: forget every recorded hit. */
export function resetRateLimits(): void {
  hits.clear();
}
