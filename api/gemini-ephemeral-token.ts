import { GoogleGenAI } from '@google/genai';

interface RequestLike {
  method?: string;
}

interface ResponseLike {
  status: (code: number) => ResponseLike;
  json: (body: unknown) => void;
  setHeader?: (name: string, value: string) => void;
}

export default async function handler(req: RequestLike, res: ResponseLike) {
  res.setHeader?.('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

    if (!apiKey) {
      console.error('[gemini-live] Missing GEMINI_API_KEY/GOOGLE_API_KEY');
      return res.status(500).json({ error: 'Gemini server configuration is missing.' });
    }

    const ai = new GoogleGenAI({ apiKey });

    const authToken = await ai.authTokens.create({
      config: {
        httpOptions: { apiVersion: 'v1alpha' },
        uses: 1,
      },
    });

    if (!authToken.name) {
      console.error('[gemini-live] Gemini returned an empty auth token');
      return res.status(502).json({ error: 'Could not create Gemini Live token.' });
    }

    return res.status(200).json({
      token: authToken.name,
      expireTime: authToken.expireTime ?? null,
      newSessionExpireTime: authToken.newSessionExpireTime ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[gemini-live] Token creation failed:', message);
    return res.status(500).json({ error: 'Could not create Gemini Live token.' });
  }
}
