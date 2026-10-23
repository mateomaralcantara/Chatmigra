export type ISODateString = string;
export type ID = string;
export type View = 'chat' | 'dashboard' | 'tutor' | 'admin';

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export type ChatRole = 'user' | 'model';

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
  email: string;
  firstName: string;
  lastName: string;
  isAdmin?: boolean;
}

export interface Conversation {
  id: ID;
  created_at: ISODateString;
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
  date?: ISODateString;
  label?: string;
  title?: string;
  description: string;
  status?: TimelineStatus;
}

export interface TimelineData {
  title: string;
  events?: TimelineEvent[];
  items?: TimelineEvent[];
  steps?: TimelineEvent[];
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
  currentPeriodEnd: ISODateString | null;
}

export interface AccountQuotas {
  messagesRemaining: number;
  messagesMax: number;
  tokensRemaining: number;
  tokensMax: number;
}

export interface AccountPayment {
  id: ID;
  date: ISODateString;
  amount: number;
  status: PaymentStatus;
}

export type ActivityType =
  | 'login'
  | 'signup'
  | 'logout'
  | 'message_user'
  | 'message_assistant'
  | 'upgrade_click'
  | 'upgrade_success'
  | 'choose_free_plan'
  | 'plan_manage_open'
  | 'chat_message_sent'
  | 'chat_message_answered'
  | 'free_quota_exhausted'
  | (string & {});

export interface ActivityEvent {
  id: ID;
  type: ActivityType;
  createdAt: ISODateString;
  metadata?: Record<string, unknown>;
}

export interface AccountDashboardData {
  subscription: AccountSubscription;
  quotas: AccountQuotas;
  payments: AccountPayment[];
  activity: ActivityEvent[];
}

export type TutorLanguage = 'es' | 'en' | (string & {});
