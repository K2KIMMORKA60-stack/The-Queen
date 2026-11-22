// The Queen : service de l'appli (démarrage rapide + notifications).
// Les messages ne passent jamais par ce cache.
const VERSION = 'queen-v6';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'crypto.js', 'store.js', 'api.js', 'config.js', 'vendor/supabase.js',
  'manifest.webmanifest', 'icons/logo-512.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png', 'icons/badge-96.png'];

self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok) { const c = r.clone(); caches.open(VERSION).then(x => x.put(e.request, c)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});

// ---------- notifications ----------
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('the-queen', 1);
    r.onupgradeneeded = () => { const d = r.result; ['kv', 'msgs', 'media'].forEach(n => { if (!d.objectStoreNames.contains(n)) d.createObjectStore(n); }); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function kv(k, v) {
  const d = await idb();
  return new Promise((res, rej) => {
    const t = d.transaction('kv', v === undefined ? 'readonly' : 'readwrite');
    const q = v === undefined ? t.objectStore('kv').get(k) : t.objectStore('kv').put(v, k);
    t.oncomplete = () => res(q.result); t.onerror = () => rej(t.error);
  });
}
async function openHint(key, str) {
  const [iv, ct] = String(str).split('.');
  const un = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: un(iv), additionalData: new TextEncoder().encode('queen-notif-v1') }, key, un(ct));
  return JSON.parse(new TextDecoder().decode(pt).trim());
}
const ONE = { message: 'Nouveau message', photo: '📷 Photo', video: '🎥 Vidéo', vocal: '🎤 Message vocal' };
const MANY = { message: ['message', 'messages'], photo: ['photo', 'photos'], video: ['vidéo', 'vidéos'], vocal: ['vocal', 'vocaux'] };
function describe(p) {
  const ks = Object.keys(p.kinds).filter(k => p.kinds[k] > 0);
  if (p.count === 1) return ONE[ks[0]] || ONE.message;
  if (ks.length === 1) return p.count + ' ' + (ks[0] === 'message' ? 'nouveaux messages' : MANY[ks[0]][1]);
  return p.count + ' nouveaux messages : ' + ks.map(k => p.kinds[k] + ' ' + MANY[k][p.kinds[k] > 1 ? 1 : 0]).join(', ');
}

self.addEventListener('push', e => e.waitUntil((async () => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch (x) {}
  const mode = (await kv('notif-mode').catch(() => null)) || 'type';
  let kind = 'message';
  if (mode === 'type' && data.n) {
    try { const key = await kv('notif-key'); const h = await openHint(key, data.n); if (ONE[h.k] || h.k === 'appel' || h.k === 'appel-video') kind = h.k; } catch (x) {}
  }
  if (kind === 'appel' || kind === 'appel-video') {
    const who = (await kv('notif-name').catch(() => null)) || 'The Queen';
    return self.registration.showNotification(who, {
      body: kind === 'appel-video' ? '🎥 Appel vidéo entrant' : '📞 Appel vocal entrant', tag: 'queen-call', renotify: true,
      requireInteraction: true, vibrate: [400, 200, 400, 200, 400], icon: 'icons/icon-192.png', badge: 'icons/badge-96.png', data: { url: './' }
    });
  }
  const p = (await kv('notif-pending').catch(() => null)) || { count: 0, kinds: {} };
  p.count++; p.kinds[kind] = (p.kinds[kind] || 0) + 1;
  await kv('notif-pending', p).catch(() => {});
  const name = mode === 'type' ? ((await kv('notif-name').catch(() => null)) || 'The Queen') : 'The Queen';
  const body = mode === 'type' ? describe(p) : (p.count === 1 ? 'Nouveau message' : p.count + ' nouveaux messages');
  try { if (self.navigator.setAppBadge) await self.navigator.setAppBadge(p.count); } catch (x) {}
  await self.registration.showNotification(name, {
    body, tag: 'queen', renotify: true, icon: 'icons/icon-192.png', badge: 'icons/badge-96.png', data: { url: './' }
  });
})()));

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) if ('focus' in c) return c.focus();
    return self.clients.openWindow('./');
  })());
});
