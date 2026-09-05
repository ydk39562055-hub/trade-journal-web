function MeritzModal({ code, imports, onSave, onClose }) {
  const [text,setText]=React.useState('');const [draft,setDraft]=React.useState(()=>TJMeritz.parse(''));
  const [busy,setBusy]=React.useState(false);const [progress,setProgress]=React.useState(0);const [error,setError]=React.useState('');
  const [notices,setNotices]=React.useState([]);const [receipt,setReceipt]=React.useState(null);const [reviewed,setReviewed]=React.useState(false);
  const [noticeLimit,setNoticeLimit]=React.useState(50);
  const [duplicate,setDuplicate]=React.useState(null);const [allowDuplicate,setAllowDuplicate]=React.useState(false);
  const change=(key,value)=>{setDraft(d=>({...d,[key]:value}));setReviewed(false);setDuplicate(null);setAllowDuplicate(false);};
  const read=(value,id=null)=>{setText(value);setDraft(TJMeritz.parse(value));setReceipt(id);setReviewed(false);setError('');setDuplicate(null);setAllowDuplicate(false);};
  async function save(){setError('');if(!reviewed){setError('체결 날짜·수량·가격을 확인한 뒤 확인란을 눌러 주세요.');return;}
    try {const item=await TJMeritz.prepare(draft,text,receipt);
      const same=imports.find(x=>(item.receiptId&&x.receiptId===item.receiptId)||x.fingerprint===item.fingerprint||(item.brokerOrderId&&x.brokerOrderId===item.brokerOrderId&&x.tradedAtKorea===item.tradedAtKorea&&x.currency===item.currency));
      if(same&&!allowDuplicate){setDuplicate(same);setError('같은 거래로 보이는 기록이 있어요. 중복 여부를 확인해 주세요.');return;}
      onSave(item);setError('기록을 저장했어요. 같은 화면에 다른 거래가 있으면 다음 거래도 확인해 주세요.');setReviewed(false);setDraft(TJMeritz.parse(''));setReceipt(null);setDuplicate(null);setAllowDuplicate(false);
    }catch(e){setError(e.message);}}
  return <Modal open onClose={onClose} title="메리츠 기록 가져오기" sub="국내·미국 주식 · 2026년 거래부터" maxWidth={680}>
    <p className="broker-explanation">체결 알림을 붙여넣거나 화면 캡처를 선택하세요. 읽힌 내용을 확인한 다음 저장해요. 캡처는 이 기기에서 문자로 읽으며, 원본 이미지는 서버에 올리지 않아요.</p>
    <p className="broker-explanation"><a href="https://github.com/ydk39562055-hub/trade-journal-web/releases/tag/android-v0.1.1" target="_blank" rel="noopener noreferrer">안드로이드 알림 수집 앱 설치</a> · 처음 한 번 연결하고 알림 접근을 허용해 주세요.</p>
    <label className="meritz-file">화면 캡처 선택<input type="file" accept="image/*" aria-label="메리츠 화면 캡처" disabled={busy} onChange={async e=>{
      const f=e.target.files?.[0];if(!f)return;setBusy(true);setError('');setProgress(0);
      try{read(await TJMeritz.recognize(f,setProgress));}catch(err){setError(err.message);}finally{setBusy(false);e.target.value='';}
    }}/></label>
    {busy&&<p role="status">캡처를 읽고 있어요… {progress>0?progress+'%':'첫 실행은 문자 자료를 내려받아 시간이 걸릴 수 있어요.'}</p>}
    <textarea aria-label="메리츠 체결 알림 원문" placeholder="메리츠 체결 알림을 여기에 붙여넣으세요." value={text} onChange={e=>setText(e.target.value)} style={{minHeight:120,margin:'12px 0'}} />
    <div className="broker-actions"><button className="btn-ghost" disabled={busy||!text.trim()} onClick={()=>read(text,receipt)}>내용 읽기</button>
      <button className="btn-ghost" disabled={!code||busy} onClick={async()=>{setError('');try{const data=await TJBroker.pull(code,'meritz-notifications');setNotices(data.rows);if(!data.rows.length)setError('아직 받은 메리츠 알림이 없어요.');}catch{setError('안드로이드 앱에서 메리츠 알림 접근과 연결을 먼저 설정해 주세요.');}}}>앱에서 받은 알림 불러오기</button></div>
    {notices.length>0&&<details><summary>받은 알림 {notices.length}건</summary>{notices.slice(0,noticeLimit).map(n=><button className="meritz-notice" key={n.id} onClick={()=>read(n.title+'\n'+n.text,n.id)}>
      <strong>{n.title||'메리츠 알림'}{imports.some(r=>r.receiptId===n.id)?' · 저장한 알림':''}</strong><small>{new Date(n.receivedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})} 수신</small><span>{n.text}</span>
    </button>)}{noticeLimit<notices.length&&<button className="btn-ghost" onClick={()=>setNoticeLimit(n=>n+50)}>이전 알림 더 보기</button>}</details>}
    {draft.warning&&<p className="broker-notice">{draft.warning}</p>}
    <div className="meritz-fields">
      <label>시장·통화<select aria-label="메리츠 시장·통화" value={draft.currency} onChange={e=>change('currency',e.target.value)}><option value="">선택해 주세요</option><option value="KRW">국내주식 · 원화</option><option value="USD">미국주식 · 달러</option></select></label>
      <label>매수·매도<select aria-label="메리츠 매수·매도" value={draft.side} onChange={e=>change('side',e.target.value)}><option value="">선택해 주세요</option><option value="BUY">매수</option><option value="SELL">매도</option></select></label>
      <label>체결일<input aria-label="메리츠 체결일" type="date" min="2026-01-01" value={draft.date} onChange={e=>change('date',e.target.value)}/></label>
      <label>체결 시간 (한국 시간)<input aria-label="메리츠 체결 시간" type="time" step="1" value={draft.time} onChange={e=>change('time',e.target.value)}/></label>
      {[['name','종목명'],['symbol','종목코드·티커'],['quantity','체결 수량'],['averagePrice','체결가'],['commission','수수료 (선택)'],['tax','세금 (선택)'],['orderId','주문번호 (선택)']].map(([key,label])=><label key={key}>{label}<input aria-label={'메리츠 '+label} inputMode={['quantity','averagePrice','commission','tax'].includes(key)?'decimal':'text'} value={draft[key]||''} onChange={e=>change(key,e.target.value)}/></label>)}
    </div>
    <label className="meritz-check"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/>화면·알림과 체결 날짜, 시장, 수량, 가격이 일치해요.</label>
    {duplicate&&<label className="meritz-check"><input type="checkbox" checked={allowDuplicate} onChange={e=>setAllowDuplicate(e.target.checked)}/>기존 기록과는 별개의 실제 거래가 맞아요.</label>}
    {error&&<p className="broker-notice" role="status">{error}</p>}
    <button className="btn-primary" disabled={busy||!reviewed} onClick={save}>확인한 거래 저장</button>
    <p className="broker-explanation" style={{marginTop:12}}>한 캡처에 여러 거래가 있으면 한 건씩 확인해 주세요. 날짜가 없는 알림은 수신일을 체결일로 임의 저장하지 않아요.</p>
  </Modal>;
}
window.MeritzModal=MeritzModal;
