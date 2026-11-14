// Función de Vercel: guarda y comparte la agenda entre los dos dispositivos.
// Usa Upstash Redis (Vercel → Storage). No necesita dependencias.

const KEY = 'agenda-pareja:v1';

function mergeColl(a = [], b = []) {
  const m = new Map();
  for (const x of a) if (x && x.id) m.set(x.id, x);
  for (const y of b) {
    if (!y || !y.id) continue;
    const x = m.get(y.id);
    if (!x || (y.updatedAt || 0) > (x.updatedAt || 0)) m.set(y.id, y);
  }
  return [...m.values()];
}

function merge(s1, s2) {
  s1 = s1 || {}; s2 = s2 || {};
  const a = s1.settings || {}, b = s2.settings || {};
  return {
    v: 1,
    settings: (b.updatedAt || 0) > (a.updatedAt || 0) ? b : a,
    blocks: mergeColl(s1.blocks, s2.blocks),
    events: mergeColl(s1.events, s2.events),
    notes: mergeColl(s1.notes, s2.notes),
    checks: mergeColl(s1.checks, s2.checks),
  };
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
