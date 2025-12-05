// Rol de mensaje en el chat
export type ChatRole = 'user' | 'model';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

// Planes disponibles en la app
export enum Plan {
  FREE = 'free',
  PRO = 'pro',
  PREMIUM = 'premium',
}

// Datos básicos del usuario autenticado
export interface User {
  email: string;
  firstName: string;
  lastName: string;
}

// Conversaciones guardadas (id de Supabase, fecha ISO)
export interface Conversation {
  id: string;
  created_at: string; // ISO string desde la BD
  title?: string | null; // 🆕 título de la conversación
}

// ---- Checklist ----

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

// ---- Timeline / Línea de tiempo ----

export type TimelineStatus = 'Completado' | 'Actual' | 'Próximo';

export interface TimelineEvent {
  date: string; // ISO string
  description: string;
  status: TimelineStatus;
}

export interface TimelineData {
  title: string;
  events: TimelineEvent[];
}

// ---- Dashboard de cuenta / suscripción ----

export type SubscriptionStatus =
  | 'none'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'incomplete'
  | 'trialing';

export type PaymentStatus = 'paid' | 'pending' | 'failed' | 'refunded';

export interface AccountSubscription {
  planId: Plan;            // id interno del plan
  planName: string;        // nombre legible del plan
  status: SubscriptionStatus;
  currentPeriodEnd: string; // ISO string (próxima renovación o fin de acceso)
}

export interface AccountQuotas {
  messagesRemaining: number;
  messagesMax: number;
  tokensRemaining: number;
  tokensMax: number;
}

export interface AccountPayment {
  id: string;
  date: string;      // ISO string
  amount: number;    // número para cálculos
  status: PaymentStatus;
}

export interface ActivityEvent {
  id: string;
  type: string;
  createdAt: string; // fecha/hora del evento
  metadata?: Record<string, any>;
}

export interface AccountDashboardData {
  subscription: AccountSubscription;
  quotas: AccountQuotas;
  payments: AccountPayment[];
  activity: ActivityEvent[];
}
