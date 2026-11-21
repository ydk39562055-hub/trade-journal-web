import {readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
// Kiwoom key pair from the same folder the market board reads (<account>_appkey.txt + <account>_secretkey.txt), same choice rule
// as its kiwoomKeyReader: exactly one account whose number ends with last4, otherwise fail. Read only; nothing is written there.
// Errors carry codes only — never a file name, account number or key value.
export function keyPairReader(dir,last4,{list=readdirSync,read=f=>readFileSync(f,'utf8')}={}){
 if(!/^\d{4}$/.test(String(last4??'')))throw Error('KIWOOM_KEY_LAST4_INVALID');
 if(!dir)throw Error('KIWOOM_KEY_DIR_MISSING');
 let names;try{names=list(dir);}catch{throw Error('KIWOOM_KEY_DIR_MISSING');}
 const accounts=[...new Set(names.map(n=>/^(\d{6,})_appkey\.txt$/.exec(n)?.[1]).filter(Boolean))].filter(a=>a.endsWith(String(last4)));
 if(accounts.length!==1)throw Error(accounts.length?'KIWOOM_KEY_AMBIGUOUS':'KIWOOM_KEY_MISSING');
 const a=accounts[0];
 if(!names.includes(a+'_secretkey.txt'))throw Error('KIWOOM_KEY_MISSING');
 return ()=>{
  const appkey=read(join(dir,a+'_appkey.txt')).trim(),secretkey=read(join(dir,a+'_secretkey.txt')).trim();
  if(!appkey||!secretkey)throw Error('KIWOOM_KEY_EMPTY');
  return {appkey,secretkey};
 };
}
// JSON file (TJ_KIWOOM_CREDENTIALS) when set, otherwise the key pair folder (TJ_KIWOOM_KEY_DIR + TJ_KIWOOM_KEY_LAST4).
export function credentialsFrom(env,{readJson=f=>JSON.parse(readFileSync(f,'utf8')),...io}={}){
 if(env.TJ_KIWOOM_CREDENTIALS){const c=readJson(env.TJ_KIWOOM_CREDENTIALS);if(!c?.appkey||!c?.secretkey)throw Error('KIWOOM_KEY_EMPTY');return {appkey:c.appkey,secretkey:c.secretkey};}
 return keyPairReader(env.TJ_KIWOOM_KEY_DIR,env.TJ_KIWOOM_KEY_LAST4,io)();
}
