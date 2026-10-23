export type ChatRole = 'user' | 'model';

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ChatMessage {
  role: ChatRole;
  content: string;
  tokenUsage?: TokenUsage | null;
}

export enum Plan {
  FREE = 'free',
  PRO = 'pro',
  PREMIUM = 'premium',
}

export interface User {
  id?: string;
  email: string;
  firstName: string;
  lastName: string;
  isAdmin?: boolean;
}

export interface Conversation {
  id: string;
  created_at: string;
  title?: string | null;
}

export type ChecklistStatus = 'Pendiente' | 'En Progreso' | 'Completado';

export interface ChecklistItem {
  task: string;
  status: ChecklistStatus;
  notes: string;
}

export interface ChecklistData {
  title: string;
  items: ChecklistItem[];
}

export type TimelineStatus = 'Completado' | 'Actual' | 'Próximo';

export interface TimelineEvent {
  date: string;
  description: string;
  status: TimelineStatus;
}

export interface TimelineData {
  title: string;
  events: TimelineEvent[];
}

export type SubscriptionStatus =
  | 'none'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'incomplete'
  | 'trialing';

export type PaymentStatus = 'paid' | 'pending' | 'failed' | 'refunded';

export interface AccountSubscription {
  planId: Plan;
  planName: string;
  status: SubscriptionStatus;
  currentPeriodEnd: string;
}

export interface AccountQuotas {
  messagesRemaining: number;
  messagesMax: number;
  tokensRemaining: number;
  tokensMax: number;
}

export interface AccountPayment {
  id: string;
  date: string;
  amount: number;
  status: PaymentStatus;
}

export interface ActivityEvent {
  id: string;
  type: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface AccountDashboardData {
  subscription: AccountSubscription;
  quotas: AccountQuotas;
  payments: AccountPayment[];
  activity: ActivityEvent[];
}
