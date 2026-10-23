import { supabase } from './supabaseClient';

export type ActivityType =
  | 'login'
  | 'signup'
  | 'logout'
  | 'upgrade_click'
  | 'upgrade_success'
  | 'plan_manage_open'
  | 'chat_message_sent'
  | 'chat_message_answered';

export async function logActivity(params: {
  userEmail: string;
  type: ActivityType;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { error } = await supabase.from('user_activity').insert({
      user_id: user.id,
      user_email: user.email || params.userEmail,
      type: params.type,
      metadata: params.metadata || {},
    });

    if (error) {
      console.warn('[activity] persistence unavailable:', error.message);
    }
  } catch (error) {
    console.warn('[activity] skipped:', error);
  }
}
