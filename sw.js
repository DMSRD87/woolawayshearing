/* myGang Service Worker — offline-first with network-first for app shell */
const CACHE = 'mygang-v6';

const PRECACHE = [
  'https://unpkg.com/react@18/umd/react.production.min.js',
  'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700;800&family=DM+Sans:wght@400;500;600&family=JetBrains+Mono:wght@500;600&display=swap',
];

/* Install — cache static dependencies */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => {
      return Promise.allSettled(PRECACHE.map(url => cache.add(url)));
    })
  );
  self.skipWaiting();
});

/* Activate — clean up old caches */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/* Fetch strategy */
self.addEventListener('fetch', event => {
  const url = event.request.url;

  /* Supabase API calls — network only, return offline stub if fails */
  if (url.includes('supabase.co')) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(JSON.stringify({ data: [], error: { message: 'offline' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      )
    );
    return;
  }

  /* Main app HTML — network first so deploys reach users immediately.
     Falls back to cache if offline. */
  if (event.request.mode === 'navigate' || url.endsWith('/') || url.endsWith('/index.html')) {
    event.respondWith(
      fetch(event.request).then(res => {
        /* Update cache with fresh version */
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(event.request, clone));
        }
        return res;
      }).catch(() => caches.match(event.request).then(cached => cached || caches.match('/')))
    );
    return;
  }

  /* Google Fonts — cache first */
  if (url.includes('fonts.g') || url.includes('fonts.googleapis') || url.includes('fonts.gstatic')) {
    event.respondWith(
      caches.match(event.request).then(cached => cached || fetch(event.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(event.request, clone));
        return res;
      }).catch(() => new Response('')))
    );
    return;
  }

  /* JS/CSS dependencies — cache first, network fallback */
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(res => {
        if (res.ok && event.request.method === 'GET') {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(event.request, clone));
        }
        return res;
      }).catch(() => caches.match('/'));
    })
  );
});
