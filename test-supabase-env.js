// test-supabase-env.js
require('dotenv').config(); // lee .env
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl =
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseAnonKey =
  process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

console.log('[TEST SUPABASE ENV]');
console.log('URL:', supabaseUrl);
console.log('Has anon key?:', !!supabaseAnonKey);

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

(async () => {
  try {
    const { data, error } = await supabase
      .from('marketing_contacts')
      .select('*')
      .limit(1);

    if (error) {
      console.error('❌ Error desde Supabase:', error);
      process.exit(1);
    }

    console.log('✅ Supabase respondió OK. Ejemplo de fila:', data);
    process.exit(0);
  } catch (e) {
    console.error('❌ Excepción llamando a Supabase:', e);
    process.exit(1);
  }
})();
