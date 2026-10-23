import { supabase } from './supabaseClient';

async function getAccessToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    throw new Error('No se pudo validar la sesión.');
  }

  const token = data.session?.access_token;

  if (!token) {
    throw new Error('Tu sesión expiró. Inicia sesión nuevamente.');
  }

  return token;
}

export async function authenticatedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const accessToken = await getAccessToken();
  const headers = new Headers(init.headers);

  headers.set('Authorization', `Bearer ${accessToken}`);

  return fetch(input, {
    ...init,
    headers,
  });
}
