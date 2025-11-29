export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
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
}

export interface Conversation {
  id: string;
  created_at: string;
}

export interface ChecklistData {
  title: string;
  items: Array<{
    task: string;
    status: 'Pendiente' | 'En Progreso' | 'Completado' | string;
    notes: string;
  }>;
}

export interface TimelineData {
  title: string;
  events: Array<{
    date: string;
    description: string;
    status: 'Completado' | 'Actual' | 'Próximo' | string;
  }>;
}

export interface AccountDashboardData {
  subscription: {
    planId: string;
    planName: string;
    status: string;
    currentPeriodEnd: string;
  };
  quotas: {
    messagesRemaining: number;
    messagesMax: number;
    tokensRemaining: number;
    tokensMax: number;
  };
  payments: Array<{
    id: string;
    date: string;
    amount: string;
    status: string;
  }>;
}
