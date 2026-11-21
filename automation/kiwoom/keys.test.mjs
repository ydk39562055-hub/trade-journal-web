import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,readdirSync,existsSync,rmSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {keyPairReader,credentialsFrom} from './keys.mjs';
// Fake keys and account numbers only (temporary folders). Real keys are never touched by these tests.
const FULL='55512340931',DECOY='55512346717';
const APP='FAKEAPPKEY_'+'a'.repeat(30),SECRET='FAKESECRET_'+'b'.repeat(30);
const keyDir=(extra={})=>{const d=mkdtempSync(join(tmpdir(),'tj-kiwoom-keys-'));
 const files={[FULL+'_appkey.txt']:APP+'\n',[FULL+'_secretkey.txt']:' '+SECRET+'\r\n',[DECOY+'_appkey.txt']:'DECOY_APP',[DECOY+'_secretkey.txt']:'DECOY_SECRET',...extra};
 for(const [n,v] of Object.entries(files))if(v!=null)writeFileSync(join(d,n),v);return d;};
const noAccount=e=>!String(e.message).includes(FULL)&&!String(e.message).includes(DECOY);

test('key pair: exactly one account ending with last4, trimmed values, decoys ignored',()=>{
 const d=keyDir();try{assert.deepEqual(keyPairReader(d,'0931')(),{appkey:APP,secretkey:SECRET});}finally{rmSync(d,{recursive:true,force:true});}
});
test('key pair: ambiguous, missing, empty, bad last4 and missing folder all fail with codes only',()=>{
 const twin=keyDir({'99912340931_appkey.txt':'X','99912340931_secretkey.txt':'Y'});
 const noSecret=keyDir({[FULL+'_secretkey.txt']:null});
 const empty=keyDir({[FULL+'_appkey.txt']:'  \n'});
 try{
  assert.throws(()=>keyPairReader(twin,'0931'),e=>e.message==='KIWOOM_KEY_AMBIGUOUS'&&noAccount(e));
  assert.throws(()=>keyPairReader(noSecret,'0931'),e=>e.message==='KIWOOM_KEY_MISSING'&&noAccount(e));
  assert.throws(()=>keyPairReader(twin,'1111'),/KIWOOM_KEY_MISSING/);
  assert.throws(()=>keyPairReader(empty,'0931')(),/KIWOOM_KEY_EMPTY/);
  for(const bad of ['931','09311','',null,'abcd'])assert.throws(()=>keyPairReader(twin,bad),/KIWOOM_KEY_LAST4_INVALID/);
  assert.throws(()=>keyPairReader(join(twin,'nope'),'0931'),/KIWOOM_KEY_DIR_MISSING/);
  assert.throws(()=>keyPairReader('','0931'),/KIWOOM_KEY_DIR_MISSING/);
 }finally{for(const d of [twin,noSecret,empty])rmSync(d,{recursive:true,force:true});}
});
test('credentials: JSON file wins when set, otherwise the key pair folder',()=>{
 const d=keyDir();try{
  assert.deepEqual(credentialsFrom({TJ_KIWOOM_CREDENTIALS:'x.json'},{readJson:()=>({appkey:'J1',secretkey:'J2',other:1})}),{appkey:'J1',secretkey:'J2'});
  assert.deepEqual(credentialsFrom({TJ_KIWOOM_KEY_DIR:d,TJ_KIWOOM_KEY_LAST4:'0931'}),{appkey:APP,secretkey:SECRET});
  assert.throws(()=>credentialsFrom({}),/KIWOOM_KEY_LAST4_INVALID/);
 }finally{rmSync(d,{recursive:true,force:true});}
});

