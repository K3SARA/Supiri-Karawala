const CACHE_NAME = 'print-care-plus-v2';
const ASSETS = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/base.css",
  "css/components.css",
  "css/components2.css",
  "css/layout.css",
  "css/pages.css",
  "css/variables.css",
  "js/app.js",
  "js/components/header.js",
  "js/components/modal.js",
  "js/components/receipt.js",
  "js/components/sidebar.js",
  "js/components/table.js",
  "js/components/toast.js",
  "js/db.js",
  "js/pages/billing.js",
  "js/pages/bills.js",
  "js/pages/categories.js",
  "js/pages/customers.js",
  "js/pages/dashboard.js",
  "js/pages/expenses.js",
  "js/pages/inventory.js",
  "js/pages/products.js",
  "js/pages/profit.js",
  "js/pages/purchases.js",
  "js/pages/reports.js",
  "js/pages/returns.js",
  "js/pages/settings.js",
  "js/pages/suppliers.js",
  "js/utils.js",
  "assets/logo-app.png",
  "assets/logo-receipt-bw.png",
  "assets/logo.png",
  "vendor/chart.umd.js",
  "vendor/dexie.js",
  "vendor/JsBarcode.all.min.js"
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((key) => key === CACHE_NAME ? null : caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request).then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      });
    })
  );
});
