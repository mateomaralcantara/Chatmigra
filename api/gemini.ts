import type { SupabaseClient } from '@supabase/supabase-js';
import {
  requireAuthenticatedUser,
  type RequestLike,
} from '../server/supabase';

type ChatRole = 'user' | 'model';

interface ChatMessage {
  role: ChatRole;
  content: string;
}

interface ApiRequest extends RequestLike {
  method?: string;
  body?: unknown;
}

interface ApiResponse {
  status(code: number): ApiResponse;
  json(body: unknown): void;
  setHeader?(name: string, value: string): void;
}

interface QuotaReservation {
  ok?: boolean;
  remaining?: number;
  reserved?: number;
}

const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash';
const FREE_TOKENS_MAX = 3000;

function readBody(body: unknown): Record<string, unknown> {
  if (body == null) return {};

  if (typeof body === 'string') {
    const trimmed = body.trim();
    return trimmed ? (JSON.parse(trimmed) as Record<string, unknown>) : {};
  }

  return typeof body === 'object' ? (body as Record<string, unknown>) : {};
}

function normalizeMessages(input: unknown): ChatMessage[] {
  if (!Array.isArray(input)) return [];

  return input
    .filter(
      (item): item is Record<string, unknown> =>
        !!item && typeof item === 'object',
    )
    .map((item) => ({
      role: item.role === 'model' ? 'model' : 'user',
      content: typeof item.content === 'string' ? item.content.trim() : '',
    }))
    .filter((item) => item.content.length > 0)
    .slice(-30);
}

function systemInstruction(plan: string): string {
  const depth =
    plan === 'premium' || plan === 'pro'
      ? 'Responde con profundidad, pasos, riesgos, alternativas y ejemplos prácticos cuando sean útiles.'
      : 'Responde de forma clara, práctica y suficientemente completa, evitando relleno.';

  return [
    'Eres ChatMi, un asistente migratorio conversacional.',
    'Responde principalmente en el idioma del usuario; por defecto, español neutro.',
    'Ofrece orientación general y no garantices aprobaciones.',
    'Distingue hechos, estimaciones y recomendaciones.',
    'Cuando una regla migratoria pueda cambiar, indica que debe verificarse en la fuente oficial correspondiente.',
    depth,
  ].join('\n');
}

function estimateReservation(messages: ChatMessage[]): number {
  const chars = messages.reduce((total, message) => total + message.content.length, 0);
  const estimatedInputTokens = Math.ceil(chars / 3);
  return Math.min(FREE_TOKENS_MAX, Math.max(700, estimatedInputTokens + 900));
}

