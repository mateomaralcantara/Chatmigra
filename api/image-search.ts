import { authenticateRequest } from '../lib/serverAuth';

interface VercelRequest {
  method?: string;
  query: Record<string, string | string[] | undefined>;
  headers?: Record<string, string | string[] | undefined>;
}

interface VercelResponse {
  status: (code: number) => VercelResponse;
  json: (body: unknown) => void;
  setHeader?: (name: string, value: string) => void;
}

interface GoogleImageItem {
  link?: string;
  title?: string;
}

interface GoogleImageResponse {
  items?: GoogleImageItem[];
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  res.setHeader?.('Cache-Control', 'private, max-age=300');

  if (req.method && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const auth = await authenticateRequest(req);

    if (!auth) {
      return res.status(401).json({ error: 'Sesión inválida o expirada.' });
    }

    const googleApiKey = process.env.GOOGLE_API_KEY;
    const googleCx = process.env.GOOGLE_CX;

    if (!googleApiKey || !googleCx) {
      console.error('[image-search] Missing GOOGLE_API_KEY/GOOGLE_CX');
      return res.status(500).json({
        error: 'Image search server configuration is missing.',
      });
    }

    const qParam = req.query.q;
    const nParam = req.query.n;

    const q =
      typeof qParam === 'string'
        ? qParam.trim()
        : Array.isArray(qParam)
          ? (qParam[0] ?? '').trim()
          : '';

    const requested =
      typeof nParam === 'string'
        ? Number(nParam)
        : Array.isArray(nParam)
          ? Number(nParam[0])
          : 3;

    const n = Number.isFinite(requested)
      ? Math.max(1, Math.min(5, Math.floor(requested)))
      : 3;

    if (!q) {
      return res.status(400).json({ error: 'Missing query' });
    }

    const url = new URL('https://www.googleapis.com/customsearch/v1');
    url.searchParams.set('key', googleApiKey);
    url.searchParams.set('cx', googleCx);
    url.searchParams.set('searchType', 'image');
    url.searchParams.set('num', String(n));
    url.searchParams.set('q', q);

    const googleResponse = await fetch(url);

    if (!googleResponse.ok) {
      console.error('[image-search] Google API status:', googleResponse.status);
      return res.status(502).json({ error: 'Image provider error' });
    }

    const data = await googleResponse.json() as GoogleImageResponse;
    const results = (data.items ?? [])
      .filter((item): item is Required<Pick<GoogleImageItem, 'link'>> & GoogleImageItem =>
        typeof item.link === 'string' && item.link.length > 0,
      )
      .map((item) => ({
        url: item.link,
        title: item.title ?? '',
      }));

    return res.status(200).json({ results });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[image-search] Internal error:', message);
    return res.status(500).json({ error: 'Internal error' });
  }
}
