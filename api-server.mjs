// api-server.mjs
import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.API_PORT || 4000;

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const GOOGLE_CX = process.env.GOOGLE_CX;

if (!GOOGLE_API_KEY || !GOOGLE_CX) {
  console.error('❌ Falta GOOGLE_API_KEY o GOOGLE_CX en el .env');
  process.exit(1);
}

app.get('/api/image-search', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q : '';
  const n = Number(req.query.n || 3);

  if (!q) {
    return res.status(400).json({
      error: 'Falta el parámetro q',
      results: [],
    });
  }

  try {
    const url = new URL('https://www.googleapis.com/customsearch/v1');
    url.searchParams.set('key', GOOGLE_API_KEY);
    url.searchParams.set('cx', GOOGLE_CX);
    url.searchParams.set('searchType', 'image');
    url.searchParams.set('q', q);
    url.searchParams.set('num', String(n));

    const googleRes = await fetch(url);
    const googleText = await googleRes.text();

    let googleJson;
    try {
      googleJson = JSON.parse(googleText);
    } catch (err) {
      console.error('❌ Google devolvió algo no parseable:', googleText.slice(0, 400));
      return res.status(500).json({ error: 'Respuesta inválida de Google', results: [] });
    }

    if (googleJson.error) {
      console.error('❌ Error de Google:', googleJson.error);
      return res.status(500).json({ error: 'Error desde Google', results: [] });
    }

    const items = (googleJson.items || []).map(item => ({
      url: item.link,
      title: item.title,
    }));

    return res.json({ results: items });
  } catch (err) {
    console.error('❌ Error buscando imágenes:', err);
    return res.status(500).json({ error: 'Error interno', results: [] });
  }
});

app.listen(PORT, () => {
  console.log(`✅ API de imágenes escuchando en http://localhost:${PORT}`);
});
