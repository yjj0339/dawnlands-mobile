'use strict';
const $=id=>document.getElementById(id);
const input={x:0,y:0,lookX:0,lookY:0,jump:false,sprint:false,harvest:false,commands:[]};
let state={},engine,portraitDismissed=false,toastTimer,mode='';
const command=name=>input.commands.push(name);
const reset=()=>{input.x=input.y=input.lookX=input.lookY=0;input.jump=input.sprint=input.harvest=false;$('knob').style.transform='';};
function toast(text){$('toast').textContent=text;$('toast').style.opacity='1';clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').style.opacity='0',2800);}
window.DawnlandsMobile={
 consume(){const copy={...input,commands:input.commands.splice(0)};input.lookX=input.lookY=0;return copy;},
 saved(){toast('已保存到本浏览器');},
 update(value){state=value;const newMode=!value.playing?'title':value.opened?'panel':'world';if(newMode!==mode){reset();mode=newMode;}$('touch-ui').hidden=!value.playing;$('touch-ui').classList.toggle('panel-open',value.opened);$('close-panel').hidden=!value.opened;$('placement').hidden=!value.building;$('actions').hidden=value.building;$('clock').textContent=value.clock;$('stock').textContent=`木 ${value.wood} · 石 ${value.stone} · 板 ${value.plank} · 食 ${value.food} · 研究 ${value.research}`;$('health').textContent=`♥ ${Math.round(value.health)}`;$('goal-title').textContent=value.quest.complete?'继续建设你的世界':`旅程 ${value.quest.index+1} / ${value.chapters}`;$('goal-progress').textContent=value.quest.text;$('target').textContent=value.building?value.hint:value.target;if(value.playing&&!value.persistent&&!sessionStorage.getItem('storageWarn')){sessionStorage.setItem('storageWarn','1');toast('当前浏览器不能持久保存，请下载存档备份');}syncPortrait();},
 snapshot(){return structuredClone(state);}
};
document.querySelectorAll('[data-command]').forEach(button=>button.addEventListener('click',()=>{command(button.dataset.command);if(button.closest('#more-panel'))$('more-panel').hidden=true;}));
document.querySelectorAll('[data-hold]').forEach(button=>{let pointer=null;button.addEventListener('pointerdown',event=>{event.preventDefault();pointer=event.pointerId;button.setPointerCapture(pointer);input[button.dataset.hold]=true;});const up=event=>{if(event.pointerId!==pointer)return;input[button.dataset.hold]=false;pointer=null;};button.addEventListener('pointerup',up);button.addEventListener('pointercancel',up);button.addEventListener('lostpointercapture',up);});
let stickPointer=null;const stick=$('joystick');
function moveStick(event){const rect=stick.getBoundingClientRect();let x=event.clientX-rect.left-rect.width/2,y=event.clientY-rect.top-rect.height/2;const length=Math.hypot(x,y),max=36;if(length>max){x*=max/length;y*=max/length;}input.x=x/max;input.y=y/max;$('knob').style.transform=`translate(${x}px,${y}px)`;}
stick.addEventListener('pointerdown',e=>{e.preventDefault();stickPointer=e.pointerId;stick.setPointerCapture(stickPointer);moveStick(e);});stick.addEventListener('pointermove',e=>{if(e.pointerId===stickPointer)moveStick(e);});const stopStick=e=>{if(e.pointerId!==stickPointer)return;stickPointer=null;input.x=input.y=0;$('knob').style.transform='';};['pointerup','pointercancel','lostpointercapture'].forEach(name=>stick.addEventListener(name,stopStick));
let lookPointer=null,lastLook;const look=$('look-zone');look.addEventListener('pointerdown',e=>{e.preventDefault();lookPointer=e.pointerId;lastLook=[e.clientX,e.clientY];look.setPointerCapture(lookPointer);});look.addEventListener('pointermove',e=>{if(e.pointerId!==lookPointer)return;input.lookX+=e.clientX-lastLook[0];input.lookY+=e.clientY-lastLook[1];lastLook=[e.clientX,e.clientY];});['pointerup','pointercancel','lostpointercapture'].forEach(name=>look.addEventListener(name,e=>{if(e.pointerId===lookPointer)lookPointer=null;}));
async function fullscreen(){try{await document.documentElement.requestFullscreen?.();await screen.orientation?.lock?.('landscape');}catch{}syncPortrait();}
$('fullscreen').onclick=fullscreen;$('rotate-phone').onclick=fullscreen;$('allow-portrait').onclick=()=>{portraitDismissed=true;syncPortrait();};function syncPortrait(){$('portrait').hidden=!state.playing||state.opened||portraitDismissed||innerWidth>=innerHeight;}
$('more').onclick=()=>{$('more-panel').hidden=!$('more-panel').hidden;reset();};$('dismiss-more').onclick=()=>$('more-panel').hidden=true;$('guide').onclick=()=>{$('more-panel').hidden=true;$('help').showModal();reset();};$('help-close').onclick=()=>$('help').close();
document.addEventListener('visibilitychange',()=>{reset();command(document.hidden?'background':'foreground');});window.addEventListener('blur',reset);window.addEventListener('resize',syncPortrait);window.addEventListener('pagehide',()=>{reset();command('background');});
async function boot(){
 $('launch').disabled=true;$('launch').textContent='正在载入…';$('status').textContent='正在下载引擎与世界资源…';
 try{
  if('serviceWorker' in navigator){try{await navigator.serviceWorker.register('sw.js',{updateViaCache:'none'});await navigator.serviceWorker.ready;}catch{}}
  const manifest=await fetch('pack.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('资源清单下载失败');return r.json();});
  const config={...manifest.config,canvas:$('canvas'),canvasResizePolicy:0,focusCanvas:true,onProgress:(current,total)=>{$('status').textContent=`正在载入引擎 ${Math.round(current/1048576)} MB`;},onPrintError:(...args)=>console.error(...args),onExit:code=>{if(code)showError('游戏停止，错误码 '+code);}};
  engine=new Engine(config);let downloaded=0;const buffer=new Uint8Array(manifest.bytes);
  for(let i=0;i<manifest.chunks.length;i++){
   const part=manifest.chunks[i];const response=await fetch(part.file);if(!response.ok)throw Error('资源下载失败，可刷新重试');let body=response.body;if(part.encoding==='gzip'){if(!window.DecompressionStream)throw Error('请使用新版手机浏览器打开游戏');body=body.pipeThrough(new DecompressionStream('gzip'));}const content=new Uint8Array(await new Response(body).arrayBuffer());if(content.length!==part.bytes)throw Error('资源不完整，请刷新重试');const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',content)),b=>b.toString(16).padStart(2,'0')).join('');if(digest!==part.sha256)throw Error('资源校验失败，请刷新重试');buffer.set(content,downloaded);downloaded+=content.length;$('progress').value=downloaded/manifest.bytes;$('status').textContent=`世界资源 ${Math.round(downloaded/manifest.bytes*100)}%`;
  }
  await engine.preloadFile(buffer,'index.pck');$('status').textContent='正在唤醒世界…';await engine.init('index');await engine.start({args:['--main-pack','index.pck']});$('loading').hidden=true;window.addEventListener('keydown',event=>{if(event.key==='Escape')command('close');});
 }catch(error){showError(error.message);}
}
function showError(text){$('loading').hidden=false;$('launch').disabled=false;$('launch').textContent='重新尝试';$('status').textContent=text;}
function sizeCanvas(){const scale=Math.min(1,1160/innerWidth,650/innerHeight);$('canvas').width=Math.round(innerWidth*scale);$('canvas').height=Math.round(innerHeight*scale);}
sizeCanvas();window.addEventListener('resize',sizeCanvas);$('launch').onclick=boot;
