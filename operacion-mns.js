// Portal Operativo SCaD · Integración MNS global · v2.3.14
// Flujo: sesión Portal -> contexto APP/EO -> aprovisionamiento MNS -> validación -> interfaz.
// No reproduce lógica MNS: consume exclusivamente el bridge y frontend globales existentes.

const MNS_CHANNEL='MNS_FRONTEND';
const MNS_FRAME_URL='mns-frontend-v052.html?v=0.5.13';
const MNS_BRIDGE_URL='https://www.scad.mx/_functions/mnsBridge';
const MNS_APP_KEY='MNS-5C2ZNY6E9K3Y';

let operMnsContext=null;
let operMnsOpening=false;

function operMnsFrame(){
  return document.querySelector('#operMnsOverlay iframe');
}

function closeMns(){
  document.getElementById('operMnsOverlay')?.remove();
  document.body.classList.remove('oper-mns-open');
}

function ensureMnsStyles(){
  if(document.getElementById('operMnsStyles'))return;
  const style=document.createElement('style');
  style.id='operMnsStyles';
  style.textContent=`
    .oper-mns-overlay{position:fixed;inset:0;z-index:99999;background:rgba(11,28,47,.46);display:flex;align-items:stretch;justify-content:center}
    .oper-mns-panel{width:100%;height:100%;background:#f6f8fb;overflow:hidden}
    .oper-mns-frame{display:block;width:100%;height:100%;border:0;background:#f6f8fb}
    body.oper-mns-open{overflow:hidden}
    @media(min-width:760px){
      .oper-mns-overlay{padding:28px;align-items:center}
      .oper-mns-panel{width:min(1040px,calc(100vw - 56px));height:min(820px,calc(100dvh - 56px));border-radius:22px;box-shadow:0 24px 80px rgba(6,31,57,.28)}
    }
  `;
  document.head.appendChild(style);
}

async function loadOperMnsSourceContext(){
  if(typeof resolveCurrentMember==='function')resolveCurrentMember();

  const memberId=String(
    (typeof CURRENT_MEMBER_ID!=='undefined'&&CURRENT_MEMBER_ID) || ''
  ).trim();

  if(!memberId){
    throw new Error('No existe sesión de Portal Operativo.');
  }

  if(typeof loadPwaContext==='function'){
    await loadPwaContext();
  }

  const ctx=
    (typeof pwaContext!=='undefined'&&pwaContext) ||
    window.pwaContext ||
    null;

  if(!ctx?.ok){
    throw new Error('Portal Operativo no recibió el contexto operativo.');
  }

  return ctx;
}

function resolveOperMnsContext(ctx){
  // Sólo referencias MNS/SCaD EO explícitas entregadas por el contexto.
  // Nunca se convierte empresaOperadoraId ni otro ID operativo en eoKey.
  const eoId=String(
    ctx?.mns?.eoId ||
    ctx?.eo?.mnsEoId ||
    ctx?.eo?.eoMnsId ||
    ''
  ).trim();

  const eoKey=String(
    ctx?.eo?.codigoEO ||
    ctx?.mns?.eoKey ||
    ctx?.eo?.mnsEoKey ||
    ctx?.codigoEO ||
    ctx?.empresaOperadora?.codigoEO ||
    ctx?.perfilPersonal?.empresaOperadora?.codigoEO ||
    ''
  ).trim();

  if(!eoId&&!eoKey){
    throw new Error('Portal Operativo no recibió la referencia MNS de la Empresa Operadora activa.');
  }

  return eoId
    ? {mnsKey:MNS_APP_KEY,eoId}
    : {mnsKey:MNS_APP_KEY,eoKey};
}

async function invokeOperMns(action,payload={}){
  if(!operMnsContext){
    throw new Error('MNS no tiene contexto operativo resuelto.');
  }

  const response=await fetch(MNS_BRIDGE_URL,{
    method:'POST',
    mode:'cors',
    credentials:'include',
    cache:'no-store',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      action,
      payload:{...payload,...operMnsContext}
    })
  });

  const data=await response.json().catch(()=>({}));

  if(!response.ok){
    throw new Error(data?.error||data?.message||`MNS no respondió (${response.status}).`);
  }

  if(data?.ok!==true){
    throw new Error(data?.error||data?.message||'No fue posible completar la operación MNS.');
  }

  return data.data;
}

async function validateOperMnsAccess(){
  // El bridge existente resuelve APP/EO y realiza el aprovisionamiento autorizado
  // antes de delegar en el núcleo. mnsInit confirma que el contexto quedó activo.
  const init=await invokeOperMns('mnsInit',{});
  if(!init?.ok){
    throw new Error('MNS no confirmó un contexto activo para este usuario.');
  }

  const appId=String(init.appId||'').trim();
  const eoId=String(init.eoId||'').trim();

  if(!appId||!eoId){
    throw new Error('MNS no devolvió el contexto APP/EO resuelto.');
  }

  operMnsContext={
    ...operMnsContext,
    appId,
    eoId
  };

  return init;
}

function mountOperMns(){
  ensureMnsStyles();
  closeMns();

  const overlay=document.createElement('div');
  overlay.id='operMnsOverlay';
  overlay.className='oper-mns-overlay';
  overlay.innerHTML=`
    <div class="oper-mns-panel" role="dialog" aria-modal="true" aria-label="Mensajería">
      <iframe class="oper-mns-frame" src="${MNS_FRAME_URL}" title="Mensajería SCaD MNS"></iframe>
    </div>
  `;

  overlay.addEventListener('click',event=>{
    if(event.target===overlay)closeMns();
  });

  document.body.appendChild(overlay);
  document.body.classList.add('oper-mns-open');
}

async function openMns(){
  if(operMnsOpening)return;
  operMnsOpening=true;

  try{
    const sourceContext=await loadOperMnsSourceContext();
    operMnsContext=resolveOperMnsContext(sourceContext);

    // Condición de apertura: MNS debe estar completamente operativo.
    await validateOperMnsAccess();

    mountOperMns();
  }catch(error){
    operMnsContext=null;
    console.error('[PORTAL OPERATIVO MNS]',error);
    window.alert(error?.message||'No fue posible abrir Mensajería.');
  }finally{
    operMnsOpening=false;
  }
}

window.openScadMns=openMns;
window.openSms=openMns;

window.addEventListener('message',async event=>{
  const frame=operMnsFrame();

  if(!frame||event.source!==frame.contentWindow||event.origin!==location.origin)return;

  const message=event.data;
  if(!message||message.channel!==MNS_CHANNEL)return;

  if(message.type==='CLOSE'){
    closeMns();
    return;
  }

  if(message.type==='READY'){
    try{
      frame.contentWindow.postMessage({
        channel:MNS_CHANNEL,
        type:'CONTEXT',
        payload:{
          appId:operMnsContext?.appId||'',
          eoId:operMnsContext?.eoId||''
        }
      },location.origin);
    }catch(error){
      console.error('[PORTAL OPERATIVO MNS]',error);
      closeMns();
      window.alert(error?.message||'No fue posible inicializar Mensajería.');
    }
    return;
  }

  if(!message.id||!message.action)return;

  try{
    const data=await invokeOperMns(message.action,message.payload||{});
    frame.contentWindow.postMessage({
      channel:MNS_CHANNEL,
      id:message.id,
      ok:true,
      data
    },location.origin);
  }catch(error){
    frame.contentWindow.postMessage({
      channel:MNS_CHANNEL,
      id:message.id,
      ok:false,
      error:error?.message||'Error MNS'
    },location.origin);
  }
});
