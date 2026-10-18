// Service worker sederhana: jaringan dulu, cadangan dari cache bila offline.
const C = 'beresin-vmve3mbwk';
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(C).then(c => c.addAll(['./', 'app.js', 'config.js', 'manifest.webmanifest']))); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => { const u = new URL(e.request.url); if (e.request.method !== 'GET' || u.origin !== location.origin) return; e.respondWith(fetch(e.request).then(r => { const cp = r.clone(); caches.open(C).then(c => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request))); });
