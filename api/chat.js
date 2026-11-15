// Chat de la pareja: mensajes, memes/GIFs subidos, links y actividades compartidas.
//  GET  /api/chat?since=<ms>      -> mensajes nuevos o cambiados desde esa fecha
//  GET  /api/chat?img=<id>        -> la imagen de un mensaje
//  POST /api/chat {msg, image?}   -> envía un mensaje (y avisa al otro por push)
//  POST /api/chat {del: id}       -> borra un mensaje
const { K, redis, guard, body, allSubs, sendTo } = require('./_lib');

const MAX_TEXT = 2000;
const MAX_IMG = 4 * 1024 * 1024; // dataURL (ya en base64)
const ID_RE = /^[A-Za-z0-9-]{6,64}$/;

function clean(m) {
  const out = {
    id: m.id,
    author: ['a', 'b'].includes(m.author) ? m.author : '',
    text: String(m.text || '').slice(0, MAX_TEXT),
  };
  if (m.act && typeof m.act === 'object') {
    const a = m.act;
    out.act = {
      coll: a.coll === 'events' ? 'events' : 'blocks',
      id: String(a.id || '').slice(0, 80),
      date: /^\d{4}-\d{2}-\d{2}$/.test(a.date) ? a.date : '',
      title: String(a.title || '').slice(0, 120),
      time: String(a.time || '').slice(0, 40),
      who: String(a.who || '').slice(0, 40),
      kind: String(a.kind || '').slice(0, 20),
      label: String(a.label || '').slice(0, 40),
    };
  }
  return out;
}

async function since(ts) {
  const ids = await redis(['ZRANGEBYSCORE', K.idx, String(ts), '+inf', 'LIMIT', '0', '300']);
  if (!ids || !ids.length) return [];
  const raw = await redis(['HMGET', K.msgs, ...ids]);
  return raw.filter(Boolean).map(r => JSON.parse(r));
}

async function latest(n) {
  const ids = await redis(['ZREVRANGE', K.idx, '0', String(n - 1)]);
  if (!ids || !ids.length) return [];
  const raw = await redis(['HMGET', K.msgs, ...ids.reverse()]);
  return raw.filter(Boolean).map(r => JSON.parse(r));
}

async function notifyOthers(msg, endpoint) {
  try {
    const subs = (await allSubs()).filter(s => s.chat !== false &&
      s.sub && s.sub.endpoint !== endpoint && (!msg.author || s.who !== msg.author));
    const st = JSON.parse((await redis(['GET', K.state])) || '{}');
    const names = st.settings || {};
    const from = msg.author === 'a' ? (names.nameA || 'Él') : msg.author === 'b' ? (names.nameB || 'Ella') : 'Nuevo mensaje';
    let txt = msg.text;
    if (msg.act) txt = `📅 ${msg.act.title}${msg.act.time ? ' · ' + msg.act.time : ''}${txt ? ' — ' + txt : ''}`;
    if (msg.img) txt = '📷 ' + (txt || 'Te mandó una imagen');
    await sendTo(subs, { title: from, body: (txt || '').slice(0, 140), tag: 'chat', url: '/?view=chat' });
  } catch (e) {}
}

module.exports = async (req, res) => {
  if (!guard(req, res)) return;
  try {
    if (req.method === 'GET') {
      const q = req.query || {};
      if (q.img) {
        if (!ID_RE.test(q.img)) return res.status(400).end();
        const data = await redis(['GET', K.img(q.img)]);
        if (!data) return res.status(404).end();
        const m = /^data:(image\/[a-z0-9.+-]+);base64,(.*)$/i.exec(data);
        if (!m) return res.status(404).end();
        res.setHeader('Content-Type', m[1]);
        res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
        return res.status(200).send(Buffer.from(m[2], 'base64'));
      }
      const ts = Number(q.since) || 0;
      const messages = ts ? await since(ts) : await latest(200);
      return res.status(200).json({ messages, now: Date.now() });
    }

    if (req.method === 'POST') {
      const b = body(req);
      const t = Date.now();

      if (b.del) {
        if (!ID_RE.test(b.del)) return res.status(400).json({ error: 'id' });
        const raw = await redis(['HGET', K.msgs, b.del]);
        if (!raw) return res.status(404).json({ error: 'nf' });
        const old = JSON.parse(raw);
        const gone = { id: old.id, author: old.author, at: old.at, upd: t, deleted: true };
        await redis(['HSET', K.msgs, old.id, JSON.stringify(gone)]);
        await redis(['ZADD', K.idx, String(t), old.id]);
        if (old.img) await redis(['DEL', K.img(old.img)]);
        return res.status(200).json({ message: gone });
      }

      const m = b.msg || {};
      if (!ID_RE.test(m.id || '')) return res.status(400).json({ error: 'id' });
      const exists = await redis(['HGET', K.msgs, m.id]);
      if (exists) return res.status(200).json({ message: JSON.parse(exists) }); // reintento: ya estaba

      const msg = clean(m);
      if (b.image && typeof b.image.data === 'string') {
        if (b.image.data.length > MAX_IMG || !/^data:image\//.test(b.image.data)) {
          return res.status(413).json({ error: 'img' });
        }
        await redis(['SET', K.img(msg.id), b.image.data]);
        msg.img = msg.id;
        msg.w = Number(b.image.w) || 0;
        msg.h = Number(b.image.h) || 0;
      }
      if (!msg.text && !msg.img && !msg.act) return res.status(400).json({ error: 'empty' });
      msg.at = t; msg.upd = t;
      await redis(['HSET', K.msgs, msg.id, JSON.stringify(msg)]);
      await redis(['ZADD', K.idx, String(t), msg.id]);
      await notifyOthers(msg, b.endpoint);
      return res.status(200).json({ message: msg });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method' });
  } catch (e) {
    return res.status(500).json({ error: 'server' });
  }
};
