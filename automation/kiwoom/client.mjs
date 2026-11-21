import {setTimeout as sleep} from 'node:timers/promises';
// Read-only allow list: api-id -> [path, list field]. Order/modify/cancel/transfer IDs are absent, so they throw before any network call.
// ust21070 미국주식 원장잔고확인 · ust21120 통화별 예수금 및 증권 평가금현황 · ust21180 미국주식 기간별 주문내역 (미국주식 > 계좌)
// kt00009 계좌별주문체결현황요청 (국내주식 > 계좌, 조회) — Kiwoom-Securities/Kiwoom-REST-API kiwoom/_data/kiwoom_api_spec.json @79e39336
export const READ_ONLY=Object.freeze({
 ust21070:['/api/us/acnt','result_list'],
 ust21120:['/api/us/acnt','result_list'],
 ust21180:['/api/us/acnt','result_list'],
 kt00009:['/api/dostk/acnt','acnt_ord_cntr_prst_array'],
});
// Seen live (2026-11-21): a history query with nothing to report answers return_code 20 instead of an empty list —
// kt00009 "[2000](501724:관련자료가없습니다)", ust21180 "[2000](571758:조회내역이 없습니다.)". Only these two messages count as "no rows".
// kt00009 only reaches back two months: "[2000](506424:최근 2개월간 조회 가능합니다.)" -> KIWOOM_OUT_OF_RANGE.
const NO_DATA_OK=new Set(['kt00009','ust21180']);
const NO_DATA=/\((501724|571758):/,OUT_OF_RANGE=/\(506424:/;
// Kiwoom answers 1700 "유량=1" (one request per second per API ID) when asked faster.
export const GAP_MS=1100;
// Account numbers never reach the snapshot: any acnt_no-like field is dropped from answers (top level and rows).
export const stripAccount=o=>{if(o&&typeof o==='object'&&!Array.isArray(o))for(const k of Object.keys(o))if(/acnt_?no|acct_?no/i.test(k))delete o[k];return o;};
export class KiwoomClient {
 constructor(credentials, fetchImpl=fetch){this.credentials=credentials;this.fetch=fetchImpl;}
 async auth(){
  const r=await this.fetch('https://api.kiwoom.com/oauth2/token',{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),headers:{'Content-Type':'application/json'},body:JSON.stringify({grant_type:'client_credentials',appkey:this.credentials.appkey,secretkey:this.credentials.secretkey})});
  const j=await r.json();if(!r.ok||j.return_code!==0||!j.token)throw Error('KIWOOM_AUTH_FAILED');this.token=j.token;
 }
 async get(id,body){
  if(!Object.prototype.hasOwnProperty.call(READ_ONLY,id))throw Error('READ_ONLY_OPERATION_REQUIRED');
  const [path,listKey]=READ_ONLY[id];
  if(!this.token)await this.auth();
  let next='',cont='N',first,rows=[];const seen=new Set();
  for(let page=0;page<500;page++){
   await sleep(this.gapMs??GAP_MS);
   const r=await this.fetch('https://api.kiwoom.com'+path,{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),headers:{'Content-Type':'application/json',authorization:'Bearer '+this.token,'api-id':id,'cont-yn':cont,'next-key':next},body:JSON.stringify(body)});
   const j=await r.json();
   const empty=r.ok&&j.return_code===20&&NO_DATA_OK.has(id)&&NO_DATA.test(String(j.return_msg??''));
   if(r.ok&&j.return_code===20&&id==='kt00009'&&OUT_OF_RANGE.test(String(j.return_msg??'')))throw Error('KIWOOM_OUT_OF_RANGE');
   if(!empty&&(!r.ok||j.return_code!==0))throw Error('KIWOOM_QUERY_'+(Number.isInteger(j.return_code)?j.return_code:'FAILED'));
   const list=empty||(id==='kt00009'&&j[listKey]==null)?[]:j[listKey];
   if(!Array.isArray(list))throw Error('KIWOOM_INCOMPLETE_RESPONSE');
   first??=j;rows.push(...list);cont=empty?'N':r.headers.get('cont-yn');next=r.headers.get('next-key');
   if(cont!=='Y')return stripAccount({...first,[listKey]:rows.map(x=>stripAccount({...x}))});
   if(!next||seen.has(next))throw Error('KIWOOM_CURSOR_STALLED');seen.add(next);
  }throw Error('KIWOOM_PAGE_LIMIT');
 }
}
