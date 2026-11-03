import { rejectIfRateLimited } from '../server/http';
import {
  requireAuthenticatedUser,
  type RequestLike,
} from '../server/supabase';

interface ApiRequest extends RequestLike {
  method?: string;
  query: Record<string, string | string[] | undefined>;
}

interface ApiResponse {
  status(code: number): ApiResponse;
  json(body: unknown): void;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await requireAuthenticatedUser(req);
  if (!auth) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (rejectIfRateLimited(res, auth.user.id, 'image-search')) return;

  const googleApiKey = (process.env.GOOGLE_API_KEY || '').trim();
  const googleCx = (process.env.GOOGLE_CX || '').trim();

  if (!googleApiKey || !googleCx) {
    return res.status(503).json({
      error: 'Image search is not configured',
      results: [],
    });
  }

  const qParam = req.query.q;
  const nParam = req.query.n;
  const q = typeof qParam === 'string' ? qParam : Array.isArray(qParam) ? qParam[0] ?? '' : '';
  const nRaw = typeof nParam === 'string' ? nParam : Array.isArray(nParam) ? nParam[0] ?? '1' : '1';
  const n = Math.min(5, Math.max(1, Number.isFinite(Number(nRaw)) ? Number(nRaw) : 1));

  if (!q.trim()) {
    return res.status(400).json({ error: 'Missing query', results: [] });
  }

  try {
    const url = new URL('https://www.googleapis.com/customsearch/v1');
    url.searchParams.set('key', googleApiKey);
    url.searchParams.set('cx', googleCx);
    url.searchParams.set('searchType', 'image');
    url.searchParams.set('q', q);
    url.searchParams.set('num', String(n));

    const response = await fetch(url);
    const data = (await response.json().catch(() => ({}))) as any;

    if (!response.ok) {
      console.error('[image-search] Google API error', response.status, data);
      return res.status(502).json({ error: 'Google image search failed', results: [] });
    }

    const results = Array.isArray(data?.items)
      ? data.items.map((item: any) => ({
          url: item.link,
          title: item.title,
        }))
      : [];

    return res.status(200).json({ results });
  } catch (error) {
    console.error('[image-search] Internal error:', error);
    return res.status(500).json({ error: 'Internal error', results: [] });
  }
}
