type ChatRole = 'user' | 'model';

interface ChatMessage {
  role: ChatRole;
  content: string;
}

interface ApiRequest {
  method?: string;
  body?: unknown;
}

interface ApiResponse {
  status(code: number): ApiResponse;
  json(body: unknown): void;
  setHeader?(name: string, value: string): void;
}

const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || 'gemini-3.8-flash';

function readBody(body: unknown): Record<string, unknown> {
  if (body == null) return {};
  if (typeof body === 'string') {
    const trimmed = body.trim();
    return trimmed ? JSON.parse(trimmed) : {};
  }
  if (typeof body === 'object') return body as Record<string, unknown>;
  return {};
}

function normalizeMessages(input: unknown): ChatMessage[] {
  if (!Array.isArray(input)) return [];

  return input
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => ({
      role: item.role === 'model' ? 'model' : 'user',
      content: typeof item.content === 'string' ? item.content.trim() : '',
    }))
    .filter((item) => item.content.length > 0)
    .slice(-40);
}

function systemInstruction(plan: string): string {
  const depth =
    plan === 'premium'
      ? 'Responde con profundidad, pasos, riesgos, alternativas y ejemplos prácticos cuando ayuden.'
      : plan === 'pro'
        ? 'Responde con detalle moderado, requisitos, plazos típicos, riesgos y pasos accionables.'
        : 'Responde de forma breve, clara y práctica. Prioriza lo esencial.';

  return [
    'Eres ChatMig, un asistente migratorio conversacional.',
    'Responde principalmente en el idioma del usuario; por defecto, español neutro.',
    'Ofrece orientación general, no garantías de aprobación ni asesoría jurídica personalizada.',
    'Distingue hechos, estimaciones y recomendaciones.',
    'Cuando una regla migratoria pueda cambiar, recomienda verificarla en la fuente oficial correspondiente.',
    depth,
  ].join('\n');
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader?.('Cache-Control', 'no-store');

  if (req.method && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey =
    process.env.GEMINI_API_KEY ||
    process.env.VITE_GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: 'Gemini server key is not configured',
      code: 'GEMINI_KEY_MISSING',
    });
  }

  try {
    const body = readBody(req.body);
    const messages = normalizeMessages(body.messages);
    const plan =
      body.plan === 'premium' || body.plan === 'pro' || body.plan === 'free'
        ? body.plan
        : 'free';

    if (messages.length === 0) {
      return res.status(400).json({ error: 'At least one message is required' });
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
          parts: [{ text: systemInstruction(String(plan)) }],
        },
        contents,
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
      console.error('[gemini] Google API error', googleResponse.status, data);
      return res.status(googleResponse.status).json({
        error:
          data?.error?.message ||
          'Gemini request failed',
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
      return res.status(502).json({
        error: 'Gemini returned an empty response',
        code: 'GEMINI_EMPTY_RESPONSE',
      });
    }

    return res.status(200).json({
      text,
      model: TEXT_MODEL,
      usageMetadata: data?.usageMetadata ?? null,
    });
  } catch (error) {
    console.error('[gemini] Internal error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal error',
      code: 'GEMINI_INTERNAL_ERROR',
    });
  }
}
