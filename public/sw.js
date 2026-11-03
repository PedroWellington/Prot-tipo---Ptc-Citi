// Trocar a versão apaga no activate os assets antigos que o cache-first ainda serviria
const SHELL = "mv-shell-v2";
const DATA = "mv-data";
const OFFLINE = "/offline";
// Só leituras do próprio paciente; o logout apaga este cache
const CACHEABLE_API = ["/api/me/home", "/api/me/units", "/api/units"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll([OFFLINE, "/icons/icon-192.png"])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== DATA).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== location.origin) return;

  // Assets com hash: cache-first
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    e.respondWith(caches.open(SHELL).then(async (c) => {
      const hit = await c.match(request);
      if (hit) return hit;
      const res = await fetch(request);
      if (res.ok) c.put(request, res.clone());
      return res;
    }));
    return;
  }

  // Dados recentes: rede primeiro, cache se offline
  if (CACHEABLE_API.includes(url.pathname)) {
    e.respondWith(caches.open(DATA).then(async (c) => {
      try {
        const res = await fetch(request);
        if (res.ok) c.put(request, res.clone());
        return res;
      } catch {
        return (await c.match(request)) ?? Response.error();
      }
    }));
    return;
  }

  if (request.mode === "navigate") e.respondWith(fetch(request).catch(() => caches.match(OFFLINE)));
});
