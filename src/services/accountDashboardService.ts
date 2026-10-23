import { supabase } from './supabaseClient';
import {
  type AccountDashboardData,
  Plan,
  type PaymentStatus,
} from '../types';

function planName(plan: Plan): string {
  switch (plan) {
    case Plan.PREMIUM:
      return 'Premium';
    case Plan.PRO:
      return 'Pro';
    default:
      return 'Free';
  }
}

export async function getAccountDashboardData(
  fallbackPlan: Plan = Plan.FREE,
): Promise<AccountDashboardData> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Sesión no disponible.');
  }

  let effectivePlan = fallbackPlan;
  let subscriptionStatus: AccountDashboardData['subscription']['status'] =
    fallbackPlan === Plan.FREE ? 'none' : 'active';

  try {
    const byId = await supabase
      .from('subscriptions')
      .select('plan,status')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();

    let subscription = byId.data;

    if (byId.error || !subscription) {
      const byEmail = await supabase
        .from('subscriptions')
        .select('plan,status')
        .eq('user_email', user.email || '')
        .eq('status', 'active')
        .limit(1);

      subscription = Array.isArray(byEmail.data) ? byEmail.data[0] : null;
    }

    if (subscription?.plan === 'premium') effectivePlan = Plan.PREMIUM;
    else if (subscription?.plan === 'pro') effectivePlan = Plan.PRO;
    else if (subscription?.plan === 'free') effectivePlan = Plan.FREE;

    if (subscription?.status) {
      subscriptionStatus =
        subscription.status as AccountDashboardData['subscription']['status'];
    }
  } catch {
    // The dashboard remains usable even if persistence is temporarily degraded.
  }

  let tokensMax = effectivePlan === Plan.FREE ? 3000 : 0;
  let tokensRemaining = effectivePlan === Plan.FREE ? 3000 : 0;

  if (effectivePlan === Plan.FREE) {
    try {
      const { data } = await supabase
        .from('account_quotas')
        .select('tokens_max,tokens_used,tokens_reserved')
        .eq('user_id', user.id)
        .maybeSingle();

      if (data) {
        tokensMax = Number(data.tokens_max || 3000);
        tokensRemaining = Math.max(
          tokensMax -
            Number(data.tokens_used || 0) -
            Number(data.tokens_reserved || 0),
          0,
        );
      }
    } catch {
      // Use safe defaults.
    }
  }

  let payments: AccountDashboardData['payments'] = [];
  try {
    const byId = await supabase
      .from('payments')
      .select('id,created_at,amount,status')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);

    let paymentRows = byId.data;

    if (byId.error) {
      const byEmail = await supabase
        .from('payments')
        .select('id,created_at,amount,status')
        .eq('user_email', user.email || '')
        .order('created_at', { ascending: false })
        .limit(20);

      paymentRows = byEmail.data;
    }

    payments = (paymentRows || []).map((payment) => ({
      id: String(payment.id),
      date: String(payment.created_at || ''),
      amount: Number(payment.amount || 0),
      status: (payment.status || 'pending') as PaymentStatus,
    }));
  } catch {
    payments = [];
  }

  let activity: AccountDashboardData['activity'] = [];
  try {
    const byId = await supabase
      .from('user_activity')
      .select('id,type,created_at,metadata')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30);

    let activityRows = byId.data;

    if (byId.error) {
      const byEmail = await supabase
        .from('user_activity')
        .select('id,type,created_at,metadata')
        .eq('user_email', user.email || '')
        .order('created_at', { ascending: false })
        .limit(30);

      activityRows = byEmail.data;
    }

    activity = (activityRows || []).map((event) => ({
      id: String(event.id),
      type: String(event.type),
      createdAt: String(event.created_at),
      metadata:
        event.metadata && typeof event.metadata === 'object'
          ? (event.metadata as Record<string, unknown>)
          : {},
    }));
  } catch {
    activity = [];
  }

  return {
    subscription: {
      planId: effectivePlan,
      planName: planName(effectivePlan),
      status: subscriptionStatus,
      currentPeriodEnd:
        effectivePlan === Plan.FREE ? 'Plan gratuito' : 'Acceso activo',
    },
    quotas: {
      messagesRemaining: 0,
      messagesMax: 0,
      tokensRemaining,
      tokensMax,
    },
    payments,
    activity,
  };
}
