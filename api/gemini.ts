import { GoogleGenAI } from '@google/genai';
import {
  authenticateRequest,
  resolveServerPlan,
  type ServerPlan,
} from '../lib/serverAuth';

type ChatRole = 'user' | 'model';

interface ChatMessage {
  role: ChatRole;
  content: string;
}

interface RequestLike {
  method?: string;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
}

interface ResponseLike {
  status: (code: number) => ResponseLike;
  json: (body: unknown) => void;
  setHeader?: (name: string, value: string) => void;
}

interface GeminiRequestBody {
  messages?: ChatMessage[];
}

const DEFAULT_MODEL = 'gemini-2.5-flash';
const MAX_MESSAGES = 40;
const MAX_TOTAL_CHARS = 120_000;
const FREE_TOKENS_MAX = 3000;

function readJsonBody(req: RequestLike): GeminiRequestBody {
  const body = req.body;

  if (body == null) return {};

  if (typeof body === 'string') {
    return body.trim() ? JSON.parse(body) as GeminiRequestBody : {};
  }

  if (Buffer.isBuffer(body)) {
    const text = body.toString('utf8').trim();
    return text ? JSON.parse(text) as GeminiRequestBody : {};
  }

  if (typeof body === 'object') {
    return body as GeminiRequestBody;
  }

  return {};
}

function getSystemInstruction(plan: ServerPlan): string {
  const depth =
    plan === 'premium'
      ? 'Responde con profundidad, pasos, riesgos, alternativas y ejemplos prácticos cuando aporten valor.'
      : plan === 'pro'
        ? 'Responde con detalle moderado, requisitos, pasos y errores comunes.'
        : 'Responde de forma breve, clara y útil, priorizando los pasos esenciales.';

  return `Eres ChatMig, un asistente migratorio conversacional.

Tu función es ofrecer orientación general sobre visas, residencia, permisos de trabajo, estudios, reunificación familiar y viajes.

Reglas:
- Responde principalmente en el idioma del usuario; por defecto, español neutro.
- Sé profesional, claro, directo y empático.
- No garantices aprobaciones ni resultados.
- No te presentes como abogado ni sustituyas asesoría legal profesional.
- Cuando el caso dependa de normativa vigente o hechos específicos, recomienda verificar la fuente oficial correspondiente.
- No inventes leyes, plazos, requisitos ni hechos.
- Plan verificado por servidor: ${plan}.
- ${depth}

Organiza las respuestas con párrafos cortos y listas cuando ayuden. No incluyas bloques técnicos internos.`;
}

function sanitizeMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is ChatMessage => {
      if (!item || typeof item !== 'object') return false;
      const candidate = item as Partial<ChatMessage>;
      return (
        (candidate.role === 'user' || candidate.role === 'model') &&
        typeof candidate.content === 'string' &&
        candidate.content.trim().length > 0
      );
    })
    .slice(-MAX_MESSAGES)
    .map((message) => ({
      role: message.role,
      content: message.content.trim(),
    }));
}

async function getOrCreateFreeQuota(
  email: string,
  context: Awaited<ReturnType<typeof authenticateRequest>>,
): Promise<{ remaining: number; error?: string }> {
  if (!context) return { remaining: 0, error: 'Unauthorized' };

  const { data, error } = await context.supabase
    .from('account_quotas')
    .select('tokens_remaining,tokens_max')
    .eq('user_email', email)
    .maybeSingle();

  if (error) {
    return { remaining: 0, error: error.message };
  }

  if (data) {
    const remaining =
      typeof data.tokens_remaining === 'number'
        ? Math.max(0, Math.floor(data.tokens_remaining))
        : FREE_TOKENS_MAX;

    return { remaining };
  }

  const { error: insertError } = await context.supabase
    .from('account_quotas')
    .upsert(
      {
        user_email: email,
        messages_remaining: 0,
        messages_max: 0,
        tokens_remaining: FREE_TOKENS_MAX,
        tokens_max: FREE_TOKENS_MAX,
      },
      { onConflict: 'user_email' },
    );

  if (insertError) {
    return { remaining: 0, error: insertError.message };
  }

  return { remaining: FREE_TOKENS_MAX };
}

export default async function handler(req: RequestLike, res: ResponseLike) {
  res.setHeader?.('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const auth = await authenticateRequest(req);

    if (!auth) {
      return res.status(401).json({ error: 'Sesión inválida o expirada.' });
    }

    const body = readJsonBody(req);
    const messages = sanitizeMessages(body.messages);
    const plan = await resolveServerPlan(auth);

    if (messages.length === 0 || messages[messages.length - 1]?.role !== 'user') {
      return res.status(400).json({ error: 'A user message is required.' });
    }

    const totalChars = messages.reduce(
      (sum, message) => sum + message.content.length,
      0,
    );

    if (totalChars > MAX_TOTAL_CHARS) {
      return res.status(413).json({ error: 'Conversation is too large.' });
    }

    let freeTokensBefore: number | null = null;

    if (plan === 'free') {
      const quota = await getOrCreateFreeQuota(auth.email, auth);

      if (quota.error) {
        console.error('[gemini] FREE quota unavailable:', quota.error);
        return res.status(503).json({
          error: 'No se pudo validar tu cuota FREE. Intenta nuevamente.',
        });
      }

      freeTokensBefore = quota.remaining;

      if (freeTokensBefore <= 0) {
        return res.status(429).json({
          error: 'Has consumido los 3,000 tokens del plan FREE.',
          tokensRemaining: 0,
        });
      }
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

    if (!apiKey) {
      console.error('[gemini] Missing GEMINI_API_KEY/GOOGLE_API_KEY');
      return res.status(500).json({
        error: 'Gemini server configuration is missing.',
      });
    }

    const model = process.env.GEMINI_TEXT_MODEL || DEFAULT_MODEL;
    const ai = new GoogleGenAI({ apiKey });

    const contents = messages.map((message) => ({
      role: message.role,
      parts: [{ text: message.content }],
    }));

    const response = await ai.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction: getSystemInstruction(plan),
        temperature: 0.3,
      },
    });

    const text = response.text?.trim() ?? '';

    if (!text) {
      console.error('[gemini] Empty model response');
      return res.status(502).json({ error: 'Gemini returned an empty response.' });
    }

    const usage = response.usageMetadata
      ? {
          promptTokenCount: response.usageMetadata.promptTokenCount ?? 0,
          candidatesTokenCount: response.usageMetadata.candidatesTokenCount ?? 0,
          totalTokenCount: response.usageMetadata.totalTokenCount ?? 0,
        }
      : null;

    let tokensRemaining = freeTokensBefore;

    if (plan === 'free' && freeTokensBefore !== null) {
      const usedTokens = Math.max(0, usage?.totalTokenCount ?? 0);
      tokensRemaining = Math.max(0, freeTokensBefore - usedTokens);

      const { error: quotaUpdateError } = await auth.supabase
        .from('account_quotas')
        .update({
          tokens_remaining: tokensRemaining,
          tokens_max: FREE_TOKENS_MAX,
        })
        .eq('user_email', auth.email);

      if (quotaUpdateError) {
        console.error('[gemini] Could not persist FREE usage:', quotaUpdateError.message);
        return res.status(503).json({
          error: 'La respuesta fue generada, pero no se pudo registrar la cuota. Intenta nuevamente.',
        });
      }
    }

    return res.status(200).json({
      text,
      model,
      plan,
      usageMetadata: usage,
      tokensRemaining,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[gemini] Internal error:', message);
    return res.status(500).json({ error: 'Gemini request failed.' });
  }
}
