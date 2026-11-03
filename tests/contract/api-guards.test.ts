// Contract family: every /api route must follow the same guard order —
// wrong method -> 405, no/invalid session -> 401, over budget -> 429 —
// before it touches Gemini, PayPal, Google or the database.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../server/supabase', () => import('../harness/supabase-module'));

import { checkRateLimit, RATE_LIMITS, resetRateLimits, type RateLimitBucket } from '../../server/http';
import { ALICE, backend, call, request } from '../harness';

import gemini from '../../api/gemini';
import geminiToken from '../../api/gemini-ephemeral-token';
import imageSearch from '../../api/image-search';
import applicantTutor from '../../api/applicant-tutor';
import applicantSimulator from '../../api/applicant-simulator';
import applicantIndex from '../../api/applicant-index';
import paypalCreate from '../../api/paypal/create-order';
import paypalCapture from '../../api/paypal/capture-order';

type Route = {
  name: string;
  handler: (req: any, res: any) => unknown;
  method: 'GET' | 'POST';
  bucket: RateLimitBucket;
  body?: unknown;
};

const ROUTES: Route[] = [
  { name: 'gemini', handler: gemini, method: 'POST', bucket: 'gemini' },
  { name: 'gemini-ephemeral-token', handler: geminiToken, method: 'POST', bucket: 'gemini-live-token' },
  { name: 'image-search', handler: imageSearch, method: 'GET', bucket: 'image-search' },
  { name: 'applicant-tutor', handler: applicantTutor, method: 'POST', bucket: 'applicant-tutor' },
  { name: 'applicant-simulator', handler: applicantSimulator, method: 'POST', bucket: 'applicant-simulator' },
  { name: 'applicant-index', handler: applicantIndex, method: 'POST', bucket: 'applicant-index' },
  { name: 'paypal/create-order', handler: paypalCreate, method: 'POST', bucket: 'paypal-create' },
  { name: 'paypal/capture-order', handler: paypalCapture, method: 'POST', bucket: 'paypal-capture', body: { orderId: 'ORDER-1' } },
];

describe.each(ROUTES)('/api/$name', (route) => {
  let token: string;

  beforeEach(() => {
    backend.reset();
    resetRateLimits();
    token = backend.signIn(ALICE);
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network must not be reached'))));
  });

  it('rejects the wrong HTTP method with 405', async () => {
    const wrong = route.method === 'GET' ? 'POST' : 'GET';
    const res = await call(route.handler, request({ method: wrong, token }));
    expect(res.statusCode).toBe(405);
  });

  it('rejects anonymous callers with 401', async () => {
    const res = await call(route.handler, request({ method: route.method, body: route.body }));
    expect(res.statusCode).toBe(401);
  });

  it('rejects forged tokens with 401', async () => {
    const res = await call(route.handler, request({ method: route.method, token: 'forged', body: route.body }));
    expect(res.statusCode).toBe(401);
  });

  it('answers 429 once the per-user budget is spent, without calling out', async () => {
    for (let i = 0; i < RATE_LIMITS[route.bucket]; i++) checkRateLimit(ALICE.id, route.bucket);
    const res = await call(route.handler, request({ method: route.method, token, body: route.body }));
    expect(res.statusCode).toBe(429);
    expect(res.body.code).toBe('RATE_LIMITED');
    expect(fetch).not.toHaveBeenCalled();
  });
});
