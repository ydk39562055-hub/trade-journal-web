import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const window={};
vm.runInNewContext(await readFile(new URL('../app/meritz.js',import.meta.url),'utf8'),{window,crypto,TextEncoder,Uint8Array});
const api=window.TJMeritz;
const text='메리츠 체결\n2026.09.04 10:30:00\n종목명: 삼성전자\n종목코드: 005930\n매수\n체결수량: 2주\n체결가: 70,000원';

test('domestic notification draft preserves stock-code zeroes and KRW; complete review creates an exact record',async()=>{
  const draft=api.parse(text);
  assert.equal(draft.symbol,'005930');assert.equal(draft.currency,'KRW');assert.equal(draft.side,'BUY');
  const row=await api.prepare(draft,text);
  assert.equal(row.filledAmount,'140000');assert.equal(row.quantity,'2');assert.equal(row.pnl,null);assert.equal(row.tax,null);
});
test('US fractional shares and USD never mix with KRW',async()=>{
  const source='2026-09-04 11:35\nAAPL 매도 체결\n수량: 0.25\n체결가: $230.50 USD';
  const d=api.parse(source);assert.equal(d.currency,'USD');assert.equal(d.symbol,'AAPL');
  const row=await api.prepare(d,source);assert.equal(row.filledAmount,'57.625');
  assert.equal(api.multiply('0.123456789123','100.0001'),'12.3456912579789123');
  assert.equal(api.parse(source.replace('체결가:', '체결가.')).averagePrice, '230.50');
});
test('missing, impossible and pre-2026 dates cannot become trades; ambiguity stays unresolved',async()=>{
  const base=api.parse(text);
  for(const date of ['','2025-12-31','2026-02-30'])await assert.rejects(api.prepare({...base,date},text));
  const d=api.parse('매수 매도 USD KRW 수량: 1 체결가: 2');
  assert.equal(d.currency,'');assert.equal(d.side,'');assert.equal(d.date,'');
});
test('same economic facts have matching duplicate fingerprints without collapsing legitimate identical executions',async()=>{
  const a=await api.prepare(api.parse(text),text);const b=await api.prepare(api.parse(text),text+' ');
  assert.equal(a.fingerprint,b.fingerprint);assert.notEqual(a.id,b.id);
});
test('cloud/backup merge preserves imported records, notes, corrections and deletion tombstones',async()=>{
  const code=await readFile(new URL('../app/main.jsx',import.meta.url),'utf8');
  const chunk=code.slice(code.indexOf('const _mtime ='),code.indexOf('/* 레드폴더'));
  const context=vm.createContext({});vm.runInContext(chunk,context);
  const old={id:'meritz-a',updated_at:'2026-09-01T00:00:00Z',quantity:'1'};
  const merged=context.mergeBlobs({brokerImports:[old],memos:[{id:'note',text:'keep'}]},
    {brokerImports:[{...old,quantity:'2',updated_at:'2026-09-02T00:00:00Z'}]});
  assert.equal(merged.brokerImports[0].quantity,'2');assert.equal(merged.memos[0].text,'keep');
  const deleted=context.mergeBlobs(merged,{deleted:{'meritz-a':'2026-09-03T00:00:00Z'}});
  assert.equal(deleted.brokerImports.length,0);assert.equal(deleted.memos.length,1);
});
