// Portal Operativo SCaD · Integración MNS global · v2.3.8
// Modelo SYS/MNS existente: MNS_Apps identifica APP/origen; EO dinámica por eoKey.
const CHANNEL='MNS_FRONTEND';
const FRAME_URL='mns-frontend-v052.html?v=0.5.11';
const MNS_BRIDGE='https://www.scad.mx/_functions/mnsBridge';
const MNS_KEY='MNS-5C2ZNY6E9K3Y';
let activeContext=null;

async function loadOperContext(){
  if(typeof resolveCurrentMember==='function')resolveCurrentMember();
  const memberId=String((typeof CURRENT_MEMBER_ID!=='undefined'&&CURRENT_MEMBER_ID)||'').trim();
  if(!memberId)throw new Error('No existe sesión de Portal Operativo.');
  if(typeof loadPwaContext==='function')await loadPwaContext();
  const ctx=(typeof pwaContext!=='undefined'&&pwaContext)||window.pwaContext||null;
  if(!ctx?.ok)throw new Error('Portal Operativo no recibió el contexto operativo.');
  return ctx;
}

function resolveMnsContext(ctx){
  const direct=String(
    ctx?.codigoEO ||
    ctx?.eo?.codigoEO ||
    ctx?.empresaOperadora?.codigoEO ||
    ctx?.mns?.eoKey ||
    ''
  ).trim();

  const ref=String(
    ctx?.empresaOperadoraId ||
    ctx?.empresaOperadora?._id ||
    ctx?.empresaOperadora?.empresaOperadoraId ||
    ''
  ).trim();

  const eoKey=direct || (/^EO-[A-Z0-9_-]+$/i.test(ref)?ref:'');

  if(!eoKey){
    throw new Error('Portal Operativo no recibió el código EO de la Empresa Operadora activa.');
  }

  return {mnsKey:MNS_KEY,eoKey};
}

async function invokeMns(action,payload={}){
  const ctx=resolveMnsContext(activeContext);
  const response=await fetch(MNS_BRIDGE,{
    method:'POST',
    mode:'cors',
    credentials:'include',
    cache:'no-store',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({action,payload:{...payload,...ctx}})
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data?.error||`MNS no respondió (${response.status}).`);
  if(data?.ok!==true)throw new Error(data?.error||'No fue posible completar la operación.');
  return data.data;
}

function ensureStyles(){if(document.getElementById('operMnsStyles'))return;const s=document.createElement('style');s.id='operMnsStyles';s.textContent=`.oper-mns-overlay{position:fixed;inset:0;z-index:99999;background:rgba(11,28,47,.46);display:flex;align-items:stretch;justify-content:center}.oper-mns-panel{width:100%;height:100%;background:#f6f8fb;overflow:hidden}.oper-mns-frame{display:block;width:100%;height:100%;border:0;background:#f6f8fb}body.oper-mns-open{overflow:hidden}@media(min-width:760px){.oper-mns-overlay{padding:28px;align-items:center}.oper-mns-panel{width:min(1040px,calc(100vw - 56px));height:min(820px,calc(100dvh - 56px));border-radius:22px;box-shadow:0 24px 80px rgba(6,31,57,.28)}}`;document.head.appendChild(s)}
function frame(){return document.querySelector('#operMnsOverlay iframe')}
function closeMns(){document.getElementById('operMnsOverlay')?.remove();document.body.classList.remove('oper-mns-open')}
async function openMns(ctx=null){try{activeContext=ctx||await loadOperContext();resolveMnsContext(activeContext);ensureStyles();closeMns();const overlay=document.createElement('div');overlay.id='operMnsOverlay';overlay.className='oper-mns-overlay';overlay.innerHTML=`<div class="oper-mns-panel" role="dialog" aria-modal="true" aria-label="Mensajería"><iframe class="oper-mns-frame" src="${FRAME_URL}" title="Mensajería SCaD MNS"></iframe></div>`;overlay.addEventListener('click',e=>{if(e.target===overlay)closeMns()});document.body.appendChild(overlay);document.body.classList.add('oper-mns-open')}catch(error){console.error('[OPERACIÓN MNS]',error);window.alert(error?.message||'No fue posible abrir Mensajería.')}}
window.openScadMns=openMns;
window.openSms=openMns;

window.addEventListener('message',async event=>{const f=frame();if(!f||event.source!==f.contentWindow||event.origin!==location.origin)return;const m=event.data;if(!m||m.channel!==CHANNEL)return;if(m.type==='CLOSE'){closeMns();return}if(m.type==='READY'){try{f.contentWindow.postMessage({channel:CHANNEL,type:'CONTEXT',payload:resolveMnsContext(activeContext)},location.origin)}catch(e){console.error('[OPERACIÓN MNS]',e)}return}if(!m.id||!m.action)return;try{const data=await invokeMns(m.action,m.payload||{});f.contentWindow.postMessage({channel:CHANNEL,id:m.id,ok:true,data},location.origin)}catch(error){f.contentWindow.postMessage({channel:CHANNEL,id:m.id,ok:false,error:error?.message||'Error MNS'},location.origin)}});
