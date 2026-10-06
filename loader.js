// Network and optional offline storage are deliberately independent.
let renderQuality='balanced',bootBusy=false,reloadNeeded=false;
try{renderQuality=localStorage.getItem('dawnlands-web-quality')||'balanced';}catch{}
const loadInfo={version:'3.0.2-mobile.2',stage:'idle',started:0,engineBytes:0,worldParts:0,retries:0,error:'',cache:'optional',messages:[]};
const qualityNames={power:'省电',balanced:'清晰',clear:'高清'};
function applyQuality(value){
 if(!qualityNames[value])value='balanced';
 const changed=renderQuality!==value;renderQuality=value;
 try{localStorage.setItem('dawnlands-web-quality',value);}catch{}
 if($('quality-value'))$('quality-value').textContent=qualityNames[value];
 if(changed)sizeCanvas();
}
function sizeCanvas(){
 const dpr=window.devicePixelRatio||1;
 const maxRatio=renderQuality==='clear'?3:renderQuality==='power'?1:2;
 const budget=renderQuality==='clear'?3000000:renderQuality==='power'?1000000:2500000;
 const ratio=Math.min(dpr,maxRatio,Math.sqrt(budget/(innerWidth*innerHeight)),(renderQuality==='clear'?3072:2304)/Math.max(innerWidth,innerHeight));
 const width=Math.max(1,Math.round(innerWidth*ratio)),height=Math.max(1,Math.round(innerHeight*ratio));
 if($('canvas').width!==width||$('canvas').height!==height){$('canvas').width=width;$('canvas').height=height;}
 loadInfo.canvas=[width,height];loadInfo.devicePixelRatio=dpr;
}
function setStage(stage,text){loadInfo.stage=stage;$('status').textContent=text;updateDiagnostics();}
function updateDiagnostics(){if($('load-details'))$('load-details').textContent=JSON.stringify({...loadInfo,browser:navigator.userAgent},null,2);}
window.DawnlandsMobile.diagnostics=()=>JSON.parse(JSON.stringify(loadInfo));
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function withDeadline(promise,ms,message){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(message)),ms);})]);}finally{clearTimeout(timer);}}
async function enableCache(){
 if(!('serviceWorker' in navigator)){loadInfo.cache='unavailable';return;}
 try{
  await withDeadline(navigator.serviceWorker.register('sw.js',{updateViaCache:'none'}),5000,'缓存注册超时');
  // Do not await serviceWorker.ready: denied storage can leave it pending forever.
  loadInfo.cache='registered';
 }catch(error){loadInfo.cache='network-only';}
}
async function loadManifest(){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
 try{const response=await fetch('pack.json',{cache:'no-cache',signal:controller.signal});if(!response.ok)throw Error('资源清单 HTTP '+response.status);return await response.json();}finally{clearTimeout(timer);}
}
async function ensureInflater(){
 if(typeof DecompressionStream==='function')return;
 if(window.fflate)return;
 await withDeadline(new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='vendor/fflate.js';script.onload=resolve;script.onerror=()=>{script.remove();reject(Error('解压组件下载失败'));};document.head.appendChild(script);}),30000,'解压组件下载超时');
}
async function decodePart(response,part){
 if(part.encoding!=='gzip')return new Uint8Array(await response.arrayBuffer());
 if(typeof DecompressionStream==='function'&&response.body){return new Uint8Array(await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());}
 await ensureInflater();return window.fflate.gunzipSync(new Uint8Array(await response.arrayBuffer()));
}
async function loadPart(part,index,total){
 for(let attempt=0;attempt<3;attempt++){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),90000);
  try{
   setStage('world',`下载世界资源 ${index+1} / ${total}${attempt?' · 重试 '+attempt:''}`);
   const response=await fetch(part.file,{signal:controller.signal,cache:attempt?'reload':'default'});
   if(!response.ok)throw Error('资源 HTTP '+response.status);
   const content=await decodePart(response,part);
   if(content.length!==part.bytes)throw Error('资源长度不完整');
   const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',content)),b=>b.toString(16).padStart(2,'0')).join('');
   if(digest!==part.sha256)throw Error('资源校验失败');
   return content;
  }catch(error){loadInfo.retries++;if(attempt===2)throw Error(`世界资源 ${index+1} 下载失败：${error.name==='AbortError'?'连接超时':error.message}`);await delay(700*(attempt+1));}
  finally{clearTimeout(timer);}
 }
}
async function boot(){
 if(bootBusy)return;if(reloadNeeded){location.reload();return;}
 bootBusy=true;loadInfo.started=Date.now();loadInfo.error='';$('launch').disabled=true;$('launch').textContent='正在载入…';
 let pack=null;
 try{
  if(typeof Engine==='undefined')throw Error('引擎脚本未加载，请刷新后重试');
  const missing=Engine.getMissingFeatures({threads:false});if(missing.length)throw Error('浏览器缺少 '+missing.join('、')+'；请使用支持 WebGL 2 的 Safari');
  setStage('manifest','检查资源清单…');await enableCache();const manifest=await loadManifest();
  if(!engine?.rtenv){
   const config={...manifest.config,canvas:$('canvas'),canvasResizePolicy:0,focusCanvas:true,
    onProgress:(current,total)=>{if(loadInfo.error||!bootBusy)return;loadInfo.engineBytes=current;$('progress').value=.12*Math.min(1,total?current/total:0);setStage(current>=total&&total>0?'compile':'engine',current>=total&&total>0?'引擎已下载，正在编译初始化…':`下载引擎 ${total?Math.round(current/total*100)+'%':Math.round(current/1048576)+' MB'}`);},
    onPrintError:(...args)=>{loadInfo.messages.push(args.join(' '));loadInfo.messages=loadInfo.messages.slice(-8);console.error(...args);},
    onExit:code=>{if(code){reloadNeeded=true;showError('游戏停止，错误码 '+code);}}};
   engine=new Engine(config);setStage('engine','下载引擎…');
   try{await withDeadline(engine.init('index'),120000,'引擎初始化超时，请重新载入。');}catch(error){if(error.message.includes('超时'))reloadNeeded=true;throw Error('引擎加载失败：'+error.message);}
  }
  await ensureInflater();setStage('world','引擎已就绪，开始下载世界…');
  pack=new Uint8Array(manifest.bytes);let offset=0;
  for(let i=0;i<manifest.chunks.length;i++){const part=await loadPart(manifest.chunks[i],i,manifest.chunks.length);pack.set(part,offset);offset+=part.length;loadInfo.worldParts=i+1;$('progress').value=.12+.83*offset/manifest.bytes;await delay(0);}
  if(offset!==manifest.bytes)throw Error('世界资源总长度不完整');
  // Public Engine API + MEMFS buffer ownership: no second full pack copy.
  engine.copyToFS('index.pck',pack.buffer);pack=null;
  setStage('start','资源已就绪，正在打开游戏…');
  const args=['--main-pack','index.pck'];
  // Some embedded or headless browsers have no audio backend at all.
  loadInfo.audio=typeof AudioContext==='function'||typeof webkitAudioContext==='function'?'available':'unavailable';
  if(loadInfo.audio==='unavailable')args.push('--','--mute');
  try{await withDeadline(engine.start({args}),120000,'世界初始化超时，请重新载入。');}catch(error){reloadNeeded=true;throw error;}
  $('progress').value=1;setStage('ready','游戏已就绪');$('loading').hidden=true;
 }catch(error){pack=null;showError(error.message);}
 finally{bootBusy=false;}
}
function showError(text){loadInfo.error=text;setStage('error',text);$('loading').hidden=false;$('launch').disabled=false;$('launch').textContent=reloadNeeded?'重新载入':'重新尝试';if($('diagnostics'))$('diagnostics').open=true;}
document.querySelectorAll('[data-quality]').forEach(button=>button.addEventListener('click',()=>{const value=button.dataset.quality;applyQuality(value);command(value==='power'?'quality_low':value==='clear'?'quality_high':'quality_balanced');$('more-panel').hidden=true;toast('已切换为'+qualityNames[value]+'画质');}));
sizeCanvas();applyQuality(renderQuality);window.addEventListener('resize',sizeCanvas);window.addEventListener('keydown',event=>{if(event.key==='Escape')command('close');});$('launch').onclick=boot;
