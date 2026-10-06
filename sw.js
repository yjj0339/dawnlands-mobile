const CACHE='dawnlands-d765d99ded11a235';
const CORE=["./","index.html","mobile-b16f3e79a004.js","loader-f31dc2fcb1d5.js","style-584e3e7c11a8.css","engine-d73cc9448207.js","pack.json","index.icon.png","landscape.png","manifest.webmanifest","vendor/fflate.js","index.audio.worklet.js","index.audio.position.worklet.js"];
const prefix='dawnlands-';
self.addEventListener('install',event=>event.waitUntil((async()=>{
 try{const cache=await caches.open(CACHE);await cache.addAll(CORE.map(file=>new Request(new URL(file,self.location.href),{cache:'reload'})));}catch(error){/* Storage is optional; network play must still work. */}
 await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 try{for(const name of await caches.keys())if(name.startsWith(prefix)&&name!==CACHE)await caches.delete(name);}catch(error){}
 await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
 let writeCache=null,writeResponse=null;
 const task=(async()=>{
  let cache;try{cache=await caches.open(CACHE);}catch(error){}
  const url=new URL(event.request.url);
  const immutable=/world-\d+-[a-f0-9]+\.bin$|\.(wasm|png|otf)$|(?:engine|mobile|style)-[a-f0-9]+\.(?:js|css)$/.test(url.pathname);
  if(cache&&immutable&&event.request.cache!=='reload'){try{const hit=await cache.match(event.request);if(hit)return hit;}catch(error){}}
  try{
   const response=await fetch(event.request);
   if(cache&&response.ok){writeCache=cache;writeResponse=response.clone();}
   return response;
  }catch(error){
   if(cache){try{const hit=await cache.match(event.request,{ignoreSearch:event.request.mode==='navigate'});if(hit)return hit;}catch(cacheError){}}
   throw error;
  }
 })();
 event.respondWith(task);
 event.waitUntil(task.then(()=>writeCache&&writeResponse?writeCache.put(event.request,writeResponse):null).catch(()=>{}));
});
