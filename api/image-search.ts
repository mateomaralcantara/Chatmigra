// api/image-search.ts

// Tipos mínimos para no depender de @vercel/node
interface VercelRequest {
    query: Record<string, string | string[] | undefined>;
  }
  
  interface VercelResponse {
    status: (code: number) => { json: (body: unknown) => void };
  }
  
  const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY!;
  const GOOGLE_CX = process.env.GOOGLE_CX!; // ID del Custom Search Engine
  
  export default async function handler(req: VercelRequest, res: VercelResponse) {
    try {
      const qParam = req.query.q;
      const nParam = req.query.n;
  
      const q = typeof qParam === 'string' ? qParam : Array.isArray(qParam) ? qParam[0] ?? '' : '';
      const nRaw =
        typeof nParam === 'string' ? nParam : Array.isArray(nParam) ? nParam[0] ?? '3' : '3';
  
      const n = Number.isNaN(Number(nRaw)) ? 3 : Number(nRaw);
  
      if (!q) {
        return res.status(400).json({ error: 'Missing query' });
      }
  
      if (!GOOGLE_API_KEY || !GOOGLE_CX) {
        return res
          .status(500)
          .json({ error: 'Missing GOOGLE_API_KEY or GOOGLE_CX in environment variables' });
      }
  
      const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${GOOGLE_CX}&searchType=image&num=${n}&q=${encodeURIComponent(
        q
      )}`;
  
      const r = await fetch(url);
  
      if (!r.ok) {
        console.error('[image-search] Google API error status:', r.status, await r.text());
        return res.status(500).json({ error: 'Google API error' });
      }
  
      const data = await r.json();
  
      const results =
        (data.items || []).map((item: any) => ({
          url: item.link,
          title: item.title,
        })) ?? [];
  
      return res.status(200).json({ results });
    } catch (e) {
      console.error('[image-search] Internal error:', e);
      return res.status(500).json({ error: 'Internal error' });
    }
  }
  