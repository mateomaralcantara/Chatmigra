import { readServerEnv } from '../server/env';
import {
  requireAuthenticatedUser,
  type RequestLike,
} from '../server/supabase';

interface ApiResponse {
  status(code: number): ApiResponse;
  json(body: unknown): void;
  setHeader?(name: string, value: string): void;
}

const LIVE_MODEL = readServerEnv('GEMINI_LIVE_MODEL') || 'gemini-3.8-live';

export default async function handler(
  req: RequestLike & { method?: string },
  res: ApiResponse,
) {
  res.setHeader?.('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await requireAuthenticatedUser(req);
  if (!auth) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const apiKey = (
    readServerEnv('GEMINI_API_KEY') ||
    ''
  ).trim();

  if (!apiKey) {
    return res.status(500).json({
      error: 'Gemini server key is not configured',
      code: 'GEMINI_KEY_MISSING',
    });
  }

  try {
    const byId = await auth.supabase
      .from('subscriptions')
      .select('plan,status')
      .eq('user_id', auth.user.id)
      .eq('status', 'active')
      .maybeSingle();

    let subscription = byId.data;

    if (byId.error || !subscription) {
      const byEmail = await auth.supabase
        .from('subscriptions')
        .select('plan,status')
        .eq('user_email', auth.user.email || '')
        .eq('status', 'active')
        .limit(1);

      subscription = Array.isArray(byEmail.data) ? byEmail.data[0] : null;
    }

    if (subscription?.plan !== 'premium' && subscription?.plan !== 'pro') {
      return res.status(403).json({
        error: 'La conversación por voz requiere un plan Premium.',
        code: 'PREMIUM_REQUIRED',
      });
    }

    const now = Date.now();
    const payload = {
      uses: 1,
      expireTime: new Date(now + 30 * 60 * 1000).toISOString(),
      newSessionExpireTime: new Date(now + 5 * 60 * 1000).toISOString(),
    };

    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1alpha/auth_tokens?key=' +
        encodeURIComponent(apiKey),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );

    const raw = await response.text();
    const data = raw ? (JSON.parse(raw) as any) : {};

    if (!response.ok || typeof data?.name !== 'string') {
      return res.status(response.ok ? 502 : response.status).json({
        error: 'No se pudo conectar con el servicio de voz de Gemini (HTTP ' + response.status + ').',
        code: 'GEMINI_LIVE_TOKEN_ERROR',
      });
    }

    return res.status(200).json({
      token: data.name,
      model: LIVE_MODEL,
      apiVersion: 'v1alpha',
    });
  } catch (error) {
    console.error('[gemini-live] Internal error:', error);
    return res.status(500).json({
      error: 'No se pudo completar la solicitud de voz.',
      code: 'GEMINI_LIVE_INTERNAL_ERROR',
    });
  }
}
