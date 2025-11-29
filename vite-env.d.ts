/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_GEMINI_API_KEY: string;
    // Aquí puedes ir agregando más variables si luego las usas:
    // readonly VITE_SUPABASE_URL: string;
    // readonly VITE_SUPABASE_ANON_KEY: string;
  }
  
  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
  