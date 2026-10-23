interface ApiRequest {
  method?: string;
}

interface ApiResponse {
  status(code: number): ApiResponse;
  json(body: unknown): void;
  setHeader?(name: string, value: string): void;
}

const LIVE_MODEL = process.env.GEMINI_LIVE_MODEL || 'gemini-3.8-live';

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
    let data: any;

    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = { raw };
    }

    if (!response.ok || typeof data?.name !== 'string') {
      console.error('[gemini-live] Token creation failed', response.status, data);
      return res.status(response.ok ? 502 : response.status).json({
        error: data?.error?.message || 'Unable to create Gemini ephemeral token',
        code: data?.error?.status || 'GEMINI_LIVE_TOKEN_ERROR',
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
      error: error instanceof Error ? error.message : 'Internal error',
      code: 'GEMINI_LIVE_INTERNAL_ERROR',
    });
  }
}
