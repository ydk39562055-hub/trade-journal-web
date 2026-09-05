(function () {
  const decimal = raw => {
    const v = String(raw ?? '').replace(/[,\s₩$]/g, '').trim();
    if (!/^\d{1,40}(\.\d{1,24})?$/.test(v)) throw new Error('수량과 가격은 양수 숫자로 입력해 주세요.');
    return v.replace(/^0+(?=\d)/, '').replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  };
  function multiply(a, b) {
    const split = s => { const [x,y='']=s.split('.');return [BigInt(x+y),y.length]; };
    const [x,dx]=split(a),[y,dy]=split(b),digits=dx+dy;
    const text=String(x*y).padStart(digits+1,'0');
    return decimal(digits ? text.slice(0,-digits)+'.'+text.slice(-digits) : text);
  }
  const one = matches => { const values=[...new Set(matches.filter(Boolean))];return values.length===1?values[0]:''; };
  function parse(text) {
    const source=String(text||'');
    const d=source.match(/\b(20\d{2})[.\/년\s-]+(\d{1,2})[.\/월\s-]+(\d{1,2})/);
    const compact=source.match(/\b(20\d{2})(\d{2})(\d{2})\b/);
    const date=d||compact;
    const time=source.match(/\b([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?\b/);
    const kr=/KRW|₩|\d\s*원/.test(source),us=/USD|US\$|\$|달러/.test(source);
    const side=source.includes('매수')&&!source.includes('매도')?'BUY':source.includes('매도')&&!source.includes('매수')?'SELL':'';
    const qty=one([...source.matchAll(/(?:체결수량|체결량|수량)\s*[:：]?\s*([\d,]+(?:\.\d+)?)/g)].map(m=>m[1]));
    const shares=one([...source.matchAll(/([\d,]+(?:\.\d+)?)\s*주(?![가-힣])/g)].map(m=>m[1]));
    const price=one([...source.matchAll(/(?:체결가격|체결가|체결단가|단가)\s*[:：.]?\s*[$₩]?\s*([\d,]+(?:\.\d+)?)/g)].map(m=>m[1]));
    const krSymbol=source.match(/(?:\(|종목코드\s*[:：]?\s*)(\d{6})(?:\)|\b)/);
    const symbol=krSymbol?.[1]||one((source.match(/\b[A-Z][A-Z0-9.-]{0,8}\b/g)||[]).filter(s=>!['USD','KRW','BUY','SELL','US','KR','NASDAQ','NYSE','AMEX','MERITZ'].includes(s)));
    const name=source.match(/종목명\s*[:：]\s*([^\n\r]+)/)?.[1]?.trim()||symbol;
    return { date:date?`${date[1]}-${date[2].padStart(2,'0')}-${date[3].padStart(2,'0')}`:'',
      time:time?`${time[1].padStart(2,'0')}:${time[2]}:${time[3]||'00'}`:'', symbol,name,
      side,currency:kr!==us?(us?'USD':'KRW'):'',quantity:qty||shares,averagePrice:price,
      commission:'',tax:'',orderId:'', warning:/미체결|주문접수|접수완료|주문취소/.test(source)?'주문 접수·미체결 알림일 수 있어요. 실제 체결 내역인지 확인해 주세요.':'' };
  }
  async function hash(value) { const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join(''); }
  async function prepare(draft, sourceText, receiptId) {
    if(!/^20\d{2}-\d{2}-\d{2}$/.test(draft.date)||draft.date<'2026-01-01')throw new Error('2026년 1월 1일 이후 거래만 가져올 수 있어요.');
    const time=draft.time.length===5?draft.time+':00':draft.time;
    if(!/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(time))throw new Error('체결 시간을 확인해 주세요.');
    const executedAt=draft.date+'T'+time+'+09:00';
    const milliseconds=Date.parse(executedAt);
    if(!Number.isFinite(milliseconds)||new Date(milliseconds+9*3600000).toISOString().slice(0,10)!==draft.date||milliseconds>Date.now()+60000)throw new Error('체결 날짜와 시간을 확인해 주세요.');
    if(!['USD','KRW'].includes(draft.currency)||!['BUY','SELL'].includes(draft.side))throw new Error('국내·미국 구분과 매수·매도를 선택해 주세요.');
    const symbol=draft.symbol.trim().toUpperCase(),name=draft.name.trim()||symbol;
    if(!symbol||!name||symbol.length>30||name.length>100)throw new Error('종목명과 종목코드를 확인해 주세요.');
    const quantity=decimal(draft.quantity),averagePrice=decimal(draft.averagePrice);
    if(!/[1-9]/.test(quantity)||!/[1-9]/.test(averagePrice))throw new Error('체결 수량과 가격은 0보다 커야 해요.');
    const fingerprint=await hash(JSON.stringify([draft.currency,draft.date,time,symbol,draft.side,quantity,averagePrice]));
    const now=new Date().toISOString();
    return { id:'meritz-'+crypto.randomUUID(),source:'meritz',symbol,name,side:draft.side,currency:draft.currency,
      quantity,averagePrice,filledAmount:multiply(quantity,averagePrice),commission:draft.commission?decimal(draft.commission):null,
      tax:draft.tax?decimal(draft.tax):null,executedAt,tradedAtKorea:draft.date,settlementDate:null,
      status:'CONFIRMED_IMPORT',aggregation:'reviewed',pnl:null,pnlStatus:'unreconciled',issues:[],
      fingerprint,receiptId:receiptId||null,sourceFingerprint:await hash(sourceText||''),brokerOrderId:draft.orderId.trim(),
      created_at:now,updated_at:now };
  }
  let ocrScript;
  async function recognize(file, progress) {
    if(!file.type.startsWith('image/')||file.size>12*1024*1024)throw new Error('12MB 이하의 화면 캡처 이미지를 선택해 주세요.');
    if(!window.Tesseract) {
      ocrScript ||= new Promise((resolve,reject)=>{ const s=document.createElement('script');
        s.src='https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js';
        s.onload=resolve;s.onerror=()=>{ocrScript=null;reject(new Error('문자 인식 도구를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.'));};document.head.appendChild(s); });
      await ocrScript;
    }
    let worker;
    try { worker=await Tesseract.createWorker('kor+eng',1,{logger:m=>progress(m.status==='recognizing text'?Math.round(m.progress*100):0)});
      const result=await worker.recognize(file);return result.data.text;
    } finally { await worker?.terminate(); }
  }
  window.TJMeritz={parse,prepare,recognize,decimal,multiply};
})();
