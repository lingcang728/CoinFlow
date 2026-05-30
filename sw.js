const CACHE_NAME = 'coinflow-v2-desktop';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './favicon.png',
  './css/style.css',
  './js/app.js',
  './js/db.js',
  './js/dashboard.js',
  './js/add-record.js',
  './js/transactions.js',
  './js/statistics.js',
  './js/charts.js',
  './js/budget.js',
  './js/excel.js',
  './js/utils.js',
  './vendor/idb/idb.umd.js',
  './vendor/chartjs/chart.umd.min.js',
  './vendor/xlsx/xlsx.full.min.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png'
];

// 安装阶段：缓存所有静态资源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching all assets');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// 激活阶段：清理旧缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Clearing old cache', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 请求拦截阶段：优先使用缓存，不存在则网络请求，并缓存新资源（Stale-While-Revalidate 或 Network-First 策略）
self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);
  const cacheableProtocols = ['http:', 'https:', 'coinflow:'];

  if (event.request.method !== 'GET' || !cacheableProtocols.includes(requestUrl.protocol)) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // 后台异步更新缓存，保持最新
        fetch(event.request).then((networkResponse) => {
          if (networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
          }
        }).catch((err) => console.log('[Service Worker] Offline fetch failed, serving cache:', err));
        
        return cachedResponse;
      }

      // 没缓存，走网络
      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }

        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return networkResponse;
      });
    })
  );
});
