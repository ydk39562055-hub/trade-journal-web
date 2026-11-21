import {readFile} from 'node:fs/promises';
import {KiwoomClient} from './client.mjs';
import {collect,makeFeed} from './history.mjs';
import {openPrivateStore} from '../private-store.mjs';
import {FpPublisher} from '../ctrader/feed.mjs';
import {recordId,digest,canonical} from '../feed.mjs';
let store,publisher;
try{
 store=await openPrivateStore(process.env.TJ_KIWOOM_DATA_DIR);
 const credentials=JSON.parse(await readFile(process.env.TJ_KIWOOM_CREDENTIALS,'utf8'));
 const link=JSON.parse(await readFile(process.env.TJ_FEED_CODE_PATH,'utf8'));
 publisher=new FpPublisher(link.code);
 const snapshot=await collect(new KiwoomClient(credentials),await store.read('snapshot.json'));
 await store.write('snapshot.json',snapshot);
 const feed=makeFeed(snapshot),revision=digest(canonical(feed)),id=recordId(link.code,'kiwoom-data');
 await publisher.rpc('sync_push',{p_sync_id:id,p_data:feed});
 const saved=await publisher.rpc('sync_pull',{p_sync_id:id});
 if(canonical(saved?.[0]?.data)!==canonical(feed))throw Error('KIWOOM_CLOUD_VERIFY_FAILED');
 const status={kind:'broker-status',version:1,source:'kiwoom',state:'ok',revision,collectedAt:snapshot.collectedAt,count:feed.rows.length,holdings:feed.holdings.length};
 await publisher.rpc('sync_push',{p_sync_id:recordId(link.code,'kiwoom-status'),p_data:status});
 await store.write('status.json',status);console.log(JSON.stringify({state:'synced',orders:feed.rows.length,holdings:feed.holdings.length,collectedAt:feed.checkedAt}));
}catch(e){
 const code=/^[A-Z_0-9]+$/.test(e.message)?e.message:'KIWOOM_COLLECTION_FAILED';
 if(code!=='COLLECTOR_ALREADY_RUNNING'){
  const status={kind:'broker-status',version:1,source:'kiwoom',state:'error',code,checkedAt:new Date().toISOString()};
  await store?.write('status.json',status).catch(()=>{});
  if(publisher){const link=JSON.parse(await readFile(process.env.TJ_FEED_CODE_PATH,'utf8'));await publisher.rpc('sync_push',{p_sync_id:recordId(link.code,'kiwoom-status'),p_data:status}).catch(()=>{});}
 }
 console.error(code);process.exitCode=1;
}finally{store?.close();}
