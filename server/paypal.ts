const PREMIUM_PRICE = '19.95';
const PREMIUM_CURRENCY = 'USD';

export class PayPalError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly issue?: string,
  ) {
    super(message);
    this.name = 'PayPalError';
  }
}

function env(name: string): string {
  return (process.env[name] || '').trim();
}

function paypalBaseUrl(): string {
  return env('PAYPAL_ENV').toLowerCase() === 'sandbox'
    ? 'https://api-m.sandbox.paypal.com'
    : 'https://api-m.paypal.com';
}

function credentials(): { clientId: string; clientSecret: string } {
  const clientId = env('PAYPAL_CLIENT_ID') || env('VITE_PAYPAL_CLIENT_ID');
  const clientSecret = env('PAYPAL_CLIENT_SECRET');

  if (!clientId || !clientSecret) {
    throw new PayPalError('PAYPAL_SERVER_CONFIG_MISSING', 503);
  }

  return { clientId, clientSecret };
}

export async function getPayPalAccessToken(): Promise<string> {
  const { clientId, clientSecret } = credentials();
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const response = await fetch(`${paypalBaseUrl()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  const data = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    error_description?: string;
  };

  if (!response.ok || !data.access_token) {
    throw new PayPalError('PAYPAL_AUTH_FAILED', response.status);
  }

  return data.access_token;
}

export async function createPremiumOrder(userId: string): Promise<{ id: string }> {
  const accessToken = await getPayPalAccessToken();

  const response = await fetch(`${paypalBaseUrl()}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'PayPal-Request-Id': `chatmi-${userId}-${Date.now()}`,
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [
        {
          custom_id: userId,
          description: 'ChatMi Premium (pago único)',
          amount: {
            currency_code: PREMIUM_CURRENCY,
            value: PREMIUM_PRICE,
          },
        },
      ],
    }),
  });

  const data = (await response.json().catch(() => ({}))) as {
    id?: string;
    message?: string;
  };

  if (!response.ok || !data.id) {
    throw new PayPalError('PAYPAL_CREATE_ORDER_FAILED', response.status);
  }

  return { id: data.id };
}

export interface PayPalCapture {
  id?: string;
  status?: string;
  payer?: { email_address?: string };
  purchase_units?: Array<{
    custom_id?: string;
    payments?: {
      captures?: Array<{
        id?: string;
        status?: string;
        amount?: {
          currency_code?: string;
          value?: string;
        };
      }>;
    };
  }>;
}

type PayPalErrorBody = PayPalCapture & {
  message?: string;
  details?: Array<{ issue?: string }>;
};

export async function getPremiumOrder(orderId: string): Promise<PayPalCapture> {
  const accessToken = await getPayPalAccessToken();

  const response = await fetch(
    `${paypalBaseUrl()}/v2/checkout/orders/${encodeURIComponent(orderId)}`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );

  const data = (await response.json().catch(() => ({}))) as PayPalErrorBody;

  if (!response.ok) {
    throw new PayPalError('PAYPAL_GET_ORDER_FAILED', response.status, data.details?.[0]?.issue);
  }

  return data;
}

/**
 * Captures the order. When PayPal reports that the order was already captured
 * (a retry after a network drop or a failed database write), the existing
 * order is read back so the caller can finish activation idempotently instead
 * of leaving a paying customer without Premium.
 */
export async function capturePremiumOrder(orderId: string): Promise<PayPalCapture> {
  const accessToken = await getPayPalAccessToken();

  const response = await fetch(
    `${paypalBaseUrl()}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'PayPal-Request-Id': `chatmi-capture-${orderId}`,
      },
      body: '{}',
    },
  );

  const data = (await response.json().catch(() => ({}))) as PayPalErrorBody;

  if (!response.ok) {
    const issue = data.details?.[0]?.issue;
    if (issue === 'ORDER_ALREADY_CAPTURED') {
      return getPremiumOrder(orderId);
    }
    throw new PayPalError('PAYPAL_CAPTURE_FAILED', response.status, issue);
  }

  return data;
}

export function validatePremiumCapture(
  capture: PayPalCapture,
  expectedUserId: string,
): { captureId: string; amount: number; currency: string } {
  const unit = capture.purchase_units?.[0];
  const payment = unit?.payments?.captures?.[0];

  if (
    capture.status !== 'COMPLETED' ||
    payment?.status !== 'COMPLETED' ||
    unit?.custom_id !== expectedUserId ||
    payment.amount?.currency_code !== PREMIUM_CURRENCY ||
    payment.amount?.value !== PREMIUM_PRICE ||
    !payment.id
  ) {
    throw new PayPalError('PAYPAL_CAPTURE_VALIDATION_FAILED', 422);
  }

  return {
    captureId: payment.id,
    amount: Number(PREMIUM_PRICE),
    currency: PREMIUM_CURRENCY,
  };
}