async function resolvePlan(
  supabase: SupabaseClient,
  userId: string,
  userEmail: string,
): Promise<'free' | 'pro' | 'premium'> {
  try {
    const byId = await supabase
      .from('subscriptions')
      .select('plan,status')
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle();

    if (!byId.error && byId.data) {
      return byId.data.plan === 'premium' || byId.data.plan === 'pro'
        ? byId.data.plan
        : 'free';
    }

    const byEmail = await supabase
      .from('subscriptions')
      .select('plan,status')
      .eq('user_email', userEmail)
      .eq('status', 'active')
      .limit(1);

    const legacy = Array.isArray(byEmail.data) ? byEmail.data[0] : null;

    return legacy?.plan === 'premium' || legacy?.plan === 'pro'
      ? legacy.plan
      : 'free';
  } catch {
    return 'free';
  }
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader?.('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await requireAuthenticatedUser(req);
  if (!auth) {
    return res.status(401).json({
      error: 'Tu sesión expiró. Inicia sesión nuevamente.',
      code: 'AUTH_REQUIRED',
    });
  }

  const apiKey = (
    process.env.GEMINI_API_KEY ||
    process.env.VITE_GEMINI_API_KEY ||
    ''
  ).trim();
  if (!apiKey) {
    return res.status(500).json({
      error: 'Gemini no está configurado en el servidor.',
      code: 'GEMINI_KEY_MISSING',
    });
  }

  let reservedTokens = 0;
  let quotaEnforced = false;

  try {
    const body = readBody(req.body);
    const messages = normalizeMessages(body.messages);

    if (messages.length === 0) {
      return res.status(400).json({ error: 'At least one message is required' });
    }

    const effectivePlan = await resolvePlan(
      auth.supabase,
      auth.user.id,
      auth.user.email || '',
    );

    if (effectivePlan === 'free') {
      reservedTokens = estimateReservation(messages);

      const { data, error } = await auth.supabase.rpc('chatmi_reserve_tokens', {
        p_tokens: reservedTokens,
      });

      if (!error) {
        quotaEnforced = true;
        const reservation = (data || {}) as QuotaReservation;

        if (!reservation.ok) {
          return res.status(429).json({
            error: 'Has consumido tus 3,000 tokens gratuitos.',
            code: 'FREE_QUOTA_EXHAUSTED',
            remaining: reservation.remaining ?? 0,
          });
        }
      } else {
        console.warn(
          '[gemini] Quota RPC unavailable; request allowed in degraded mode:',
          error.message,
        );
        reservedTokens = 0;
      }
    }

    const contents = messages.map((message) => ({
      role: message.role === 'model' ? 'model' : 'user',
      parts: [{ text: message.content }],
    }));

    const url =
      'https://generativelanguage.googleapis.com/v1beta/models/' +
      encodeURIComponent(TEXT_MODEL) +
      ':generateContent?key=' +
      encodeURIComponent(apiKey);

    const googleResponse = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemInstruction(effectivePlan) }],
        },
        contents,
        generationConfig: {
          temperature: 0.35,
          maxOutputTokens: effectivePlan === 'free' ? 700 : 2048,
        },
      }),
    });

    const raw = await googleResponse.text();
    let data: any;

    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = { raw };
    }

    if (!googleResponse.ok) {
      if (quotaEnforced && reservedTokens > 0) {
        await auth.supabase.rpc('chatmi_finalize_tokens', {
          p_reserved: reservedTokens,
          p_actual: 0,
        });
      }

      console.error('[gemini] Google API error', googleResponse.status, data);

      return res.status(googleResponse.status).json({
        error: data?.error?.message || 'Gemini request failed',
        code: data?.error?.status || 'GEMINI_UPSTREAM_ERROR',
      });
    }

    const text = Array.isArray(data?.candidates?.[0]?.content?.parts)
      ? data.candidates[0].content.parts
          .map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
          .join('')
          .trim()
      : '';

    if (!text) {
      if (quotaEnforced && reservedTokens > 0) {
        await auth.supabase.rpc('chatmi_finalize_tokens', {
          p_reserved: reservedTokens,
          p_actual: 0,
        });
      }

      return res.status(502).json({
        error: 'Gemini returned an empty response',
        code: 'GEMINI_EMPTY_RESPONSE',
      });
    }

    const actualTokens = Number(data?.usageMetadata?.totalTokenCount || 0);
    let remaining: number | null = null;

    if (quotaEnforced && reservedTokens > 0) {
      const { data: finalized, error: finalizeError } = await auth.supabase.rpc(
        'chatmi_finalize_tokens',
        {
          p_reserved: reservedTokens,
          p_actual: Math.max(0, actualTokens),
        },
      );

      if (finalizeError) {
        console.error('[gemini] quota finalize failed', finalizeError);
      } else if (finalized && typeof finalized === 'object') {
        remaining = Number((finalized as { remaining?: number }).remaining ?? 0);
      }
    }

    return res.status(200).json({
      text,
      model: TEXT_MODEL,
      plan: effectivePlan,
      usageMetadata: data?.usageMetadata ?? null,
      quota: {
        enforced: quotaEnforced,
        remaining,
      },
    });
  } catch (error) {
    if (quotaEnforced && reservedTokens > 0) {
      try {
        await auth.supabase.rpc('chatmi_finalize_tokens', {
          p_reserved: reservedTokens,
          p_actual: 0,
        });
      } catch {
        // Best effort refund.
      }
    }

    console.error('[gemini] Internal error:', error);

    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal error',
      code: 'GEMINI_INTERNAL_ERROR',
    });
  }
}
