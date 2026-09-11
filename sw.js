/* v3.0 fix: CACHE below used to be a hardcoded string that had to be
 * bumped by hand on every release. That manual step kept getting
 * missed (it was still "2-2" while the app itself was already on
 * 2.9), so the "activate" cleanup below never found anything to
 * delete and devices kept serving the old cached app.js/index.html
 * forever — a shipped update could be completely invisible, version
 * number included. Now the cache name is derived automatically from
 * the "?v=" on this very script's own URL (in index.html), which is
 * already bumped on every release to force the browser to notice a
 * new service worker. So a single bump in one place now updates both
 * things at once — there's no second manual step left to forget. */
const CACHE="hesabdar-offline-"+(new URL(self.location.href).searchParams.get("v")||"0");
const ASSETS=["./","./index.html","./style.css","./app.js","./manifest.json","./logo.png","./capacitor-local-notifications-bridge.js","./capacitor-filesystem-bridge.js","./capacitor-biometric-bridge.js"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS.map(u=>new Request(u,{cache:"reload"})))).then(()=>self.skipWaiting()))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});

/* ---- Cache-first / stale-while-revalidate for the app shell ----
 * The old strategy re-fetched every file over the network (cache:"no-store")
 * before showing anything, even though the file was already cached. On a
 * slow connection that produced a visible delay: raw/unstyled HTML for a
 * couple of seconds until CSS/JS finally arrived. Now cached assets are
 * served instantly from the cache, while a fresh copy is fetched quietly
 * in the background to keep the cache up to date for next time. ---- */
self.addEventListener("fetch",e=>{
 if(e.request.method!=="GET")return;
 const url=new URL(e.request.url);
 if(url.origin!==self.location.origin){return}
 e.respondWith(
  caches.match(e.request).then(cached=>{
   const network=fetch(e.request).then(r=>{
    if(r&&r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy)).catch(()=>{})}
    return r;
   }).catch(()=>null);
   if(cached)return cached;
   return network.then(r=>r||caches.match("./index.html"));
  })
 );
});
