import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { openPrivateStore } from '../private-store.mjs';
import { readVault,writeVault,exchangeToken } from './vault.mjs';
import { ReadOnlyClient } from './protocol.mjs';

const directory=resolve(process.argv[2]||''),origin='http://127.0.0.1:8767';
const store=await openPrivateStore(directory);
let config=await readVault(directory)||{redirectUri:origin+'/callback/'+randomBytes(24).toString('hex')};
const cookie=randomBytes(32).toString('hex'),csrf=randomBytes(32).toString('hex');let pending=0;
const escape=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function page(res,body,status=200){res.writeHead(status,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'same-origin',
  'X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https://id.ctrader.com; frame-ancestors 'none'",'Set-Cookie':`tjfp=${cookie}; HttpOnly; SameSite=Lax; Path=/`});
  res.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>FP Markets PC 연결</title><style>body{max-width:620px;margin:40px auto;padding:20px;font:16px system-ui;line-height:1.6}input,button{box-sizing:border-box;width:100%;padding:12px;margin:8px 0}label{display:block}button{background:#916338;color:white;border:0;border-radius:8px}small{color:#666}</style><h1>FP Markets PC 연결</h1>${body}`);}
function home(res){page(res,`<p>거래일지에 올해 체결 내역을 가져오는 조회 전용 연결이에요.</p><label>cTrader에 등록할 Redirect URI<input aria-label="Redirect URI" readonly value="${escape(config.redirectUri)}"></label>
  <form method="post" action="/credentials"><input type="hidden" name="csrf" value="${csrf}"><label>Client ID<input name="clientId" aria-label="Client ID" autocomplete="off" required></label><label>Client Secret<input name="clientSecret" aria-label="Client Secret" type="password" autocomplete="off" required></label><button>이 PC에 암호화해 저장</button></form>
  ${config.clientId?`<form method="post" action="/authorize"><input type="hidden" name="csrf" value="${csrf}"><button>cTrader 조회 전용 계좌 연결</button></form>`:''}<small>인증정보는 Windows 사용자 암호화로 이 PC에 저장돼요.</small>`);}
async function grantedAccount(value){const client=new ReadOnlyClient();try{await client.connect('live');await client.request(2100,{clientId:value.clientId,clientSecret:value.clientSecret});
  const grant=await client.request(2149,{accessToken:value.accessToken});
  if(![0,'SCOPE_VIEW'].includes(grant.permissionScope))throw new Error('VIEW_ONLY_TOKEN_REQUIRED');
  const accounts=grant.ctidTraderAccount||[];
  if(accounts.length!==1)throw new Error('SELECT_EXACTLY_ONE_ACCOUNT');
  const account=accounts[0];if(typeof account.isLive!=='boolean')throw new Error('INVALID_ACCOUNT');
  return {...value,accountId:String(account.ctidTraderAccountId),environment:account.isLive?'live':'demo',historyFrom:'2026-01-01T00:00:00+09:00',mode:'production',connectedAt:new Date().toISOString()};
}finally{client.close();}}
const server=createServer(async(req,res)=>{try{
  if(req.headers.host!=='127.0.0.1:8767'){res.writeHead(403);res.end();return;}
  const url=new URL(req.url,origin),hasCookie=(req.headers.cookie||'').split(';').some(c=>c.trim()===`tjfp=${cookie}`);
  if(req.method==='GET'&&url.pathname==='/'){home(res);return;}
  if(req.method==='POST'){
    if(req.headers.origin!==origin)throw new Error('LOCAL_ORIGIN_REQUIRED');
    if(!hasCookie)throw new Error('LOCAL_COOKIE_REQUIRED');
    let raw='';for await(const part of req){raw+=part;if(raw.length>8192)throw new Error('REQUEST_TOO_LARGE');}
    const form=new URLSearchParams(raw);if(form.get('csrf')!==csrf)throw new Error('LOCAL_SESSION_REQUIRED');
    if(url.pathname==='/credentials'){
      const clientId=form.get('clientId')?.trim(),clientSecret=form.get('clientSecret')?.trim();
      if(!clientId||!clientSecret||clientId.length>300||clientSecret.length>500)throw new Error('INVALID_CREDENTIALS');
      config={redirectUri:config.redirectUri,clientId,clientSecret};await writeVault(directory,config);home(res);return;
    }
    if(url.pathname==='/authorize'&&config.clientId){pending=Date.now();const auth=new URL('https://id.ctrader.com/my/settings/openapi/grantingaccess/');
      for(const [k,v]of Object.entries({client_id:config.clientId,redirect_uri:config.redirectUri,scope:'accounts',product:'web'}))auth.searchParams.set(k,v);
      res.writeHead(303,{Location:auth.href,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});res.end();return;}
  }
  if(req.method==='GET'&&url.pathname===new URL(config.redirectUri).pathname){
    if(!hasCookie||!pending||Date.now()-pending>10*60000)throw new Error('LOCAL_SESSION_EXPIRED');
    pending=0;if(url.searchParams.has('error')||!url.searchParams.get('code'))throw new Error('ACCOUNT_CONSENT_NOT_COMPLETED');
    const tokens=await exchangeToken(config,{grant_type:'authorization_code',code:url.searchParams.get('code'),redirect_uri:config.redirectUri});
    // Save the rotating token before any further network work so a transient API failure cannot lose it.
    await writeVault(directory,tokens);config=await grantedAccount(tokens);await writeVault(directory,config);
    page(res,'<h2>조회 전용 계좌 연결 완료</h2><p>인증정보를 이 PC에 암호화해서 저장했어요. 올해 거래내역 조회를 진행할 수 있어요.</p>');console.log('FP_ACCOUNT_CONNECTED');return;
  }
  page(res,'<p>시작 화면에서 다시 연결해 주세요.</p>',404);
}catch(e){const code=/^[A-Z_]+$/.test(e.message)?e.message:'CONNECTION_FAILED';page(res,`<p>연결을 완료하지 못했어요: ${escape(code)}</p><a href="/">다시 연결</a>`,400);console.error(code);}});
server.listen(8767,'127.0.0.1',()=>console.log('FP_CONNECT_READY http://127.0.0.1:8767'));
function stop(){server.close();store.close();process.exit(0);}process.once('SIGINT',stop);process.once('SIGTERM',stop);
