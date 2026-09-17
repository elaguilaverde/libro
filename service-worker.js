// service-worker.js
// CAMBIÁ ESTA VERSIÓN cada vez que subas cambios de código — es lo que le
// avisa al navegador de cada usuario que hay una versión nueva para bajar.
const CACHE_VERSION = "libro-v1";

const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/estilos.css",
  "./js/db.js",
  "./js/ui.js",
  "./js/dashboard.js",
  "./js/movimientos.js",
  "./js/inventario.js",
  "./js/cuentas.js",
  "./js/archivo.js",
  "./js/main.js",
  "./vendor/sql-wasm.js",
  "./vendor/sql-wasm.wasm",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", e=>{
  e.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(ASSETS))
      .catch(err => console.warn("Algún archivo no se pudo precachear (revisá que exista):", err))
  );
});

self.addEventListener("activate", e=>{
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))
    ).then(()=> self.clients.claim())
  );
});

// El usuario (desde el botón "Actualizar ahora" del banner) puede pedirle
// al Service Worker en espera que se active de inmediato.
self.addEventListener("message", e=>{
  if (e.data === "SKIP_WAITING") self.skipWaiting();
});

// Estrategia: primero la red (para tener siempre lo último si hay internet),
// y si falla (offline), se sirve desde la caché. Así el negocio abre sin
// conexión, pero cuando sí hay internet se actualiza solo en segundo plano.
self.addEventListener("fetch", e=>{
  e.respondWith(
    fetch(e.request)
      .then(resp=>{
        const clone = resp.clone();
        caches.open(CACHE_VERSION).then(cache => cache.put(e.request, clone));
        return resp;
      })
      .catch(()=> caches.match(e.request))
  );
});
