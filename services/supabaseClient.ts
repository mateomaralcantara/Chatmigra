/// <reference types="vite/client" />
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const isBrowser = typeof window !== 'undefined';

let supabaseUrl: string | undefined;
let supabaseAnonKey: string | undefined;

if (isBrowser) {
  // Front (Vite)
  supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
} else {
  // Node / scripts dentro del monorepo
  supabaseUrl = process.env.SUPABASE_URL;
  supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
}

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Faltan variables de entorno de Supabase. Define VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (frontend) o SUPABASE_URL / SUPABASE_ANON_KEY (Node).'
  );
}

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey);
