import type { SupabaseClient, User as SupabaseUser } from '@supabase/supabase-js';
import { parseJsonObject, rejectIfRateLimited } from '../../server/http';
import {
  capturePremiumOrder,
  PayPalError,
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
  // Retries of the same capture must never record the payment twice.
  const existing = await admin
    .from('payments')
    .select('id')
    .eq('provider_capture_id', captureId)
    .limit(1);
  if (!existing.error && existing.data && existing.data.length > 0) return;

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
      provider_capture_id: captureId,
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

  const body = parseJsonObject(req.body);
  if (!body) {
    return res.status(400).json({ error: 'Invalid JSON body', code: 'INVALID_BODY' });
  }

  const orderId = typeof body.orderId === 'string' ? body.orderId.trim() : '';
  if (!orderId || !/^[A-Z0-9-]{1,64}$/i.test(orderId)) {
    return res.status(400).json({ error: 'orderId is required', code: 'INVALID_ORDER_ID' });
  }

  if (rejectIfRateLimited(res, auth.user.id, 'paypal-capture')) return;

  let verified: ReturnType<typeof validatePremiumCapture>;
  try {
    const captureResult = await capturePremiumOrder(orderId);
    verified = validatePremiumCapture(captureResult, auth.user.id);
  } catch (error) {
    console.error('[paypal/capture-order] capture', error);
    if (error instanceof PayPalError && error.message === 'PAYPAL_CAPTURE_VALIDATION_FAILED') {
      return res.status(422).json({
        error: 'El pago no coincide con el plan Premium de esta cuenta.',
        code: 'PAYMENT_NOT_VALID',
      });
    }
    if (error instanceof PayPalError && error.status >= 400 && error.status < 500) {
      return res.status(402).json({
        error: 'PayPal no confirmó el pago. No se realizó ningún cargo nuevo.',
        code: 'PAYMENT_NOT_CAPTURED',
      });
    }
    return res.status(502).json({
      error: 'No pudimos comunicarnos con PayPal. Inténtalo de nuevo.',
      code: 'PAYPAL_UNAVAILABLE',
    });
  }

  try {
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
  } catch (error) {
    // The money was captured: tell the client to retry. A retry reads the
    // already-captured order back from PayPal and finishes activation.
    console.error('[paypal/capture-order] activation', error);
    return res.status(503).json({
      error: 'Tu pago fue recibido; estamos activando Premium. Reintenta en unos segundos.',
      code: 'ACTIVATION_PENDING',
      orderId,
    });
  }

  return res.status(200).json({
    ok: true,
    plan: 'premium',
    orderId,
    captureId: verified.captureId,
  });
}
