import fs from 'fs';
const html = fs.readFileSync('index.html','utf8');
let script = html.slice(html.indexOf('<script type="module">')+'<script type="module">'.length, html.indexOf('</script>'));
script = script.replace(/^import .*$/m, '');           // import 제거
const cut = script.indexOf('// ───────── 시작');        // 부트스트랩(top-level await) 제거
if (cut>0) script = script.slice(0, cut);
script += '\nreturn { openDashboard, exportCSV, cardHtml, render, finalize: typeof finalizeGradeKr, setEntries:e=>{entries=e;}, setSession:s=>{session=s;}, setFilter:f=>{filter=f;} };';

// ── 스텁 ──
const created=[];
function fakeEl(){ const el={style:{},_h:'',set innerHTML(v){this._h=v;},get innerHTML(){return this._h;},
  querySelector:()=>fakeEl(),querySelectorAll:()=>[],appendChild(){},showModal(){},close(){},remove(){},
  addEventListener(){},onclick:null,onchange:null,oninput:null,value:'',click(){},focus(){}}; return el; }
globalThis.document={ createElement:()=>{const e=fakeEl();created.push(e);return e;}, body:{appendChild(){}},
  getElementById:()=>fakeEl() };
globalThis.localStorage={_s:{},getItem(k){return this._s[k]??null;},setItem(k,v){this._s[k]=v;},removeItem(k){delete this._s[k];}};
globalThis.URL={createObjectURL:()=>'blob:x',revokeObjectURL(){}};
globalThis.__blob=null;
globalThis.Blob=class{constructor(p){globalThis.__blob=p&&p[0];}};
globalThis.Image=class{};
globalThis.createClient=()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange(){},
  signInWithOtp:async()=>({}),verifyOtp:async()=>({}),signOut:async()=>({})},
  from:()=>({select(){return this;},order(){return this;},eq(){return this;},
  maybeSingle:async()=>({data:null}),upsert:async()=>({error:null}),delete(){return{eq:async()=>({error:null})};}})});

const api = new Function(script)();

// ── 더미 데이터셋 (극단 케이스) ──
const mk=(o)=>Object.assign({id:'x'+Math.round(performance.now()*1000+Math.random()*1000),market:'선물',traded_at:'2026-06-01',body:'',photos:[],errors:[]},o);
const datasets={
  '빈 배열':[],
  '단일(완전미입력)':[mk({})],
  '전부 익절(pnl+R)':[mk({result:'win',pnl:300000,realized_r:2,direction:'long',traded_at:'2026-05-01'}),mk({result:'win',pnl:150000,realized_r:1.5,traded_at:'2026-06-01'})],
  '전부 손절':[mk({result:'loss',pnl:-100000,realized_r:-1}),mk({result:'loss',pnl:-50000,realized_r:-1})],
  '본전만':[mk({result:'be',pnl:0,realized_r:0})],
  '혼합+실수태그+결측':[
    mk({result:'win',pnl:200000,realized_r:2,direction:'long',errors:['포모'],market:'선물',traded_at:'2026-04-10'}),
    mk({result:'loss',pnl:-80000,realized_r:-1,direction:'short',errors:['추격','물타기'],market:'현물',traded_at:'2026-05-12'}),
    mk({result:'be',direction:'long',market:'선물',traded_at:'2026-05-20'}),
    mk({body:'그냥 메모만',market:'현물',traded_at:'2026-06-02'}),
    mk({result:'win',pnl:0,realized_r:0.3,traded_at:'2026-06-03'}),
  ],
  '이상치(문자열/널/0)':[
    mk({result:'win',pnl:'abc',realized_r:'',direction:null}),
    mk({result:'loss',pnl:null,realized_r:NaN}),
    mk({result:'win',pnl:0,realized_r:0}),
    mk({traded_at:'',pnl:99999}),
  ],
  '큰 표본(연승연패/곡선)':Array.from({length:30},(_,i)=>mk({
    result:i%3===0?'loss':'win', pnl:(i%3===0?-1:1)*((i*7919)%50000+10000),
    realized_r:i%3===0?-1:1.5, direction:i%2?'long':'short',
    errors:i%4===0?['포모']:[], market:i%2?'선물':'현물',
    traded_at:`2026-0${(i%6)+1}-${String((i%27)+1).padStart(2,'0')}`})),
};

function scan(label,html){
  const issues=[];
  for(const bad of ['NaN','undefined','[object Object]','Infinity원','null건']){
    if(typeof html==='string' && html.includes(bad)) issues.push(bad);
  }
  return issues;
}

let fail=0, total=0;
for(const [name,data] of Object.entries(datasets)){
  api.setEntries(data); api.setSession({user:{id:'u1'}}); api.setFilter('all');
  // 1) 대시보드
  total++;
  try{
    created.length=0; api.openDashboard();
    const dlg=created[created.length-1];
    const iss=scan('dash',dlg&&dlg.innerHTML);
    if(iss.length){ console.log(`  ❌ [${name}] 대시보드: ${iss.join(', ')}`); fail++; }
    else console.log(`  ✅ [${name}] 대시보드 OK`);
  }catch(e){ console.log(`  💥 [${name}] 대시보드 크래시: ${e.message}`); fail++; }
  // 2) CSV
  total++;
  try{
    globalThis.__blob=null; api.exportCSV();
    const iss=scan('csv',globalThis.__blob);
    if(iss.length){ console.log(`  ❌ [${name}] CSV: ${iss.join(', ')}`); fail++; }
    else console.log(`  ✅ [${name}] CSV OK (${(globalThis.__blob||'').split('\\n').length}행)`);
  }catch(e){ console.log(`  💥 [${name}] CSV 크래시: ${e.message}`); fail++; }
  // 3) 카드 렌더
  total++;
  try{
    let allcards=''; for(const en of data) allcards+=api.cardHtml(en);
    const iss=scan('card',allcards);
    if(iss.length){ console.log(`  ❌ [${name}] 카드: ${iss.join(', ')}`); fail++; }
    else console.log(`  ✅ [${name}] 카드 OK`);
  }catch(e){ console.log(`  💥 [${name}] 카드 크래시: ${e.message}`); fail++; }
}
console.log(`\n=== 결과: ${total-fail}/${total} 통과, ${fail} 문제 ===`);
