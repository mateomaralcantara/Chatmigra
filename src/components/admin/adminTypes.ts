// Row shapes shown in the admin dashboard.
// Tablas base
export interface SubscriptionRow {
  id: string;
  user_email: string;
  provider: string;
  provider_subscription_id: string | null;
  plan: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface PaymentRow {
  id: string;
  user_email: string;
  provider: string;
  provider_subscription_id: string | null;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
}

// Métricas generales
export interface AdminOverview {
  totalRevenue: number;
  totalPayments: number;
  activePremium: number;
  totalConversations: number;
}

// Agregado por usuario
export interface AdminUserRow {
  email: string;
  currentPlan: string | null;
  lastActivity: string | null;
  totalPayments: number;
  totalPaidUsd: number;
}

export const createEmptyUserRow = (email: string): AdminUserRow => ({
  email,
  currentPlan: null,
  lastActivity: null,
  totalPayments: 0,
  totalPaidUsd: 0,
});

