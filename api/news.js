const decodeXml = (value='') => value
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const textTag = (xml, tag) => decodeXml((xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))||[])[1]||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=3600');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({error:'Méthode non autorisée'});
  const q = String(req.query.q || 'Tunisie').trim().slice(0, 80);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const gdelt = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(q + ' sourcecountry:Tunisia')}&mode=ArtList&maxrecords=30&format=json&sort=HybridRel`;
    const response = await fetch(gdelt, {signal: controller.signal, headers:{'User-Agent':'Famma-Me/1.0'}});
    if (!response.ok) throw new Error(`GDELT ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data.articles) || !data.articles.length) throw new Error('GDELT vide');
    return res.status(200).json({source:'GDELT', articles:data.articles});
  } catch (firstError) {
    try {
      const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(q + ' Tunisie')}&hl=fr&gl=TN&ceid=TN:fr`;
      const response = await fetch(rssUrl, {headers:{'User-Agent':'Famma-Me/1.0'}});
      if (!response.ok) throw new Error(`RSS ${response.status}`);
      const xml = await response.text();
      const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0,30).map(match => {
        const item=match[1], source=textTag(item,'source');
        return {title:textTag(item,'title'), url:textTag(item,'link'), domain:source||'Google News', seendate:textTag(item,'pubDate'), language:'French', sourcecountry:'Tunisia'};
      }).filter(item=>item.title && item.url);
      if (!items.length) throw new Error('RSS vide');
      return res.status(200).json({source:'Google News RSS', articles:items});
    } catch (secondError) {
      return res.status(502).json({error:'Les sources d’actualités sont temporairement indisponibles.', detail:`${firstError.message}; ${secondError.message}`});
    }
  } finally { clearTimeout(timer); }
};
