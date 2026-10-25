import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'dotenv';

// Only server code may import this file. Never import from React/Vite client code.
// Vercel dev can isolate API process.env from variables loaded by Vite itself.
const LOCAL_SERVER_VARIABLES = new Set([
  'GEMINI_API_KEY',
  'GEMINI_TEXT_MODEL',
  'GEMINI_LIVE_MODEL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_URL',
  'SUPABASE_PUBLISHABLE_KEY',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  'VITE_SUPABASE_ANON_KEY',
]);

export function readServerEnv(name: string): string {
  const configured = (process.env[name] || '').trim();
  if (configured) return configured;

  // Production and remote previews must use Vercel server secrets only.
  if (
    process.env.NODE_ENV === 'production' ||
    process.env.VERCEL_ENV === 'production' ||
    process.env.VERCEL_ENV === 'preview' ||
    !LOCAL_SERVER_VARIABLES.has(name)
  ) return '';

  // This fallback is intentionally limited to LOCAL dev-only files.
  // Do not load .env: it previously held a suspended Gemini key.
  // Do not mutate process.env or log anything sensitive.
  for (const filename of ['.env.development.local', '.env.local']) {
    try {
      const values = parse(readFileSync(resolve(process.cwd(), filename)));
      const value = (values[name] || '').trim();
      if (value) return value;
    } catch {
      // Missing/unreadable file: continue to the next local source.
    }
  }
  return '';
}
