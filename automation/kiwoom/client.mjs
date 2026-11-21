import {setTimeout as sleep} from 'node:timers/promises';
export class KiwoomClient {
 constructor(credentials, fetchImpl=fetch){this.credentials=credentials;this.fetch=fetchImpl;}
 async auth(){
  const r=await this.fetch('https://api.kiwoom.com/oauth2/token',{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),headers:{'Content-Type':'application/json'},body:JSON.stringify({grant_type:'client_credentials',appkey:this.credentials.appkey,secretkey:this.credentials.secretkey})});
  const j=await r.json();if(!r.ok||j.return_code!==0||!j.token)throw Error('KIWOOM_AUTH_FAILED');this.token=j.token;
 }
 async get(id,body){
  if(!['ust21070','ust21120','ust21180'].includes(id))throw Error('READ_ONLY_OPERATION_REQUIRED');
  if(!this.token)await this.auth();
  let next='',cont='N',first,rows=[];const seen=new Set();
  for(let page=0;page<500;page++){
   await sleep(350);
   const r=await this.fetch('https://api.kiwoom.com/api/us/acnt',{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),headers:{'Content-Type':'application/json',authorization:'Bearer '+this.token,'api-id':id,'cont-yn':cont,'next-key':next},body:JSON.stringify(body)});
   const j=await r.json();if(!r.ok||j.return_code!==0)throw Error('KIWOOM_QUERY_'+(Number.isInteger(j.return_code)?j.return_code:'FAILED'));
   if(!Array.isArray(j.result_list))throw Error('KIWOOM_INCOMPLETE_RESPONSE');
   first??=j;rows.push(...j.result_list);cont=r.headers.get('cont-yn');next=r.headers.get('next-key');
   if(cont!=='Y')return {...first,result_list:rows};
   if(!next||seen.has(next))throw Error('KIWOOM_CURSOR_STALLED');seen.add(next);
  }throw Error('KIWOOM_PAGE_LIMIT');
 }
}
