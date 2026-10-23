import {
  capturePremiumOrder,
  validatePremiumCapture,
} from '../../server/paypal';
import {
  getAdminSupabase,
  requireAuthenticatedUser,
  type RequestLike,
} from '../../server/supabase';

interface ApiRequest extends RequestLike {
  method?: string;
  body?: unknown;
}

interface ApiResponse {
  status(code: number): ApiResponse;
  json(body: unknown): void;
  setHeader?(name: string, value: string): void;
}

function readBody(body: unknown): Record<string, unknown> {
  if (body == null) return {};
  if (typeof body === 'string') {
    const value = body.trim();
    return value ? (JSON.parse(value) as Record<string, unknown>) : {};
  }
  return typeof body === 'object' ? (body as Record<string, unknown>) : {};
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader?.('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await requireAuthenticatedUser(req);
  if (!auth) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const admin = getAdminSupabase();
  if (!admin) {
    return res.status(503).json({
      error: 'Premium payments are temporarily unavailable',
      code: 'SUPABASE_SERVICE_KEY_MISSING',
    });
  }

  try {
    const body = readBody(req.body);
    const orderId = typeof body.orderId === 'string' ? body.orderId.trim() : '';

    if (!orderId) {
      return res.status(400).json({ error: 'orderId is required' });
    }

    const capture = await capturePremiumOrder(orderId);
    const verified = validatePremiumCapture(capture, auth.user.id);

    const now = new Date().toISOString();

    const { error: subscriptionError } = await admin
      .from('subscriptions')
      .upsert(
        {
          user_id: auth.user.id,
          user_email: auth.user.email ?? null,
          provider: 'paypal_checkout',
          provider_subscription_id: orderId,
          plan: 'premium',
          status: 'active',
          updated_at: now,
        },
        { onConflict: 'user_id' },
      );

    if (subscriptionError) {
      throw new Error(`SUBSCRIPTION_WRITE_FAILED: ${subscriptionError.message}`);
    }

    const { error: paymentError } = await admin.from('payments').insert({
      user_id: auth.user.id,
      user_email: auth.user.email ?? null,
      provider: 'paypal_checkout',
      provider_subscription_id: orderId,
      provider_capture_id: verified.captureId,
      amount: verified.amount,
      currency: verified.currency,
      status: 'paid',
      created_at: now,
    });

    if (paymentError) {
      console.error('[paypal/capture-order] payment record failed', paymentError);
    }

    return res.status(200).json({
      ok: true,
      plan: 'premium',
      orderId,
      captureId: verified.captureId,
    });
  } catch (error) {
    console.error('[paypal/capture-order]', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unable to capture order',
    });
  }
}
