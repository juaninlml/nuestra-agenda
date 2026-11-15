// Registro de notificaciones push de cada teléfono.
//  GET  /api/push                         -> llave pública para suscribirse
//  POST /api/push {sub, who, tz, acts, chat} -> guarda/actualiza la suscripción
//  POST /api/push {remove: endpoint}      -> la borra
//  POST /api/push {test: endpoint}        -> manda una notificación de prueba
const { K, redis, guard, body, hash, getPush, sendTo } = require('./_lib');

module.exports = async (req, res) => {
  if (!guard(req, res)) return;
  try {
    if (req.method === 'GET') {
      const { publicKey } = await getPush();
      return res.status(200).json({ publicKey });
    }
    if (req.method === 'POST') {
      const b = body(req);
      if (b.remove) {
        await redis(['HDEL', K.subs, hash(b.remove)]);
        return res.status(200).json({ ok: true });
      }
      if (b.test) {
        const raw = await redis(['HGET', K.subs, hash(b.test)]);
        if (!raw) return res.status(404).json({ error: 'nf' });
        const n = await sendTo([{ key: hash(b.test), ...JSON.parse(raw) }],
          { title: 'Nuestra agenda', body: '¡Listo! Así se verán los avisos.', tag: 'test', url: '/' });
        return res.status(200).json({ ok: n > 0 });
      }
      const sub = b.sub;
      if (!sub || typeof sub.endpoint !== 'string' || !sub.keys) return res.status(400).json({ error: 'sub' });
      let tz = String(b.tz || 'UTC');
      try { new Intl.DateTimeFormat('en', { timeZone: tz }); } catch (e) { tz = 'UTC'; }
      const rec = {
        sub: { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } },
        who: ['a', 'b'].includes(b.who) ? b.who : '',
        tz,
        acts: b.acts !== false,
        chat: b.chat !== false,
        updatedAt: Date.now(),
      };
      await redis(['HSET', K.subs, hash(sub.endpoint), JSON.stringify(rec)]);
      return res.status(200).json({ ok: true });
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method' });
  } catch (e) {
    return res.status(500).json({ error: 'server' });
  }
};
