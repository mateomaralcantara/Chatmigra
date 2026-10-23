import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type ServerPlan = 'free' | 'pro' | 'premium';

interface RequestWithHeaders {
  headers?: Record<string, string | string[] | undefined>;
}

export interface AuthenticatedRequestContext {
  userId: string;
  email: string;
  accessToken: string;
  supabase: SupabaseClient;
}

function headerValue(
  headers: RequestWithHeaders['headers'],
  name: string,
): string | undefined {
  if (!headers) return undefined;

  const key = Object.keys(headers).find(
    (candidate) => candidate.toLowerCase() === name.toLowerCase(),
  );

  if (!key) return undefined;

  const value = headers[key];
  return Array.isArray(value) ? value[0] : value;
}

function getBearerToken(req: RequestWithHeaders): string | null {
  const authorization = headerValue(req.headers, 'authorization');

  if (!authorization) return null;

  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function getSupabaseServerConfig(): { url: string; key: string } | null {
  const url =
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL;

  const key =
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !key) return null;

  return { url, key };
}

export async function authenticateRequest(
  req: RequestWithHeaders,
): Promise<AuthenticatedRequestContext | null> {
  const accessToken = getBearerToken(req);
  const config = getSupabaseServerConfig();

  if (!accessToken || !config) return null;

  const supabase = createClient(config.url, config.key, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const { data, error } = await supabase.auth.getUser(accessToken);

  if (error || !data.user?.id || !data.user.email) {
    return null;
  }

  return {
    userId: data.user.id,
    email: data.user.email,
    accessToken,
    supabase,
  };
}

export async function resolveServerPlan(
  context: AuthenticatedRequestContext,
): Promise<ServerPlan> {
  const { data, error } = await context.supabase
    .from('subscriptions')
    .select('plan,status')
    .eq('user_email', context.email)
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn('[auth] Could not resolve subscription:', error.message);
    return 'free';
  }

  const plan = data?.plan;

  if (plan === 'premium' || plan === 'pro') return plan;
  return 'free';
}
