// Harness family: PayPal. A fetch double that behaves like the PayPal Orders v2
// API for the calls server/paypal.ts makes. Unknown URLs fail loudly so a test
// can never reach the real network by accident.
import { vi } from 'vitest';

interface Order {
  id: string;
  customId: string;
  value: string;
  currency: string;
  captured: boolean;
  captureId?: string;
}

export class FakePayPal {
  orders = new Map<string, Order>();
  captureCalls = 0;
  /** Next capture call answers with this HTTP status (e.g. 500), once. */
  failNextCapture: number | null = null;
  /** Overrides the amount PayPal reports, to simulate tampering. */
  reportedValue: string | null = null;
  private seq = 0;

  install() {
    process.env.PAYPAL_CLIENT_ID = 'test-client';
    process.env.PAYPAL_CLIENT_SECRET = 'test-secret';
    process.env.PAYPAL_ENV = 'sandbox';
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => this.handle(url, init)));
  }

  reset() {
    this.orders.clear();
    this.captureCalls = 0;
    this.failNextCapture = null;
    this.reportedValue = null;
    this.seq = 0;
  }

  private json(status: number, body: unknown) {
    return Promise.resolve(
      new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
    );
  }

  private view(order: Order) {
    return {
      id: order.id,
      status: order.captured ? 'COMPLETED' : 'CREATED',
      purchase_units: [
        {
          custom_id: order.customId,
          payments: order.captured
            ? {
                captures: [
                  {
                    id: order.captureId,
                    status: 'COMPLETED',
                    amount: { currency_code: order.currency, value: this.reportedValue ?? order.value },
                  },
                ],
              }
            : undefined,
        },
      ],
    };
  }

  handle(url: string, init?: RequestInit): Promise<Response> {
    const path = new URL(url).pathname;
    const method = init?.method ?? 'GET';

    if (path === '/v1/oauth2/token') return this.json(200, { access_token: 'fake-access' });

    if (path === '/v2/checkout/orders' && method === 'POST') {
      const body = JSON.parse(String(init?.body));
      const unit = body.purchase_units[0];
      const order: Order = {
        id: `ORDER-${++this.seq}`,
        customId: unit.custom_id,
        value: unit.amount.value,
        currency: unit.amount.currency_code,
        captured: false,
      };
      this.orders.set(order.id, order);
      return this.json(201, { id: order.id, status: 'CREATED' });
    }

    const capture = path.match(/^\/v2\/checkout\/orders\/([^/]+)\/capture$/);
    if (capture && method === 'POST') {
      this.captureCalls += 1;
      if (this.failNextCapture) {
        const status = this.failNextCapture;
        this.failNextCapture = null;
        return this.json(status, { name: 'INTERNAL_SERVER_ERROR' });
      }
      const order = this.orders.get(decodeURIComponent(capture[1]));
      if (!order) return this.json(404, { name: 'RESOURCE_NOT_FOUND', details: [{ issue: 'INVALID_RESOURCE_ID' }] });
      if (order.captured) {
        return this.json(422, { name: 'UNPROCESSABLE_ENTITY', details: [{ issue: 'ORDER_ALREADY_CAPTURED' }] });
      }
      order.captured = true;
      order.captureId = `CAPTURE-${order.id}`;
      return this.json(201, this.view(order));
    }

    const get = path.match(/^\/v2\/checkout\/orders\/([^/]+)$/);
    if (get && method === 'GET') {
      const order = this.orders.get(decodeURIComponent(get[1]));
      return order ? this.json(200, this.view(order)) : this.json(404, { name: 'RESOURCE_NOT_FOUND' });
    }

    return Promise.reject(new Error(`FakePayPal: unexpected ${method} ${url}`));
  }
}

export const paypal = new FakePayPal();
