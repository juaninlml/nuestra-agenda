// Función de Vercel: guarda y comparte la agenda entre los dos dispositivos.
// Usa Upstash Redis (Vercel → Storage). No necesita dependencias.

const KEY = 'agenda-pareja:v1';
const DAY = 864e5;
// Registros que solo sirven un tiempo (para que la base no crezca sin fin)
const KEEP = { catlog: 90 * DAY, moods: 120 * DAY };

function mergeColl(a = [], b = [], keep) {
  const m = new Map();
  for (const x of a) if (x && x.id) m.set(x.id, x);
  for (const y of b) {
    if (!y || !y.id) continue;
    const x = m.get(y.id);
    if (!x || (y.updatedAt || 0) > (x.updatedAt || 0)) m.set(y.id, y);
  }
  let out = [...m.values()];
  if (keep) { const min = Date.now() - keep; out = out.filter(x => (x.updatedAt || 0) >= min); }
  return out;
}

// Une cualquier colección (blocks, events, notes, checks, plans, moods, cats, catlog, catcare, ideas…)
function merge(s1, s2) {
  s1 = s1 || {}; s2 = s2 || {};
  const a = s1.settings || {}, b = s2.settings || {};
  const out = { v: 1, settings: (b.updatedAt || 0) > (a.updatedAt || 0) ? b : a };
  const keys = new Set([...Object.keys(s1), ...Object.keys(s2)].filter(k => Array.isArray(s1[k]) || Array.isArray(s2[k])));
  for (const k of ['blocks', 'events', 'notes', 'checks']) keys.add(k);
  for (const k of keys) {
    if (!/^[a-z]{2,20}$/.test(k)) continue;
    out[k] = mergeColl(Array.isArray(s1[k]) ? s1[k] : [], Array.isArray(s2[k]) ? s2[k] : [], KEEP[k]);
  }
  return out;
}

async function redis(cmd) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  if (!r.ok) throw new Error('redis ' + r.status);
  return (await r.json()).result;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  if (!(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL)) {
    return res.status(501).json({ error: 'no-db' });
  }
  const pin = process.env.APP_PIN;
  if (pin && req.headers['x-pin'] !== pin) {
    return res.status(401).json({ error: 'pin' });
  }

  try {
    const raw = await redis(['GET', KEY]);
    const current = raw ? JSON.parse(raw) : null;

    if (req.method === 'GET') {
      return res.status(200).json({ state: current });
    }
    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') body = JSON.parse(body || '{}');
      const merged = merge(current, body && body.state);
      await redis(['SET', KEY, JSON.stringify(merged)]);
      return res.status(200).json({ state: merged });
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method' });
  } catch (e) {
    return res.status(500).json({ error: 'server' });
  }
};

module.exports.merge = merge;
