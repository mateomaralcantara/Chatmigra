import {
  type AccountDashboardData,
  type AccountPayment,
  type ActivityEvent,
  type PaymentStatus,
  Plan,
  type SubscriptionStatus,
} from '../types';
import { supabase } from './supabaseClient';

const FREE_TOKENS_MAX = 3000;

const planLabel = (plan: Plan): string => {
  if (plan === Plan.PREMIUM) return 'Premium';
  if (plan === Plan.PRO) return 'Pro';
  return 'Free';
};

const normalizePlan = (value: unknown, fallback: Plan): Plan => {
  return value === Plan.PREMIUM || value === Plan.PRO || value === Plan.FREE
    ? value
    : fallback;
};

const normalizeSubscriptionStatus = (value: unknown): SubscriptionStatus => {
  const allowed: SubscriptionStatus[] = [
    'none',
    'active',
    'past_due',
    'canceled',
    'incomplete',
    'trialing',
  ];
  return allowed.includes(value as SubscriptionStatus)
    ? (value as SubscriptionStatus)
    : 'none';
};

const normalizePaymentStatus = (value: unknown): PaymentStatus => {
  const allowed: PaymentStatus[] = ['paid', 'pending', 'failed', 'refunded'];
  return allowed.includes(value as PaymentStatus)
    ? (value as PaymentStatus)
    : 'pending';
};

export const getAccountDashboardData = async (
  userEmail: string,
  fallbackPlan: Plan,
): Promise<AccountDashboardData> => {
  const [subscriptionResult, paymentsResult, activityResult, quotaResult] =
    await Promise.all([
      supabase
        .from('subscriptions')
        .select('plan,status,updated_at')
        .eq('user_email', userEmail)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('payments')
        .select('id,created_at,amount,status')
        .eq('user_email', userEmail)
        .order('created_at', { ascending: false })
        .limit(30),
      supabase
        .from('user_activity')
        .select('id,type,created_at,metadata')
        .eq('user_email', userEmail)
        .order('created_at', { ascending: false })
        .limit(30),
      supabase
        .from('account_quotas')
        .select('messages_remaining,messages_max,tokens_remaining,tokens_max')
        .eq('user_email', userEmail)
        .maybeSingle(),
    ]);

  const subscriptionRow = subscriptionResult.data as
    | { plan?: unknown; status?: unknown; updated_at?: string | null }
    | null;

  const planId = normalizePlan(subscriptionRow?.plan, fallbackPlan);

  const payments: AccountPayment[] = (paymentsResult.data ?? []).map((row) => {
    const item = row as {
      id: string;
      created_at: string;
      amount: number | string;
      status: unknown;
    };

    const parsedAmount =
      typeof item.amount === 'number' ? item.amount : Number(item.amount);

    return {
      id: item.id,
      date: item.created_at,
      amount: Number.isFinite(parsedAmount) ? parsedAmount : 0,
      status: normalizePaymentStatus(item.status),
    };
  });

  const activity: ActivityEvent[] = (activityResult.data ?? []).map((row) => {
    const item = row as {
      id: string;
      type: string;
      created_at: string;
      metadata?: Record<string, unknown> | null;
    };

    return {
      id: item.id,
      type: item.type,
      createdAt: item.created_at,
      metadata: item.metadata ?? undefined,
    };
  });

  const quotaRow = quotaResult.data as
    | {
        messages_remaining?: number | null;
        messages_max?: number | null;
        tokens_remaining?: number | null;
        tokens_max?: number | null;
      }
    | null;

  const defaultTokens = planId === Plan.FREE ? FREE_TOKENS_MAX : 250_000;

  return {
    subscription: {
      planId,
      planName: planLabel(planId),
      status: normalizeSubscriptionStatus(subscriptionRow?.status),
      currentPeriodEnd: subscriptionRow?.updated_at ?? null,
    },
    quotas: {
      messagesRemaining: quotaRow?.messages_remaining ?? 0,
      messagesMax: quotaRow?.messages_max ?? 0,
      tokensRemaining: quotaRow?.tokens_remaining ?? defaultTokens,
      tokensMax: quotaRow?.tokens_max ?? defaultTokens,
    },
    payments,
    activity,
  };
};
