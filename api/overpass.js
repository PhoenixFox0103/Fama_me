module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  res.setHeader('Cache-Control', 's-maxage=180, stale-while-revalidate=900');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method === 'GET') return res.status(405).json({ error: 'Méthode non autorisée' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  let body = req.body || {};
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const query = typeof body.query === 'string' ? body.query.trim() : '';
  if (!query || query.length > 12000) return res.status(400).json({ error: 'Requête cartographique invalide' });

  const endpoints = [
    'https://overpass.private.coffee/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    'https://overpass-api.de/api/interpreter'
  ];

  async function run(endpoint) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'Accept': 'application/json',
          'User-Agent': 'Signal-TN/1.0 (fama-me.vercel.app)'
        },
        body: 'data=' + encodeURIComponent(query),
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`${endpoint}: HTTP ${response.status}`);
      const text = await response.text();
      let data;
      try { data = JSON.parse(text); } catch { throw new Error(`${endpoint}: réponse non JSON`); }
      if (!Array.isArray(data.elements)) throw new Error(`${endpoint}: réponse invalide`);
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  try {
    const data = await Promise.any(endpoints.map(run));
    return res.status(200).json(data);
  } catch (error) {
    const details = Array.isArray(error?.errors)
      ? error.errors.map(e => e?.message || String(e)).join(' | ')
      : (error?.message || 'Serveurs indisponibles');
    return res.status(502).json({ error: 'La recherche des établissements est momentanément indisponible', detail: details });
  }
};
