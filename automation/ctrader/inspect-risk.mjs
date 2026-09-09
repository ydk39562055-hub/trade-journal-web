// Read-only feature discovery. Prints only balance and selected risk fields, never credentials/IDs.
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {readVault} from './vault.mjs';
import {ReadOnlyClient,integer} from './protocol.mjs';
import {decimal} from './history.mjs';
import {chartWindow,decodeBars} from './review.mjs';
const client=new ReadOnlyClient();
try {
  const directory=process.argv[2],config=await readVault(directory);
  if(config?.mode!=='production')throw new Error('PRODUCTION_ACCOUNT_CONNECTION_REQUIRED');
  await client.connect(config.environment);
  await client.request(2100,{clientId:config.clientId,clientSecret:config.clientSecret});
  const grant=await client.request(2149,{accessToken:config.accessToken});
  if(![0,'SCOPE_VIEW'].includes(grant.permissionScope))throw new Error('VIEW_ONLY_TOKEN_REQUIRED');
  if(!(grant.ctidTraderAccount||[]).some(a=>String(a.ctidTraderAccountId)===config.accountId&&a.isLive===(config.environment==='live')))throw new Error('ACCOUNT_NOT_GRANTED');
  const account={ctidTraderAccountId:integer(config.accountId)};
  const query=async(type,extra={})=>{const r=await client.request(type,{...account,...extra});if(String(r.ctidTraderAccountId)!==config.accountId)throw new Error('ACCOUNT_MISMATCH');return r;};
  await query(2102,{accessToken:config.accessToken});
  const trader=(await query(2121)).trader;
  const assets=(await query(2112)).asset||[];
  const positions=(await query(2124)).position||[];
  console.log(JSON.stringify({checkedAt:new Date().toISOString(),balance:decimal(trader.balance,trader.moneyDigits),currency:assets.find(a=>String(a.assetId)===String(trader.depositAssetId))?.name,openPositions:positions.length}));
  const history=JSON.parse(await readFile(join(directory,'fp-snapshot.json'),'utf8'));
  const samples=[...history.inbox].sort((a,b)=>b.executions.at(-1).executedAt.localeCompare(a.executions.at(-1).executedAt)).slice(0,3);
  if(process.argv.includes('--chart')){
    const window=chartWindow(samples[0],Date.now()),symbol=samples[0].executions[0].symbolId;
    const bars=await query(2137,{symbolId:integer(symbol),period:window.period,fromTimestamp:window.from,toTimestamp:window.to});
    let error=null;try{decodeBars(bars,window,symbol);}catch(e){error=e.message;}
    console.log(JSON.stringify({chartKeys:Object.keys(bars),period:bars.period,hasMore:bars.hasMore,count:bars.trendbar?.length,first:bars.trendbar?.[0],error}));
    client.close();process.exit(0);
  }
  for(const position of samples)for(const d of [position.executions[0],position.executions.at(-1)]){
    const o=(await query(2181,{orderId:integer(d.orderId)})).order;
    console.log(JSON.stringify({symbol:d.ticker,at:d.executedAt,action:d.action,price:d.price,orderType:o.orderType,
      stopLoss:o.stopLoss??null,takeProfit:o.takeProfit??null,relativeStopLoss:o.relativeStopLoss??null,relativeTakeProfit:o.relativeTakeProfit??null,
      stopPrice:o.stopPrice??null,limitPrice:o.limitPrice??null,isStopOut:o.isStopOut??false,trailingStopLoss:o.trailingStopLoss??null,
      updatedAt:o.utcLastUpdateTimestamp??null}));
  }
}catch(e){console.error(/^[A-Z_]+$/.test(e.message)?e.message:'RISK_INSPECTION_FAILED');process.exitCode=1;}finally{client.close();}
