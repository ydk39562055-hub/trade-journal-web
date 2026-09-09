import { spawnSync } from 'node:child_process';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

function crypt(value, decrypt) {
  if(process.platform!=='win32')throw new Error('WINDOWS_USER_VAULT_REQUIRED');
  const operation=decrypt?'Unprotect':'Protect';
  const script=`$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Security; $s=[Console]::In.ReadToEnd(); $b=[Convert]::FromBase64String($s); $r=[Security.Cryptography.ProtectedData]::${operation}($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($r))`;
  const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{
    input:Buffer.from(value).toString('base64'),encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:1024*1024});
  if(result.status!==0||!result.stdout.trim())throw new Error('PRIVATE_VAULT_FAILED');
  return Buffer.from(result.stdout.trim(),'base64');
}
export async function readVault(directory){
  try{return JSON.parse(crypt(await readFile(join(directory,'connection.dpapi')),true).toString('utf8'));}
  catch(e){if(e.code==='ENOENT')return null;throw new Error('PRIVATE_VAULT_UNREADABLE');}
}
export async function writeVault(directory,value){
  const path=join(directory,'connection.dpapi'),tmp=path+'.'+randomUUID()+'.tmp';
  await writeFile(tmp,crypt(Buffer.from(JSON.stringify(value)),false),{flag:'wx',mode:0o600});await rename(tmp,path);
}
export async function exchangeToken(config, parameters, fetchImpl=fetch){
  const url=new URL('https://openapi.ctrader.com/apps/token');
  for(const [key,value] of Object.entries({client_id:config.clientId,client_secret:config.clientSecret,...parameters}))url.searchParams.set(key,value);
  const response=await fetchImpl(url,{redirect:'error',headers:{Accept:'application/json'},signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new Error('CTRADER_TOKEN_EXCHANGE_FAILED');
  const token=await response.json();
  if(token.errorCode||!token.accessToken||!token.refreshToken||!Number.isFinite(token.expiresIn)||token.expiresIn<=0)throw new Error('CTRADER_TOKEN_INVALID');
  return {...config,accessToken:token.accessToken,refreshToken:token.refreshToken,expiresAt:Date.now()+token.expiresIn*1000};
}
