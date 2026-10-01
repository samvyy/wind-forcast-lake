const CACHE='wind-forcast-lake-v1';
const FILES=['./','./index.html','./styles.css','./app.js','./icon.svg','./manifest.webmanifest','./data/spots.json'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('wind-forcast-lake-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  const url=new URL(e.request.url);if(url.origin!==self.location.origin||e.request.method!=='GET')return;
  e.respondWith(fetch(e.request).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(url.pathname,copy));}return r;}).catch(()=>caches.match(url.pathname).then(r=>r||Response.error())));
});
