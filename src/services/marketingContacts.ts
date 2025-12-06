// src/services/marketingContacts.ts
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('[marketingContacts] Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY');
  throw new Error('Missing Supabase env vars for marketingContacts');
}

export async function saveMarketingContact(email: string) {
  const url = `${supabaseUrl}/rest/v1/marketing_contacts?on_conflict=email&apikey=${supabaseAnonKey}`;

  console.log('[marketingContacts] Llamando a:', url.replace(supabaseAnonKey, '***'));

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Preferencia para upsert (merge)
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify({ email }),
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // no es JSON, da igual
  }

  if (!res.ok) {
    console.error('[marketingContacts] Supabase error', res.status, text);
    throw new Error(json?.message || `Supabase error ${res.status}: ${text}`);
  }

  console.log('[marketingContacts] OK', json);
  return json;
}
