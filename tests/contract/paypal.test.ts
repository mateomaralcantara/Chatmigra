// Contract family: PayPal endpoints. Status codes and messages the browser
// relies on (see src/components/CambiarPlan.tsx).
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../server/supabase', () => import('../harness/supabase-module'));

import { resetRateLimits } from '../../server/http';
import { ALICE, BOB, backend, call, paypal, request } from '../harness';
import createOrder from '../../api/paypal/create-order';
import captureOrder from '../../api/paypal/capture-order';

let alice: string;

beforeEach(() => {
  backend.reset();
  paypal.reset();
  paypal.install();
  resetRateLimits();
  alice = backend.signIn(ALICE);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

async function newOrder(token = alice): Promise<string> {
  const res = await call(createOrder, request({ token }));
  expect(res.statusCode).toBe(200);
  return res.body.id;
}

describe('POST /api/paypal/create-order', () => {
  it('creates a 19.95 USD order tied to the signed-in user', async () => {
    const id = await newOrder();
    expect(paypal.orders.get(id)).toMatchObject({ customId: ALICE.id, value: '19.95', currency: 'USD' });
  });

  it('answers 503 when the server cannot persist payments', async () => {
    backend.adminConfigured = false;
    const res = await call(createOrder, request({ token: alice }));
    expect(res.statusCode).toBe(503);
  });

  it('answers 502 with a generic message when PayPal is misconfigured', async () => {
    delete process.env.PAYPAL_CLIENT_SECRET;
    const res = await call(createOrder, request({ token: alice }));
    expect(res.statusCode).toBe(502);
    expect(res.body.error).not.toMatch(/PAYPAL_|secret/i);
  });
});

describe('POST /api/paypal/capture-order', () => {
  it.each([
    ['malformed JSON', '{oops'],
    ['missing orderId', {}],
    ['non-string orderId', { orderId: 42 }],
    ['path-injection orderId', { orderId: '../../v1/oauth2/token' }],
  ])('answers 400 for %s', async (_label, body) => {
    const res = await call(captureOrder, request({ token: alice, body }));
    expect(res.statusCode).toBe(400);
    expect(paypal.captureCalls).toBe(0);
  });

  it('activates Premium and records exactly one payment', async () => {
    const orderId = await newOrder();
    const res = await call(captureOrder, request({ token: alice, body: { orderId } }));

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ ok: true, plan: 'premium', orderId });
    expect(backend.table('subscriptions')).toEqual([
      expect.objectContaining({ user_id: ALICE.id, plan: 'premium', status: 'active' }),
    ]);
    expect(backend.table('payments')).toHaveLength(1);
  });

  it('accepts the body as a JSON string', async () => {
    const orderId = await newOrder();
    const res = await call(captureOrder, request({ token: alice, body: JSON.stringify({ orderId }) }));
    expect(res.statusCode).toBe(200);
  });

  it('refuses to activate Premium with an order paid by another account (422)', async () => {
    const bob = backend.signIn(BOB);
    const bobsOrder = await newOrder(bob);
    const res = await call(captureOrder, request({ token: alice, body: { orderId: bobsOrder } }));

    expect(res.statusCode).toBe(422);
    expect(res.body.code).toBe('PAYMENT_NOT_VALID');
    expect(backend.table('subscriptions')).toHaveLength(0);
  });

  it('refuses a tampered amount (422)', async () => {
    const orderId = await newOrder();
    paypal.reportedValue = '0.01';
    const res = await call(captureOrder, request({ token: alice, body: { orderId } }));
    expect(res.statusCode).toBe(422);
    expect(backend.table('subscriptions')).toHaveLength(0);
  });

  it('answers 402 for an order PayPal does not know', async () => {
    const res = await call(captureOrder, request({ token: alice, body: { orderId: 'ORDER-404' } }));
    expect(res.statusCode).toBe(402);
    expect(res.body.code).toBe('PAYMENT_NOT_CAPTURED');
  });

  it('answers 502 without leaking details when PayPal is down', async () => {
    const orderId = await newOrder();
    paypal.failNextCapture = 500;
    const res = await call(captureOrder, request({ token: alice, body: { orderId } }));
    expect(res.statusCode).toBe(502);
    expect(JSON.stringify(res.body)).not.toMatch(/PAYPAL_CAPTURE_FAILED|INTERNAL_SERVER_ERROR/);
  });
});
