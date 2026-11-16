// Avisos 10 minutos antes de cada actividad, aunque la app esté cerrada.
// Hay que llamarla cada minuto con un cron externo (ver LEEME.md): GET /api/notify
// No necesita PIN: solo envía los avisos que tocan y responde cuántos mandó.
const { K, redis, hasDb, allSubs, sendTo } = require('./_lib');

const LEAD = 10; // minutos de anticipación
const pad = n => String(n).padStart(2, '0');

// Fecha y minuto actual en la zona horaria de cada teléfono.
function localNow(tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date()).map(x => [x.type, x.value]));
  return { key: `${p.year}-${p.month}-${p.day}`, min: Number(p.hour) * 60 + Number(p.minute) };
}
function nextKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  const x = new Date(Date.UTC(y, m - 1, d + 1));
  return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`;
}
// Misma regla que la app para saber qué actividades caen en una fecha.
function blocksOn(state, key) {
  const [y, m, d] = key.split('-').map(Number);
  const wd = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7, n = Math.ceil(d / 7);
  const done = new Set((state.checks || []).filter(c => c.done && !c.deleted).map(c => c.id));
  return (state.blocks || []).filter(b => {
    if (b.deleted || !b.start || done.has(`${b.id}|${key}`)) return false;
    if (b.freq === 'once') return b.date === key;
    if (b.day !== wd) return false;
    if (b.freq === '13') return n === 1 || n === 3;
    if (b.freq === '24') return n === 2 || n === 4;
    return true;
  });
}
function t12(t) {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`;
}

const once = async key => (await redis(['SET', K.sent(key), '1', 'NX', 'EX', String(8 * 86400)])) === 'OK';
const addDaysKey = (key, n) => { let k = key; for (let i = 0; i < n; i++) k = nextKey(k); return k; };
const wdOf = key => { const [y, m, d] = key.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
const DOW = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

// Resumen del domingo a las 5 PM (la hora de "Planear la semana") y cuidados de los gatos a las 9 AM.
async function extras(subs, state, names) {
  let sent = 0;
  const live = k => (state[k] || []).filter(x => !x.deleted);
  for (const s of subs) {
    const { key, min } = localNow(s.tz || 'UTC');
    // Domingo 5:00–5:10 PM: resumen de la semana que viene
    if (wdOf(key) === 0 && min >= 17 * 60 && min < 17 * 60 + 10 && await once(`sum|${key}|${s.key}`)) {
      const days = Array.from({ length: 7 }, (_, i) => addDaysKey(key, i + 1));
      const evs = live('events').filter(e => days.includes(e.date));
      let salidas = 0; const chores = { a: 0, b: 0 };
      for (const d of days) for (const b of blocksOn({ ...state, checks: [] }, d)) {
        if (b.type === 'salida') salidas++;
        if (b.type === 'quehacer') { if (b.who === 'a' || b.who === 'b') chores[b.who]++; else { chores.a++; chores.b++; } }
      }
      const bits = [];
      if (evs.length) bits.push('📌 ' + evs.slice(0, 2).map(e => `${e.title} (${DOW[wdOf(e.date)]})`).join(', ') + (evs.length > 2 ? ` y ${evs.length - 2} más` : ''));
      if (salidas) bits.push(`💜 ${salidas} salida${salidas > 1 ? 's' : ''}`);
      bits.push(`🧹 Quehaceres: ${names.nameA || 'Él'} ${chores.a} · ${names.nameB || 'Ella'} ${chores.b}`);
      sent += await sendTo([s], { title: 'Su semana en Michis 🐾', body: bits.join('\n'), tag: 'resumen', kind: 'act', url: '/?view=semana' });
    }
    // 9:00–9:10 AM: cuidados de los gatos que tocan hoy
    if (min >= 9 * 60 && min < 9 * 60 + 10) {
      const cats = Object.fromEntries(live('cats').map(c => [c.id, c.name]));
      for (const c of live('catcare').filter(c => c.date === key)) {
        if (!(await once(`cat|${c.id}|${key}|${s.key}`))) continue;
        const cat = c.cat && cats[c.cat] ? ` de ${cats[c.cat]}` : '';
        sent += await sendTo([s], { title: `🐱 Hoy toca: ${c.title}${cat}`, body: 'Márquenlo como hecho en la sección Michis.', tag: `cat:${c.id}|${key}`, kind: 'act', url: '/?view=gatos' });
      }
    }
  }
  return sent;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!hasDb()) return res.status(501).json({ error: 'no-db' });
  try {
    const subs = (await allSubs()).filter(s => s.acts !== false && s.sub);
    if (!subs.length) return res.status(200).json({ sent: 0 });
    const state = JSON.parse((await redis(['GET', K.state])) || '{}');
    const names = state.settings || {};
    let sent = 0;

    for (const s of subs) {
      const { key, min } = localNow(s.tz || 'UTC');
      const days = [[key, 0], [nextKey(key), 1440]];
      for (const [dkey, offset] of days) {
        for (const b of blocksOn(state, dkey)) {
          if (s.who && (b.who === 'a' || b.who === 'b') && b.who !== s.who) continue;
          const [h, mm] = b.start.split(':').map(Number);
          const until = h * 60 + mm + offset - min;
          if (until <= 0 || until > LEAD) continue;
          // Un solo aviso por actividad, fecha y teléfono.
          const first = await redis(['SET', K.sent(`${b.id}|${dkey}|${s.key}`), '1', 'NX', 'EX', '7200']);
          if (first !== 'OK') continue;
          const who = b.who === 'a' ? names.nameA : b.who === 'b' ? names.nameB : b.who === 'ambos' ? 'Ambos' : '';
          sent += await sendTo([s], {
            title: `En ${until} min: ${b.title}`,
            body: `${t12(b.start)}${b.end ? ' – ' + t12(b.end) : ''}${who ? ' · ' + who : ''}`,
            tag: `act:${b.id}|${dkey}`,
            kind: 'act',
            url: `/?view=semana&date=${dkey}`,
          });
        }
      }
    }
    sent += await extras(subs, state, names);
    return res.status(200).json({ sent });
  } catch (e) {
    return res.status(500).json({ error: 'server' });
  }
};
