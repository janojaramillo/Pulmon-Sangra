/* HP Neo — Service worker
   Hemorragia pulmonar neonatal · Dr. Jano Jaramillo
   Cambie VERSION cada vez que suba un index.html nuevo a GitHub. */
const VERSION = 'hp-neo-v1.0.0';
const CORE = ['./', './index.html', './sw.js'];
const RUNTIME = VERSION + '-rt';

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // Uno por uno: si un recurso falla, los demás quedan guardados igual
    await Promise.allSettled(CORE.map(url =>
      fetch(new Request(url, { cache: 'reload' })).then(r => { if (r.ok) return cache.put(url, r); })
    ));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== VERSION && k !== RUNTIME).map(k => caches.delete(k)));
    if (self.registration.navigationPreload) { try { await self.registration.navigationPreload.disable(); } catch (e) {} }
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => { if (e.data === 'skip') self.skipWaiting(); });

function timeout(ms, promise) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(v => { clearTimeout(t); resolve(v); }, err => { clearTimeout(t); reject(err); });
  });
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (!url.protocol.startsWith('http')) return;

  // 1) Navegación (abrir la app): red primero con límite de 3,5 s; si no, la copia guardada
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      try {
        const res = await timeout(3500, fetch(req));
        if (res && res.ok) cache.put('./index.html', res.clone());
        return res;
      } catch (e) {
        return (await cache.match('./index.html')) || (await cache.match('./')) ||
          new Response('<h1>Sin conexión</h1><p>Abra la app una vez con internet para guardarla.</p>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
    })());
    return;
  }

  // 2) Tipografías de Google: guardar y servir de caché, actualizar en segundo plano
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith((async () => {
      const cache = await caches.open(RUNTIME);
      const hit = await cache.match(req);
      const net = fetch(req).then(r => { if (r && (r.ok || r.type === 'opaque')) cache.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    })());
    return;
  }

  // 3) Mismo origen: caché primero, luego red (y se guarda)
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      } catch (e) {
        return hit || Response.error();
      }
    })());
  }
});
