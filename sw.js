// Service worker: permite instalar la app, abrirla sin internet y mostrar los avisos
// (aunque la app esté cerrada) al estilo WhatsApp.
const CACHE = 'agenda-v2';
const SHELL = ['/', '/manifest.json', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));

// Primero internet (para tener siempre la versión nueva); si no hay, la copia guardada.
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req.mode === 'navigate' ? '/' : req, copy)).catch(() => {});
      }
      return res;
    } catch (err) {
      const hit = await caches.match(req.mode === 'navigate' ? '/' : req, { ignoreSearch: req.mode === 'navigate' });
      return hit || Response.error();
    }
  })());
});

const ICON = '/icon-192.png';

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data && e.data.text() }; }
  e.waitUntil(show(d));
});

async function show(d) {
  const opts = {
    body: d.body || '',
    tag: d.tag || undefined,
    icon: ICON,
    badge: ICON,
    renotify: !!d.tag,          // suena y vibra otra vez aunque reemplace al anterior
    vibrate: [180, 80, 180],
    timestamp: Date.now(),
    data: { url: d.url || '/', kind: d.kind || '' },
  };
  let title = d.title || 'Nuestra agenda';

  if (d.kind === 'chat') {
    // Como WhatsApp: los mensajes seguidos se juntan en un solo aviso.
    const prev = (await self.registration.getNotifications({ tag: d.tag })).find(n => n.data && n.data.kind === 'chat');
    const lines = ((prev && prev.data.lines) || []).concat(d.body || '').slice(-5);
    opts.data.lines = lines;
    opts.body = lines.join('\n');
    if (lines.length > 1) title = `${d.title} (${lines.length} mensajes)`;
    opts.actions = [{ action: 'open', title: 'Responder' }, { action: 'read', title: 'Marcar como leído' }];
    try {
      const n = (await self.registration.getNotifications()).filter(x => x.data && x.data.kind === 'chat').length;
      if (self.navigator.setAppBadge) await self.navigator.setAppBadge(Math.max(lines.length, n));
    } catch (err) {}
  } else if (d.kind === 'act') {
    opts.requireInteraction = true; // el aviso de actividad se queda hasta que lo veas
    opts.actions = [{ action: 'open', title: 'Ver en la agenda' }];
  }
  return self.registration.showNotification(title, opts);
}

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const data = e.notification.data || {};
  if (e.action === 'read') {
    e.waitUntil(self.navigator.clearAppBadge ? self.navigator.clearAppBadge().catch(() => {}) : Promise.resolve());
    return;
  }
  const url = data.url || '/';
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of list) {
      if (new URL(c.url).origin === self.location.origin) {
        c.postMessage({ type: 'open', url });
        return c.focus();
      }
    }
    return self.clients.openWindow(url);
  })());
});

// La página le pide al service worker que limpie los avisos del chat cuando ya se leyó.
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'chat-read') {
    e.waitUntil((async () => {
      for (const n of await self.registration.getNotifications({ tag: 'chat' })) n.close();
      if (self.navigator.clearAppBadge) await self.navigator.clearAppBadge().catch(() => {});
    })());
  }
});