// End to end: collect.mjs in a child process with fetch replaced (no network). Keys and the full account number must not reach
// stdout/stderr, snapshot.json, status.json, any cloud request or any Kiwoom query; the key folder is left exactly as it was.
const PRELOAD=`import {appendFileSync} from 'node:fs';import {createRequire,syncBuiltinESMExports} from 'node:module';
const require=createRequire(import.meta.url);require('node:timers/promises').setTimeout=async()=>{};syncBuiltinESMExports();
const LOG=process.env.FAKE_LOG,FULL=process.env.FAKE_ACCOUNT,pushed=new Map();
const res=(o)=>({ok:true,status:200,json:async()=>o,text:async()=>JSON.stringify(o),headers:{get:()=>null}});
globalThis.fetch=async(url,init={})=>{appendFileSync(LOG,JSON.stringify({url,body:init.body??null})+'\\n');const b=init.body?JSON.parse(init.body):{};
 if(url.endsWith('/oauth2/token'))return res({return_code:0,token:'FAKETOKEN'.repeat(3)});
 if(url.endsWith('/sync_push')){pushed.set(b.p_sync_id,b.p_data);return res(null);}
 if(url.endsWith('/sync_pull'))return res([{data:pushed.get(b.p_sync_id)}]);
 const id=init.headers?.['api-id'];
 if(id==='ust21070')return res({return_code:0,acnt_no:FULL,result_list:[]});
 if(id==='ust21120')return res({return_code:0,acnt_no:FULL,aset_evlt_amt:'000000001000',result_list:[]});
 if(id==='ust21180')return res({return_code:20,return_msg:'[2000](571758:조회내역이 없습니다.)'});
 if(id==='kt00009')return res({return_code:0,acnt_no:FULL,acnt_ord_cntr_prst_array:b.ord_dt.endsWith('1')?[{ord_no:'0000050',cntr_no:'0000001',acnt_no:FULL,stk_cd:'A069500',stk_nm:'KODEX 200',io_tp_nm:'현금매수',cntr_qty:'0000000001',cntr_uv:'0000004900',cntr_tm:'13:07:47'}]:[]});
 throw new Error('UNEXPECTED_URL');};`;
test('collect.mjs with the key folder: nothing secret leaves, folder untouched',()=>{
 const keys=keyDir(),work=mkdtempSync(join(tmpdir(),'tj-kiwoom-run-')),data=join(work,'data'),log=join(work,'calls.log'),pre=join(work,'preload.mjs'),link=join(work,'link.json');
 writeFileSync(pre,PRELOAD);writeFileSync(link,JSON.stringify({kind:'trade-journal-broker-feed',version:1,code:'TJBF'+'c'.repeat(64)}));writeFileSync(log,'');
 const before=readdirSync(keys).map(n=>n+':'+statSync(join(keys,n)).mtimeMs+':'+readFileSync(join(keys,n),'utf8'));
 const script=fileURLToPath(new URL('./collect.mjs',import.meta.url));
 try{
  let out='',err='';
  try{out=execFileSync(process.execPath,['--import',pathToFileURL(pre).href,script],{encoding:'utf8',env:{...process.env,TJ_KIWOOM_CREDENTIALS:'',TJ_KIWOOM_DATA_DIR:data,TJ_KIWOOM_KEY_DIR:keys,TJ_KIWOOM_KEY_LAST4:'0931',TJ_FEED_CODE_PATH:link,FAKE_LOG:log,FAKE_ACCOUNT:FULL},stdio:['ignore','pipe','pipe']});}
  catch(e){err=String(e.stderr);assert.fail('collector failed: '+err.slice(0,200));}
  const result=JSON.parse(out.trim().split('\n').at(-1));assert.equal(result.state,'synced');assert.ok(result.krFills>0);
  const snapshot=readFileSync(join(data,'snapshot.json'),'utf8'),status=readFileSync(join(data,'status.json'),'utf8');
  assert.equal(JSON.parse(status).state,'ok');
  const calls=readFileSync(log,'utf8').trim().split('\n').map(l=>JSON.parse(l));
  const token=calls.filter(c=>c.url.endsWith('/oauth2/token'));assert.equal(token.length,1);assert.ok(token[0].body.includes(APP)); // the log does see requests
  const elsewhere=calls.filter(c=>!c.url.endsWith('/oauth2/token')).map(c=>c.url+' '+c.body).join('\n');
  assert.ok(calls.some(c=>c.url.includes('supabase')&&c.body.includes('kiwoom')));
  for(const [name,text] of Object.entries({out,err,snapshot,status,elsewhere}))for(const s of [APP,SECRET,FULL,DECOY,'DECOY_APP','DECOY_SECRET'])assert.ok(!text.includes(s),name+' leaks '+s.slice(0,6));
  assert.deepEqual(readdirSync(keys).map(n=>n+':'+statSync(join(keys,n)).mtimeMs+':'+readFileSync(join(keys,n),'utf8')),before);
  assert.ok(!existsSync(join(keys,'collector-lock.sqlite')));
 }finally{rmSync(keys,{recursive:true,force:true});rmSync(work,{recursive:true,force:true});}
});
