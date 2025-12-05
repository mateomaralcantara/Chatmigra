// src/services/activityService.ts
import { supabase } from './supabaseClient';

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
  | 'upgrade_click'
  | 'plan_manage_open'
  | 'chat_message_sent'
  | 'chat_message_answered';

export async function logActivity(params: {
  userEmail: string;
  type: ActivityType;
  metadata?: Record<string, unknown>;
}) {
  const { userEmail, type, metadata = {} } = params;

  try {
    const { error } = await supabase.from('user_activity').insert({
      user_email: userEmail,
      type,
      metadata,
    });

    if (error) {
      console.error('Error guardando actividad:', error);
    }
  } catch (err) {
    console.error('Error inesperado guardando actividad:', err);
  }
}
