import { createClient, OAuthStrategy } from 'https://esm.sh/@wix/sdk';
import { functions } from 'https://esm.sh/@wix/http-functions@1.0.0';

// Portal Operativo SCaD · Integración MNS global · v2.3.16
// Mismo modelo OAuth/MNS operativo utilizado por SCaD Comunidad.

const MNS_CHANNEL='MNS_FRONTEND';
const MNS_FRAME_URL='mns-frontend-v052.html?v=0.5.13';
const MNS_APP_KEY='MNS-5C2ZNY6E9K3Y';

const CLIENT_ID='8943652e-6424-4b27-961b-9486abcc97b7';
const SITE_ID='e9c5ce53-8342-4146-acd9-3468abb10cb0';
const REDIRECT_URI='https://portaloperativo.scad.mx/';
const TOKEN_KEY='scad_oper_tokens';
const PKCE_KEY='scad_oper_mns_pkce';
const PENDING_KEY='scad_oper_mns_pending';

let operMnsContext=null;
let operMnsOpening=false;

function readTokens(){try{return JSON.parse(localStorage.getItem(TOKEN_KEY)||'null')}catch{return null}}
function saveTokens(t){localStorage.setItem(TOKEN_KEY,JSON.stringify({...t,savedAt:Date.now()}))}
function sdkTokens(t){
  if(!t?.access_token||!t?.refresh_token)return null;
  const savedAt=Number(t.savedAt||Date.now());
  const expiresIn=Number(t.expires_in||14400);
  return{
    accessToken:{value:t.access_token,expiresAt:savedAt+(expiresIn*1000)},
    refreshToken:{value:t.refresh_token,role:'member'}
  };
}
function randomString(n=64){
  const a=new Uint8Array(n);
  crypto.getRandomValues(a);
  return Array.from(a,b=>(b%36).toString(36)).join('');
}
function b64url(buf){
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
async function challenge(v){
  return b64url(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v)));
}
async function tokenRequest(body){
  const r=await fetch('https://www.wixapis.com/oauth2/token',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify(body)
  });
  if(!r.ok)throw new Error(`OAuth token ${r.status}`);
  return r.json();
}
async function anonymousToken(){
  return tokenRequest({clientId:CLIENT_ID,grantType:'anonymous'});
}
async function refreshTokens(refreshToken){
  const t=await tokenRequest({clientId:CLIENT_ID,grantType:'refresh_token',refreshToken});
  saveTokens(t);
  return t;
}
async function accessToken(){
  let t=readTokens();
  if(!t)return'';
  const age=(Date.now()-(t.savedAt||0))/1000;
  if(t.access_token&&age<Math.max(60,(t.expires_in||3600)-120))return t.access_token;
  if(t.refresh_token){
    t=await refreshTokens(t.refresh_token);
    return t.access_token||'';
  }
  return'';
}
async function startMnsLogin(){
  const verifier=randomString(72);
  const state=randomString(32);
  const codeChallenge=await challenge(verifier);
  sessionStorage.setItem(PKCE_KEY,JSON.stringify({verifier,state}));
  sessionStorage.setItem(PENDING_KEY,'1');

  const anon=await anonymousToken();
  const r=await fetch('https://www.wixapis.com/headless/v1/redirect-session',{
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      'Authorization':anon.access_token
    },
    body:JSON.stringify({
      auth:{
        authRequest:{
          clientId:CLIENT_ID,
          responseType:'code',
          redirectUri:REDIRECT_URI,
          scope:'offline_access',
          state,
          responseMode:'query',
          codeChallenge,
          codeChallengeMethod:'S256',
          metaSiteId:SITE_ID
        },
        prompt:'login'
      },
      preferences:{useGenericWixPages:true}
    })
  });

  if(!r.ok){
    const data=await r.json().catch(()=>({}));
    throw new Error(data?.message||data?.error||`OAuth redirect ${r.status}`);
  }

  const data=await r.json();
  const url=data?.redirectSession?.fullUrl;
  if(!url)throw new Error('Wix no devolvió URL de autenticación.');
  location.assign(url);
}
async function consumeCallback(){
  const p=new URLSearchParams(location.search);
  const code=p.get('code');
  const error=p.get('error');

  if(error)throw new Error(`Autenticación Wix: ${error}`);
  if(!code)return false;

  const raw=sessionStorage.getItem(PKCE_KEY);
  if(!raw)return false;

  const pkce=JSON.parse(raw);
  if(p.get('state')!==pkce.state)throw new Error('Estado OAuth inválido.');

  const t=await tokenRequest({
    clientId:CLIENT_ID,
    grantType:'authorization_code',
    redirectUri:REDIRECT_URI,
    code,
    codeVerifier:pkce.verifier
  });

  saveTokens(t);
  sessionStorage.removeItem(PKCE_KEY);
  history.replaceState({},document.title,location.pathname);
  return true;
}

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
    (typeof CURRENT_MEMBER_ID!=='undefined'&&CURRENT_MEMBER_ID)||''
  ).trim();

  if(!memberId)throw new Error('No existe sesión de Portal Operativo.');

  if(typeof loadPwaContext==='function')await loadPwaContext();

  const ctx=
    (typeof pwaContext!=='undefined'&&pwaContext)||
    window.pwaContext||
    null;

  if(!ctx?.ok)throw new Error('Portal Operativo no recibió el contexto operativo.');
  return ctx;
}

function resolveOperMnsContext(ctx){
  const eoKey=String(
    ctx?.codigoEO||
    ctx?.eo?.codigoEO||
    ''
  ).trim().toUpperCase();

  if(!eoKey){
    throw new Error('Portal Operativo no recibió codigoEO de la Empresa Operadora activa.');
  }

  return {mnsKey:MNS_APP_KEY,eoKey};
}

async function invokeOperMns(action,payload={}){
  if(!operMnsContext)throw new Error('MNS no tiene contexto operativo resuelto.');

  const rawTokens=readTokens();
  const tokens=sdkTokens(rawTokens);
  if(!tokens)throw new Error('La sesión Wix de Mensajería no es válida.');

  const client=createClient({
    modules:{functions},
    auth:OAuthStrategy({clientId:CLIENT_ID,siteId:SITE_ID,tokens})
  });

  const response=await client.functions.post('mnsBridge',{
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
  const init=await invokeOperMns('mnsInit',{});
  if(!init?.ok)throw new Error('MNS no confirmó un contexto activo para este usuario.');

  const appId=String(init.appId||'').trim();
  const eoId=String(init.eoId||'').trim();

  if(!appId||!eoId)throw new Error('MNS no devolvió el contexto APP/EO resuelto.');

  operMnsContext={...operMnsContext,appId,eoId};
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

    if(!await accessToken()){
      await startMnsLogin();
      return;
    }

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

(async()=>{
  try{
    const consumed=await consumeCallback();
    if(consumed&&sessionStorage.getItem(PENDING_KEY)==='1'){
      sessionStorage.removeItem(PENDING_KEY);
      setTimeout(()=>openMns(),500);
    }
  }catch(error){
    console.error('[PORTAL OPERATIVO MNS OAuth]',error);
    window.alert(error?.message||'No fue posible completar la autenticación Wix.');
  }
})();