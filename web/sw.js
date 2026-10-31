const cache_name = "genera-v37";
const app_shell_assets = [
  "/",
  "/index.html",
  "/logo.svg",
  "/icons/logo.svg",
  "/favicon.ico",
  "/icons/favicon-32x32.png",
  "/icons/favicon-16x16.png",
  "/icons/apple-touch-icon.png",
  "/icons/android-chrome-192x192.png",
  "/icons/android-chrome-512x512.png",
  "/icons/site.webmanifest",
  "/css/style.css",
  "/js/app.js",
  "/js/models/localdb.js",
  "/js/models/auth.js",
  "/js/models/scheduler.js",
  "/js/models/session.js",
  "/js/models/streak.js",
  "/js/views/home_view.js",
  "/js/views/study_view.js",
  "/js/views/trivia_view.js",
  "/js/views/settings_view.js",
  "/js/views/view_utils.js",
  "/js/views/confirm_dialog.js",
  "/js/views/toast.js",
  "/js/controllers/home_controller.js",
  "/js/controllers/deck_wizard_controller.js",
  "/js/controllers/study_controller.js",
  "/js/controllers/trivia_controller.js",
  "/js/controllers/export_controller.js",
  "/js/controllers/import_controller.js",
  "/js/controllers/auth_controller.js",
  "/js/controllers/settings_controller.js",
  "/js/controllers/sync_controller.js",
  "/js/controllers/theme_controller.js",
  "/data/catalog.json",
  "/data/catalog-manifest.json"
];
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(cache_name).then((cache) => {
      return cache.addAll(app_shell_assets);
    }).then(() => {
      return self.skipWaiting();
    })
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== cache_name).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/')) {
    return;
  }
  if (url.pathname === "/data/catalog-manifest.json" || url.pathname === "/data/catalog.json") {
    event.respondWith(
      fetch(event.request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(cache_name).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        return caches.match(event.request);
      })
    );
    return;
  }
  if (event.request.mode === "navigate") {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        return cached || caches.match("/index.html");
      }).catch(() => {
        return caches.match("/index.html");
      })
    );
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }
      return fetch(event.request).then((response) => {
        if (response && response.status === 200 && response.type === "basic") {
          const clone = response.clone();
          caches.open(cache_name).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});