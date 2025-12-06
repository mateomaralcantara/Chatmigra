import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

console.log('[SUPABASE DEBUG]', {
  supabaseUrl,
  hasAnonKey: !!supabaseAnonKey,
});

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase env vars: VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
  throw new Error('Missing Supabase env vars: VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
}

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey);
