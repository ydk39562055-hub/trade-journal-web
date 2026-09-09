import { canonical,digest,recordId,cleanFeedCode } from '../feed.mjs';
const RPC='https://oxogtsfxdjbctzehxvae.supabase.co/rest/v1/rpc/';
const KEY='sb_publishable_3vXShFC5dKvMqzUy1KkyGQ_sF0SzUY2';
export function makeFpFeed(result){
  const {snapshot,inbox}=result,assets=new Map((snapshot.assets||[]).map(a=>[String(a.assetId),a.name]));
  const symbols=new Map(snapshot.symbols.map(s=>[String(s.symbolId),s]));const rows=[];
  for(const position of inbox)for(const execution of position.executions){
    if(!Number.isFinite(Date.parse(execution.executedAt)))throw new Error('INVALID_EXECUTION_DATE');
    if(Date.parse(execution.executedAt)<Date.parse('2026-01-01T00:00:00+09:00'))continue;
    rows.push({id:digest(`fpmarkets:${snapshot.environment}:${snapshot.accountId}:${execution.dealId}`),source:'fpmarkets',
      symbol:execution.ticker||'',name:execution.ticker||'종목 확인 필요',side:execution.side?.toUpperCase()||'UNKNOWN',
      currency:position.currency,priceCurrency:assets.get(String(symbols.get(execution.symbolId)?.quoteAssetId))||null,
      quantity:execution.quantityUnits,quantityUnit:'단위',averagePrice:execution.price==null?null:String(execution.price),filledAmount:null,
      executedAt:execution.executedAt,tradedAtKorea:execution.tradedAtKorea,action:execution.action,
      direction:position.direction,commission:execution.commission,tax:null,settlementDate:null,
      grossProfit:execution.close?.grossProfit??null,swap:execution.close?.swap??null,
      realisedCommission:execution.close?.realisedCommission??null,conversionFee:execution.close?.conversionFee??null,
      pnl:null,pnlStatus:'unreconciled',issues:position.issues,status:position.status,environment:snapshot.environment});
  }
  rows.sort((a,b)=>b.executedAt.localeCompare(a.executedAt)||a.id.localeCompare(b.id));
  return {kind:'broker-feed',version:1,source:'fpmarkets',periodStart:'2026-01-01T00:00:00+09:00',rows};
}
export class FpPublisher{
  constructor(code,fetchImpl=fetch){this.code=cleanFeedCode(code);this.fetch=fetchImpl;}
  async rpc(action,body){const response=await this.fetch(RPC+action,{method:'POST',redirect:'error',headers:{apikey:KEY,Authorization:'Bearer '+KEY,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw new Error('FP_CLOUD_FAILED');return response.json();}
  async publish(result,previous){const feed=makeFpFeed(result),revision=digest(canonical(feed));const changed=!previous||previous.revision!==revision||Date.now()-Date.parse(previous.publishedAt)>3600000;
    if(changed){const id=recordId(this.code,'fp-data');await this.rpc('sync_push',{p_sync_id:id,p_data:feed});
      const saved=await this.rpc('sync_pull',{p_sync_id:id});if(canonical(saved?.[0]?.data)!==canonical(feed))throw new Error('FP_CLOUD_VERIFY_FAILED');}
    await this.rpc('sync_push',{p_sync_id:recordId(this.code,'fp-status'),p_data:{kind:'broker-status',version:1,source:'fpmarkets',state:'ok',revision,count:feed.rows.length,collectedAt:result.snapshot.collectedAt}});
    return {revision,publishedAt:changed?new Date().toISOString():previous.publishedAt};
  }
  async failure(code,lastSuccessAt){await this.rpc('sync_push',{p_sync_id:recordId(this.code,'fp-status'),p_data:{kind:'broker-status',version:1,source:'fpmarkets',state:'error',code:/^[A-Z_0-9]+$/.test(code)?code:'COLLECTION_FAILED',lastSuccessAt,checkedAt:new Date().toISOString()}});}
}
