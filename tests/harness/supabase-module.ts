// Drop-in replacement for server/supabase.ts, wired to the in-memory backend.
// Use from a test with:
//   vi.mock('../../server/supabase', () => import('../harness/supabase-module'));
import { backend } from './backend';

export interface RequestLike {
  headers?: Record<string, string | string[] | undefined>;
}

export function getSupabaseConfig() {
  return { url: 'https://fake.supabase.local', publishableKey: 'fake-publishable' };
}

export async function requireAuthenticatedUser(req: RequestLike) {
  const raw = req.headers?.authorization;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || !value.toLowerCase().startsWith('bearer ')) return null;
  const token = value.slice(7).trim();
  const user = backend.users.get(token);
  if (!user) return null;
  return { user, supabase: backend.client(), token };
}

export function getAdminSupabase() {
  return backend.adminConfigured ? backend.client() : null;
}
