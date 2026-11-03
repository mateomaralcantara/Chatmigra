// Flow family: the whole Premium purchase journey, step by step, as the
// browser drives it — including the failure paths that cost real money.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../server/supabase', () => import('../harness/supabase-module'));

import { resetRateLimits } from '../../server/http';
import { ALICE, backend, call, paypal, request } from '../harness';
import createOrder from '../../api/paypal/create-order';
import captureOrder from '../../api/paypal/capture-order';

let token: string;

beforeEach(() => {
  backend.reset();
  paypal.reset();
  paypal.install();
  resetRateLimits();
  token = backend.signIn(ALICE);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

const create = () => call(createOrder, request({ token }));
const capture = (orderId: string) => call(captureOrder, request({ token, body: { orderId } }));

describe('Flow: free user buys Premium', () => {
  it('1 sign in -> 2 create order -> 3 approve in PayPal -> 4 capture -> Premium active', async () => {
    const created = await create();
    expect(created.statusCode).toBe(200);

    const captured = await capture(created.body.id);
    expect(captured.statusCode).toBe(200);

    const [subscription] = backend.table('subscriptions');
    const [payment] = backend.table('payments');
    expect(subscription).toMatchObject({ user_id: ALICE.id, plan: 'premium', status: 'active', provider_subscription_id: created.body.id });
    expect(payment).toMatchObject({ user_id: ALICE.id, amount: 19.95, currency: 'USD', status: 'paid', provider_capture_id: `CAPTURE-${created.body.id}` });
  });

  it('a double click on "Pay" charges once and records one payment', async () => {
    const { body } = await create();
    const [first, second] = await Promise.all([capture(body.id), capture(body.id)]);

    expect([first.statusCode, second.statusCode]).toEqual([200, 200]);
    expect(backend.table('payments')).toHaveLength(1);
    expect(backend.table('subscriptions')).toHaveLength(1);
  });

  it('database outage after the charge: client is told to retry, retry finishes activation', async () => {
    const { body } = await create();

    // Both the modern and the legacy subscription write paths fail.
    backend.failures.set('subscriptions:insert', 'connection reset');
    const failed = await capture(body.id);
    expect(failed.statusCode).toBe(503);
    expect(failed.body.code).toBe('ACTIVATION_PENDING');
    expect(paypal.orders.get(body.id)?.captured).toBe(true);

    backend.failures.clear();
    const retried = await capture(body.id);
    expect(retried.statusCode).toBe(200);
    expect(backend.table('subscriptions')).toEqual([expect.objectContaining({ plan: 'premium' })]);
    expect(backend.table('payments')).toHaveLength(1);
  });

  it('a payment-ledger failure never blocks Premium for a paying customer', async () => {
    const { body } = await create();
    backend.failures.set('payments:insert', 'ledger unavailable');
    const res = await capture(body.id);
    expect(res.statusCode).toBe(200);
    expect(backend.table('subscriptions')).toEqual([expect.objectContaining({ plan: 'premium' })]);
  });

  it('a user who already had a free subscription row is upgraded in place', async () => {
    backend.table('subscriptions').push({ id: 'sub-1', user_id: ALICE.id, plan: 'free', status: 'active' });
    const { body } = await create();
    await capture(body.id);
    expect(backend.table('subscriptions')).toEqual([expect.objectContaining({ id: 'sub-1', plan: 'premium' })]);
  });
});
