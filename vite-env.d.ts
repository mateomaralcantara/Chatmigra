/// <reference types="vite/client" />

// Browser-visible variables only. Server secrets (GEMINI_API_KEY,
// SUPABASE_SERVICE_ROLE_KEY, PAYPAL_CLIENT_SECRET) must never use VITE_.
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_PAYPAL_CLIENT_ID?: string;
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_APP_VERSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
