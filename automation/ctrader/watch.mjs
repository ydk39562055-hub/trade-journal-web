import { readFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { openPrivateStore } from '../private-store.mjs';
import { ReadOnlyClient } from './protocol.mjs';
import { collectSnapshot } from './history.mjs';
import { readVault,writeVault,exchangeToken } from './vault.mjs';
import { FpPublisher,makeFpFeed } from './feed.mjs';
import {enrichReviews} from './review.mjs';
const stop=new AbortController();process.once('SIGINT',()=>stop.abort());process.once('SIGTERM',()=>stop.abort());
const safe=e=>/^[A-Z][A-Z_0-9]+$/.test(e.message)?e.message:'FP_COLLECTION_FAILED';let store;
try{
  const directory=process.env.TJ_PRIVATE_DATA_DIR;store=await openPrivateStore(directory);
  const watch=process.argv.includes('--watch');if(process.argv.slice(2).some(a=>a!=='--watch'))throw new Error('INVALID_ARGUMENT');
  const publisher=new FpPublisher(JSON.parse(await readFile(process.env.TJ_FEED_CODE_PATH,'utf8')).code);
  let previous=await store.read('fp-snapshot.json'),publication=await store.read('fp-publication.json'),failures=0;
  do{const client=new ReadOnlyClient();try{
    let config=await readVault(directory);if(!config||config.mode!=='production'||!config.accountId)throw new Error('PRODUCTION_ACCOUNT_CONNECTION_REQUIRED');
    if(config.expiresAt<Date.now()+24*3600000){config=await exchangeToken(config,{grant_type:'refresh_token',refresh_token:config.refreshToken});await writeVault(directory,config);}
    await client.connect(config.environment);const forceFull=!previous?.fullCollectedAt||Date.now()-Date.parse(previous.fullCollectedAt)>7*86400000;
    const result=await collectSnapshot(client,{...config,from:Date.parse(config.historyFrom),to:Date.now(),previous:previous?.snapshot,forceFull});
    result.fullCollectedAt=forceFull?result.snapshot.collectedAt:previous.fullCollectedAt;
    await enrichReviews(client,result,previous,forceFull,(done,total)=>{if(done%20===0)console.log(JSON.stringify({state:'reviewing',done,total}));});
    await store.write('fp-snapshot.json',result);previous=result;
    publication=await publisher.publish(result,publication);await store.write('fp-publication.json',publication);
    const status={source:'fpmarkets',state:'synced',collectedAt:result.snapshot.collectedAt,executions:makeFpFeed(result).rows.length,cloudPublished:true};
    await store.write('fp-status.json',status);console.log(JSON.stringify(status));failures=0;
  }catch(e){failures++;const status={source:'fpmarkets',state:'error',code:safe(e),lastSuccessAt:previous?.snapshot?.collectedAt||null,cloudPublished:false};
    await store.write('fp-status.json',status);console.error(JSON.stringify(status));await publisher.failure(safe(e),status.lastSuccessAt).catch(()=>{});if(!watch){process.exitCode=1;break;}
  }finally{client.close();}
  if(!watch||stop.signal.aborted)break;await sleep(Math.min(3600,300*2**Math.min(failures,4))*1000,undefined,{signal:stop.signal}).catch(e=>{if(e.name!=='AbortError')throw e;});
  }while(!stop.signal.aborted);
}catch(e){console.error(JSON.stringify({state:'stopped',code:safe(e)}));process.exitCode=1;}finally{store?.close();}
