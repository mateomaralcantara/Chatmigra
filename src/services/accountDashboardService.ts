import {
  AccountDashboardData,
  Plan,
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

export const getAccountDashboardData = async (
  plan: Plan = Plan.FREE,
): Promise<AccountDashboardData> => {
  const isFree = plan === Plan.FREE;

  return {
    subscription: {
      planId: plan,
      planName: planName(plan),
      status: isFree ? 'none' : 'active',
      currentPeriodEnd: '',
    },
    quotas: {
      messagesRemaining: 0,
      messagesMax: 0,
      tokensRemaining: isFree ? 3000 : 0,
      tokensMax: isFree ? 3000 : 0,
    },
    payments: [],
    activity: [],
  };
};
