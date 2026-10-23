import { createClient, type SupabaseClient, type User as SupabaseUser } from '@supabase/supabase-js';

export interface RequestLike {
  headers?: Record<string, string | string[] | undefined>;
}

export interface AuthContext {
  user: SupabaseUser;
  supabase: SupabaseClient;
  token: string;
}

function env(name: string): string {
  return (process.env[name] || '').trim();
}

export function getSupabaseConfig(): { url: string; publishableKey: string } | null {
  const url = env('SUPABASE_URL') || env('VITE_SUPABASE_URL');
  const publishableKey =
    env('SUPABASE_PUBLISHABLE_KEY') ||
    env('VITE_SUPABASE_PUBLISHABLE_KEY') ||
    env('VITE_SUPABASE_ANON_KEY');

  if (!url || !publishableKey) return null;
  return { url, publishableKey };
}

function bearerToken(req: RequestLike): string | null {
  const raw = req.headers?.authorization;
  const value = Array.isArray(raw) ? raw[0] : raw;

  if (!value || !value.toLowerCase().startsWith('bearer ')) return null;
  const token = value.slice(7).trim();
  return token || null;
}

export async function requireAuthenticatedUser(
  req: RequestLike,
): Promise<AuthContext | null> {
  const config = getSupabaseConfig();
  const token = bearerToken(req);

  if (!config || !token) return null;

  const supabase = createClient(config.url, config.publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) return null;

  return { user, supabase, token };
}

export function getAdminSupabase(): SupabaseClient | null {
  const config = getSupabaseConfig();
  const serviceRoleKey = env('SUPABASE_SERVICE_ROLE_KEY');

  if (!config || !serviceRoleKey) return null;

  return createClient(config.url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
