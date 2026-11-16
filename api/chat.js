// Chat de la pareja: mensajes, memes/GIFs, notas de voz, estados rápidos, planes y actividades.
//  GET  /api/chat?since=<ms>        -> mensajes nuevos o cambiados desde esa fecha (+ hasta dónde leyó cada quien)
//  GET  /api/chat?img=<id>          -> la imagen o nota de voz de un mensaje
//  POST /api/chat {msg, image?, audio?} -> envía un mensaje (y avisa al otro por push)
//  POST /api/chat {del: id}         -> borra un mensaje
//  POST /api/chat {react:{id, by, emoji}} -> reacción (emoji vacío la quita)
//  POST /api/chat {read:{by, at}}   -> "visto": hasta qué mensaje leyó esa persona
const { K, redis, guard, body, allSubs, sendTo } = require('./_lib');

const MAX_TEXT = 2000;
const MAX_IMG = 4 * 1024 * 1024; // dataURL (ya en base64)
const MAX_AUDIO = 4 * 1024 * 1024;
const ID_RE = /^[A-Za-z0-9-]{6,64}$/;
const GIPHY = /^https:\/\/(media\d*|i)\.giphy\.com\/[^\s"'<>]{4,300}$/;
const READS = 'agenda-pareja:chat:reads';
const REACTIONS = ['❤️', '😂', '😮', '😢', '👍', '🙏', '🔥', '😍'];
const who = v => (['a', 'b'].includes(v) ? v : '');
const str = (v, n) => String(v || '').slice(0, n);

function clean(m) {
  const out = { id: m.id, author: who(m.author), text: str(m.text, MAX_TEXT) };
  if (m.media && typeof m.media === 'object') {
    // GIF o sticker: uno propio (guardado en /api/media) o de GIPHY
    const md = m.media, kind = md.kind === 'sticker' ? 'sticker' : 'gif';
    const w = Math.min(4000, Number(md.w) || 0), h = Math.min(4000, Number(md.h) || 0);
    if (md.src === 'own' && ID_RE.test(md.id || '')) out.media = { kind, src: 'own', id: md.id, w, h };
    else if (GIPHY.test(md.url || '')) out.media = { kind, src: 'giphy', url: md.url, w, h };
  }
  if (m.reply && typeof m.reply === 'object' && ID_RE.test(m.reply.id || '')) {
    // Respuesta a otro mensaje: guardamos un resumen para mostrar la cita
    const r = m.reply, th = String(r.thumb || '');
    out.reply = {
      id: r.id, author: who(r.author),
      kind: ['text', 'gif', 'sticker', 'img', 'act', 'audio', 'plan', 'status'].includes(r.kind) ? r.kind : 'text',
      text: str(r.text, 140),
      thumb: /^(own|img):[A-Za-z0-9-]{6,64}$/.test(th) || GIPHY.test(th) ? th : '',
    };
  }
  if (m.act && typeof m.act === 'object') {
    const a = m.act;
    out.act = {
      coll: a.coll === 'events' ? 'events' : 'blocks', id: str(a.id, 80),
      date: /^\d{4}-\d{2}-\d{2}$/.test(a.date) ? a.date : '',
      title: str(a.title, 120), time: str(a.time, 40), who: str(a.who, 40), kind: str(a.kind, 20), label: str(a.label, 40),
    };
  }
  // Estado rápido ("Llego en 20 min")
  if (m.status && typeof m.status === 'object') out.status = { key: str(m.status.key, 20), emoji: str(m.status.emoji, 8), label: str(m.status.label, 60) };
  // Tarjeta de plan propuesto: el estado del plan vive en la agenda compartida
  if (m.plan && typeof m.plan === 'object' && ID_RE.test(m.plan.id || '')) {
    out.plan = { id: m.plan.id, title: str(m.plan.title, 120), date: /^\d{4}-\d{2}-\d{2}$/.test(m.plan.date) ? m.plan.date : '', time: str(m.plan.time, 40) };
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

async function names() {
  const st = JSON.parse((await redis(['GET', K.state])) || '{}');
  const n = st.settings || {};
  return { a: n.nameA || 'Él', b: n.nameB || 'Ella' };
}

async function push(author, endpoint, title, text, tag = 'chat') {
  try {
    const subs = (await allSubs()).filter(s => s.chat !== false &&
      s.sub && s.sub.endpoint !== endpoint && (!author || s.who !== author));
    if (!subs.length) return;
    await sendTo(subs, { title, body: (text || '').slice(0, 140), tag, kind: 'chat', url: '/?view=chat' });
  } catch (e) {}
}

async function notifyOthers(msg, endpoint) {
  const n = await names().catch(() => ({ a: 'Él', b: 'Ella' }));
  const from = msg.author ? n[msg.author] : 'Nuevo mensaje';
  let txt = msg.text;
  if (msg.act) txt = `📅 ${msg.act.title}${msg.act.time ? ' · ' + msg.act.time : ''}${txt ? ' — ' + txt : ''}`;
  if (msg.img) txt = '📷 ' + (txt || 'Te mandó una imagen');
  if (msg.media) txt = msg.media.kind === 'sticker' ? '💟 Sticker' : '🎞️ GIF';
  if (msg.audio) txt = `🎤 Nota de voz (${Math.round(msg.audio.dur || 0)} s)`;
  if (msg.status) txt = `${msg.status.emoji} ${msg.status.label}`;
  if (msg.plan) txt = `💌 Te propone: ${msg.plan.title}${msg.plan.time ? ' · ' + msg.plan.time : ''}`;
  await push(msg.author, endpoint, from, txt);
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
        const m = /^data:((?:image|audio)\/[a-z0-9.+-]+)(?:;[^;,]*)*;base64,(.*)$/i.exec(data);
        if (!m) return res.status(404).end();
        res.setHeader('Content-Type', m[1]);
        res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
        return res.status(200).send(Buffer.from(m[2], 'base64'));
      }
      const ts = Number(q.since) || 0;
      const [messages, rawReads] = await Promise.all([ts ? since(ts) : latest(200), redis(['HGETALL', READS])]);
      const reads = {};
      for (let i = 0; i < (rawReads || []).length; i += 2) reads[rawReads[i]] = Number(rawReads[i + 1]) || 0;
      return res.status(200).json({ messages, reads, now: Date.now() });
    }

    if (req.method === 'POST') {
      const b = body(req);
      const t = Date.now();

      if (b.read) {
        const by = who(b.read.by), at = Math.min(Number(b.read.at) || 0, t);
        if (!by) return res.status(400).json({ error: 'by' });
        const cur = Number(await redis(['HGET', READS, by])) || 0;
        if (at > cur) await redis(['HSET', READS, by, String(at)]);
        return res.status(200).json({ ok: true });
      }

      if (b.react) {
        const { id } = b.react, by = who(b.react.by), emoji = String(b.react.emoji || '');
        if (!ID_RE.test(id || '') || !by || (emoji && !REACTIONS.includes(emoji))) return res.status(400).json({ error: 'react' });
        const raw = await redis(['HGET', K.msgs, id]);
        if (!raw) return res.status(404).json({ error: 'nf' });
        const msg = JSON.parse(raw);
        if (msg.deleted) return res.status(400).json({ error: 'deleted' });
        msg.reactions = { ...(msg.reactions || {}) };
        if (emoji) msg.reactions[by] = emoji; else delete msg.reactions[by];
        msg.upd = t;
        await redis(['HSET', K.msgs, id, JSON.stringify(msg)]);
        await redis(['ZADD', K.idx, String(t), id]);
        // Avisar al autor del mensaje, como WhatsApp
        if (emoji && msg.author && msg.author !== by) {
          const n = await names().catch(() => ({ a: 'Él', b: 'Ella' }));
          const what = msg.text ? `“${msg.text.slice(0, 60)}”` : msg.media ? (msg.media.kind === 'sticker' ? 'tu sticker' : 'tu GIF') : msg.audio ? 'tu nota de voz' : 'tu mensaje';
          await push(by, b.endpoint, n[by], `Reaccionó ${emoji} a ${what}`, 'react');
        }
        return res.status(200).json({ message: msg });
      }

      if (b.del) {
        if (!ID_RE.test(b.del)) return res.status(400).json({ error: 'id' });
        const raw = await redis(['HGET', K.msgs, b.del]);
        if (!raw) return res.status(404).json({ error: 'nf' });
        const old = JSON.parse(raw);
        const gone = { id: old.id, author: old.author, at: old.at, upd: t, deleted: true };
        await redis(['HSET', K.msgs, old.id, JSON.stringify(gone)]);
        await redis(['ZADD', K.idx, String(t), old.id]);
        if (old.img || old.audio) await redis(['DEL', K.img(old.id)]);
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
      if (b.audio && typeof b.audio.data === 'string') {
        if (b.audio.data.length > MAX_AUDIO || !/^data:audio\/[a-z0-9.+-]+(;[^;,]*)*;base64,/i.test(b.audio.data)) {
          return res.status(413).json({ error: 'audio' });
        }
        await redis(['SET', K.img(msg.id), b.audio.data]);
        msg.audio = { id: msg.id, dur: Math.min(600, Math.max(0, Number(b.audio.dur) || 0)) };
      }
      if (!msg.text && !msg.img && !msg.act && !msg.media && !msg.audio && !msg.status && !msg.plan) return res.status(400).json({ error: 'empty' });
      msg.at = t; msg.upd = t;
      await redis(['HSET', K.msgs, msg.id, JSON.stringify(msg)]);
      await redis(['ZADD', K.idx, String(t), msg.id]);
      // Quien escribe ya leyó todo lo anterior
      if (msg.author) await redis(['HSET', READS, msg.author, String(t)]);
      await notifyOthers(msg, b.endpoint);
      return res.status(200).json({ message: msg });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method' });
  } catch (e) {
    return res.status(500).json({ error: 'server' });
  }
};
