import type { SupabaseClient, User as SupabaseUser } from '@supabase/supabase-js';
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

async function persistPremiumSubscription(
  admin: SupabaseClient,
  user: SupabaseUser,
  orderId: string,
  now: string,
): Promise<void> {
  const modernLookup = await admin
    .from('subscriptions')
    .select('id')
    .eq('user_id', user.id)
    .limit(1);

  if (!modernLookup.error) {
    const existingId = modernLookup.data?.[0]?.id;

    const modernWrite = existingId
      ? await admin
          .from('subscriptions')
          .update({
            user_email: user.email ?? null,
            provider: 'paypal_checkout',
            provider_subscription_id: orderId,
            plan: 'premium',
            status: 'active',
            updated_at: now,
          })
          .eq('id', existingId)
      : await admin.from('subscriptions').insert({
          user_id: user.id,
          user_email: user.email ?? null,
          provider: 'paypal_checkout',
          provider_subscription_id: orderId,
          plan: 'premium',
          status: 'active',
          updated_at: now,
        });

    if (!modernWrite.error) return;
  }

  const legacyLookup = await admin
    .from('subscriptions')
    .select('id')
    .eq('user_email', user.email ?? '')
    .limit(1);

  const legacyId = legacyLookup.data?.[0]?.id;

  const legacyWrite = legacyId
    ? await admin
        .from('subscriptions')
        .update({
          provider: 'paypal_checkout',
          provider_subscription_id: orderId,
          plan: 'premium',
          status: 'active',
        })
        .eq('id', legacyId)
    : await admin.from('subscriptions').insert({
        user_email: user.email ?? null,
        provider: 'paypal_checkout',
        provider_subscription_id: orderId,
        plan: 'premium',
        status: 'active',
      });

  if (legacyWrite.error) {
    throw new Error(
      `SUBSCRIPTION_WRITE_FAILED: ${legacyWrite.error.message}`,
    );
  }
}

async function persistPayment(
  admin: SupabaseClient,
  user: SupabaseUser,
  orderId: string,
  captureId: string,
  amount: number,
  currency: string,
  now: string,
): Promise<void> {
  let paymentWrite = await admin.from('payments').insert({
    user_id: user.id,
    user_email: user.email ?? null,
    provider: 'paypal_checkout',
    provider_subscription_id: orderId,
    provider_capture_id: captureId,
    amount,
    currency,
    status: 'paid',
    created_at: now,
  });

  if (paymentWrite.error) {
    paymentWrite = await admin.from('payments').insert({
      user_email: user.email ?? null,
      provider: 'paypal_checkout',
      provider_subscription_id: orderId,
      amount,
      currency,
      status: 'paid',
    });
  }

  if (paymentWrite.error) {
    console.error('[paypal/capture-order] payment record failed', paymentWrite.error);
  }
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

    const captureResult = await capturePremiumOrder(orderId);
    const verified = validatePremiumCapture(captureResult, auth.user.id);
    const now = new Date().toISOString();

    await persistPremiumSubscription(admin, auth.user, orderId, now);
    await persistPayment(
      admin,
      auth.user,
      orderId,
      verified.captureId,
      verified.amount,
      verified.currency,
      now,
    );

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
