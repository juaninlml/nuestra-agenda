// Utilidades compartidas por las funciones de /api (Vercel ignora archivos que empiezan con "_").
const crypto = require('crypto');

const PREFIX = 'agenda-pareja:';
const K = {
  state: PREFIX + 'v1',
  msgs: PREFIX + 'chat:msgs',     // hash id -> mensaje (JSON)
  idx: PREFIX + 'chat:idx',       // zset id por fecha de última modificación
  img: id => PREFIX + 'chat:img:' + id,
  subs: PREFIX + 'push:subs',     // hash hash(endpoint) -> suscripción (JSON)
  vapid: PREFIX + 'push:vapid',
  sent: key => PREFIX + 'push:sent:' + key,
};

const hasDb = () => !!(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL);

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

// Responde con error si no hay base de datos o el PIN no coincide. Devuelve true si se puede seguir.
function guard(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!hasDb()) { res.status(501).json({ error: 'no-db' }); return false; }
  const pin = process.env.APP_PIN;
  if (pin && req.headers['x-pin'] !== pin) { res.status(401).json({ error: 'pin' }); return false; }
  return true;
}

function body(req) {
  let b = req.body;
  if (typeof b === 'string') b = JSON.parse(b || '{}');
  return b || {};
}

const hash = s => crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 32);

/* ---------- Web Push ---------- */
let webpush = null;
async function getPush() {
  if (!webpush) webpush = require('web-push');
  let keys = process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY
    ? { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY }
    : null;
  if (!keys) {
    const raw = await redis(['GET', K.vapid]);
    if (raw) keys = JSON.parse(raw);
    else {
      // Primera vez: se generan las llaves y se guardan, así no hay que configurar nada.
      const gen = webpush.generateVAPIDKeys();
      await redis(['SET', K.vapid, JSON.stringify(gen), 'NX']);
      keys = JSON.parse(await redis(['GET', K.vapid]));
    }
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:agenda@example.com', keys.publicKey, keys.privateKey);
  return { webpush, publicKey: keys.publicKey };
}

async function allSubs() {
  const flat = (await redis(['HGETALL', K.subs])) || [];
  const out = [];
  for (let i = 0; i < flat.length; i += 2) {
    try { out.push({ key: flat[i], ...JSON.parse(flat[i + 1]) }); } catch (e) {}
  }
  return out;
}

// Envía a cada suscripción; borra las que el navegador ya dio de baja.
async function sendTo(subs, payload) {
  if (!subs.length) return 0;
  const { webpush } = await getPush();
  let ok = 0;
  await Promise.all(subs.map(async s => {
    try {
      await webpush.sendNotification(s.sub, JSON.stringify(payload), { TTL: 600 });
      ok++;
    } catch (e) {
      if (e && (e.statusCode === 404 || e.statusCode === 410)) await redis(['HDEL', K.subs, s.key]);
    }
  }));
  return ok;
}

module.exports = { K, redis, guard, body, hash, hasDb, getPush, allSubs, sendTo };
