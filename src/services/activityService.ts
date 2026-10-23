import { supabase } from './supabaseClient';
import type { ActivityType } from '../types';

export async function logActivity(params: {
  userEmail: string;
  type: ActivityType;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { userEmail, type, metadata = {} } = params;

  try {
    const { error } = await supabase.from('user_activity').insert({
      user_email: userEmail,
      type,
      metadata,
    });

    if (error) {
      console.error('Error guardando actividad:', error.message);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('Error inesperado guardando actividad:', message);
  }
}
