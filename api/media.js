// GIFs y stickers del chat.
//  GET  /api/media?q=texto&type=gifs|stickers&offset=0 -> busca en GIPHY (sin texto: tendencias)
//  GET  /api/media                                     -> stickers y GIFs guardados por ustedes
//  GET  /api/media?img=<id>                            -> imagen de un sticker creado por ustedes
//  POST /api/media {sticker:{data,w,h}}                -> crea un sticker propio
//  POST /api/media {save:{type:'gif'|'sticker', url, preview, w, h}} -> guarda un GIF o sticker de GIPHY
//  POST /api/media {remove:id}                         -> lo quita de los guardados
const { redis, guard, body } = require('./_lib');

const SAVED = 'agenda-pareja:media:saved';            // hash id -> {id,type,src,url?,preview?,w,h,at,by}
const IMG = id => 'agenda-pareja:media:img:' + id;
const ID_RE = /^[A-Za-z0-9-]{6,64}$/;
const GIPHY_URL = /^https:\/\/(media\d*|i)\.giphy\.com\/[^\s"'<>]{4,300}$/;
const MAX_STICKER = 1.5 * 1024 * 1024;

const id = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
const num = v => Math.max(0, Math.min(4000, Number(v) || 0));

async function search(q, type, offset) {
  const key = process.env.GIPHY_API_KEY;
  if (!key) return { enabled: false, items: [] };
  const kind = type === 'stickers' ? 'stickers' : 'gifs';
  const base = process.env.GIPHY_BASE || 'https://api.giphy.com';
  const p = new URLSearchParams({ api_key: key, limit: '24', offset: String(Number(offset) || 0), rating: 'pg-13' });
  if (q) { p.set('q', q.slice(0, 50)); p.set('lang', 'es'); }
  const r = await fetch(`${base}/v1/${kind}/${q ? 'search' : 'trending'}?${p}`);
  if (!r.ok) return { enabled: true, items: [], error: 'giphy' };
  const d = await r.json();
  const items = (d.data || []).map(g => {
    const im = g.images || {}, send = im.downsized || im.fixed_width || {}, prev = im.fixed_width || send;
    return {
      id: g.id,
      url: send.url, w: Number(send.width) || 0, h: Number(send.height) || 0,
      preview: prev.webp || prev.url,
    };
  }).filter(x => x.url && GIPHY_URL.test(x.url));
  return { enabled: true, items, next: (d.pagination && d.pagination.offset + d.pagination.count) || 0 };
}

async function listSaved() {
  const flat = (await redis(['HGETALL', SAVED])) || [];
  const out = [];
  for (let i = 0; i < flat.length; i += 2) { try { out.push(JSON.parse(flat[i + 1])); } catch (e) {} }
  return out.sort((a, b) => (b.at || 0) - (a.at || 0));
}

module.exports = async (req, res) => {
  if (!guard(req, res)) return;
  try {
    const q = req.query || {};
    if (req.method === 'GET') {
      if (q.img) {
        if (!ID_RE.test(q.img)) return res.status(400).end();
        const data = await redis(['GET', IMG(q.img)]);
        const m = data && /^data:(image\/[a-z0-9.+-]+);base64,(.*)$/i.exec(data);
        if (!m) return res.status(404).end();
        res.setHeader('Content-Type', m[1]);
        res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
        return res.status(200).send(Buffer.from(m[2], 'base64'));
      }
      if (q.q !== undefined || q.type) {
        res.setHeader('Cache-Control', 'private, max-age=300');
        return res.status(200).json(await search(String(q.q || '').trim(), q.type, q.offset));
      }
      return res.status(200).json({ saved: await listSaved(), gifSearch: !!process.env.GIPHY_API_KEY });
    }

    if (req.method === 'POST') {
      const b = body(req), t = Date.now(), by = ['a', 'b'].includes(b.by) ? b.by : '';
      if (b.remove) {
        if (!ID_RE.test(b.remove)) return res.status(400).json({ error: 'id' });
        await redis(['HDEL', SAVED, b.remove]);
        // La imagen se conserva: puede seguir apareciendo en mensajes viejos del chat.
        return res.status(200).json({ ok: true });
      }
      if (b.avatar) {
        // Foto de perfil: se guarda la imagen; el id se anota en los ajustes compartidos.
        const a = b.avatar;
        if (typeof a.data !== 'string' || !/^data:image\/(png|webp|jpeg);base64,/.test(a.data) || a.data.length > 600 * 1024) {
          return res.status(413).json({ error: 'img' });
        }
        const aid = 'av-' + id();
        await redis(['SET', IMG(aid), a.data]);
        return res.status(200).json({ id: aid });
      }
      if (b.sticker) {
        const s = b.sticker;
        if (typeof s.data !== 'string' || !/^data:image\/(png|webp|gif|jpeg);base64,/.test(s.data) || s.data.length > MAX_STICKER) {
          return res.status(413).json({ error: 'img' });
        }
        const item = { id: id(), type: 'sticker', src: 'own', w: num(s.w), h: num(s.h), at: t, by };
        await redis(['SET', IMG(item.id), s.data]);
        await redis(['HSET', SAVED, item.id, JSON.stringify(item)]);
        return res.status(200).json({ item });
      }
      if (b.save) {
        const s = b.save;
        if (!GIPHY_URL.test(s.url || '')) return res.status(400).json({ error: 'url' });
        const item = {
          id: id(), type: s.type === 'sticker' ? 'sticker' : 'gif', src: 'giphy', url: s.url,
          preview: GIPHY_URL.test(s.preview || '') ? s.preview : s.url, w: num(s.w), h: num(s.h), at: t, by,
        };
        // No guardar dos veces lo mismo
        const dup = (await listSaved()).find(x => x.url === item.url);
        if (dup) return res.status(200).json({ item: dup });
        await redis(['HSET', SAVED, item.id, JSON.stringify(item)]);
        return res.status(200).json({ item });
      }
      return res.status(400).json({ error: 'body' });
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method' });
  } catch (e) {
    return res.status(500).json({ error: 'server' });
  }
};
