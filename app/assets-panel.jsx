/* 전체 재산 포트폴리오 — 보유현황(증권계좌) 바로 아래에 붙는 칸.

   ★ 2026-08-09 사용자 요청: "전체 재산 포트폴리오 추가해서 거기서 실시간 가격을 반영",
     "보유현황 밑에 포트폴리오 자체를 하나 넣은건 힘들어?" → 여기가 그 자리다.
   분류는 차근차근(my-assets)의 것을 가져와 이 앱에 맞게 다듬었다.

   누가 무엇을 맡나:
     · 주식/ETF·암호화폐 → 위 '보유 현황'이 티커로 **실시간 시세**로 평가한다(여기 또 안 적는다)
     · 현금·예금·부동산·채권·원자재·연금 → 시세를 낼 수 없으니 **금액을 직접 적는다**
   ⚠ 직접 적은 금액은 자동으로 안 바뀐다. 그래서 '언제 적은 값인지'를 같이 보여줘
     오래된 값을 눈으로 알아채게 한다. 조용히 늙는 숫자가 제일 위험하다. */
const ASSET_CATS = [
  { key: '현금_예금', label: '현금·예금', color: '#F59E0B' },
  { key: '부동산', label: '부동산', color: '#10B981' },
  { key: '채권', label: '채권', color: '#0EA5E9' },
  { key: '원자재', label: '원자재·금', color: '#D97706' },
  { key: '연금_보험', label: '연금·보험', color: '#6366F1' },
  { key: '기타', label: '기타', color: '#94A3B8' },
];

function PortfolioSection({ assets = [], saveAsset, removeAsset, holdingsUSD = 0 }) {
  const [edit, setEdit] = React.useState(null);

  const usdOf = (a) => TJ.toUSD(Number(a.amount) || 0, a.currency === '₩' ? '₩' : '$');
  const manualUSD = assets.reduce((s, a) => s + usdOf(a), 0);
  const totalUSD = manualUSD + (holdingsUSD || 0);
  const pct = (v) => (totalUSD > 0 ? (v / totalUSD) * 100 : 0);

  // 분류별 합계 — 증권계좌 종목은 '주식·코인' 한 칸으로 얹는다(실시간 평가)
  const byCat = ASSET_CATS
    .map((c) => ({ ...c, sum: assets.filter((a) => a.cat === c.key).reduce((s, a) => s + usdOf(a), 0) }))
    .concat([{ key: '_hold', label: '주식·코인(계좌)', color: '#3B82F6', sum: holdingsUSD || 0 }])
    .filter((c) => c.sum > 0)
    .sort((a, b) => b.sum - a.sum);

  const blank = { name: '', cat: '현금_예금', amount: '', currency: '₩', note: '' };
  const canSave = edit && edit.name.trim() && Number(edit.amount) > 0;
  const fld = { fontSize: 12, fontWeight: 600, color: 'var(--ink-3)', display: 'block', margin: '10px 0 5px' };
  const catOf = (k) => ASSET_CATS.find((c) => c.key === k) || { label: '기타', color: '#94A3B8' };

  return (
    <div style={{ marginTop: 16, paddingTop: 14, borderTop: '2px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 14.5, fontWeight: 800 }}>전체 재산 포트폴리오</div>
        <span className="mono" style={{ fontSize: 19, fontWeight: 800, marginLeft: 'auto' }}>{TJ.money(totalUSD)}</span>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--ink-4)', marginTop: 3, lineHeight: 1.55 }}>
        보유현황(실시간 시세) {TJ.money(holdingsUSD || 0)} + 직접 적은 자산 {TJ.money(manualUSD)}
      </div>

      {byCat.length > 0 && (
        <React.Fragment>
          <div style={{ display: 'flex', height: 9, borderRadius: 5, overflow: 'hidden', marginTop: 10, background: 'var(--surface-2)' }}>
            {byCat.map((c) => (
              <div key={c.key} title={c.label} style={{ width: pct(c.sum) + '%', background: c.color }} />
            ))}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, marginTop: 7 }}>
            {byCat.map((c) => (
              <span key={c.key} style={{ fontSize: 11.5, color: 'var(--ink-2)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <i style={{ width: 8, height: 8, borderRadius: 2, background: c.color, display: 'inline-block' }} />
                {c.label} <b className="mono">{Math.round(pct(c.sum))}%</b>
              </span>
            ))}
          </div>
        </React.Fragment>
      )}

      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {assets.map((a) => (
          <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '9px 11px' }}>
            <i style={{ width: 8, height: 8, borderRadius: 2, flex: 'none', background: catOf(a.cat).color }} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</div>
              <div style={{ fontSize: 11, color: 'var(--ink-4)' }}>
                {catOf(a.cat).label}
                {a.updated_at ? ' · ' + String(a.updated_at).slice(0, 10) + ' 기준' : ''}
                {a.note ? ' · ' + a.note : ''}
              </div>
            </div>
            <span className="mono" style={{ fontSize: 13.5, fontWeight: 800, whiteSpace: 'nowrap' }}>{TJ.fmt(Number(a.amount) || 0, a.currency)}</span>
            <button onClick={() => setEdit(Object.assign({}, a, { amount: String(a.amount) }))} style={{ fontSize: 11.5, color: 'var(--ink-4)' }}>수정</button>
            <button onClick={() => { if (confirm(a.name + ' 을(를) 지울까요?')) removeAsset(a.id); }} style={{ fontSize: 11.5, color: 'var(--loss)' }}>삭제</button>
          </div>
        ))}
      </div>

      {!edit && (
        <button className="btn-ghost" onClick={() => setEdit(Object.assign({}, blank))}
          style={{ width: '100%', justifyContent: 'center', borderStyle: 'dashed', color: 'var(--ink-3)', marginTop: 8 }}>
          ＋ 자산 추가 (현금·부동산·연금 등)
        </button>
      )}

      {edit && (
        <div style={{ marginTop: 10, border: '1px solid var(--border)', borderRadius: 12, padding: '12px 13px', background: 'var(--surface)' }}>
          <label style={fld}>이름</label>
          <input value={edit.name} onChange={(e) => setEdit(Object.assign({}, edit, { name: e.target.value }))} placeholder="예금(국민) / 우리집 / 금 10돈" autoFocus />
          <label style={fld}>분류</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {ASSET_CATS.map((c) => (
              <button key={c.key} className={'chip' + (edit.cat === c.key ? ' on' : '')}
                onClick={() => setEdit(Object.assign({}, edit, { cat: c.key }))}
                style={{ fontSize: 12, padding: '5px 11px' }}>{c.label}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={fld}>금액</label>
              <input type="number" inputMode="decimal" value={edit.amount}
                onChange={(e) => setEdit(Object.assign({}, edit, { amount: e.target.value }))} placeholder="0" />
            </div>
            <div style={{ width: 104 }}>
              <label style={fld}>통화</label>
              <div style={{ display: 'flex', gap: 5 }}>
                {['₩', '$'].map((c) => (
                  <button key={c} className={'chip' + (edit.currency === c ? ' on' : '')}
                    onClick={() => setEdit(Object.assign({}, edit, { currency: c }))}
                    style={{ fontSize: 13, padding: '7px 12px' }}>{c}</button>
                ))}
              </div>
            </div>
          </div>
          <label style={fld}>메모 <span style={{ fontWeight: 500, color: 'var(--ink-4)', fontSize: 11.5 }}>(선택)</span></label>
          <input value={edit.note} onChange={(e) => setEdit(Object.assign({}, edit, { note: e.target.value }))} placeholder="만기 2027-03 / 전세보증금 뺀 값 등" />
          <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 8, lineHeight: 1.5 }}>
            이 금액은 자동으로 안 바뀝니다 — 값이 달라지면 직접 고쳐주세요.
            주식·코인은 위 보유현황이 실시간 시세로 평가합니다.
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 11 }}>
            <button className="btn" style={{ flex: 1 }} disabled={!canSave}
              onClick={() => { saveAsset(Object.assign({}, edit, { amount: Number(edit.amount) })); setEdit(null); }}>저장</button>
            <button className="btn-ghost" onClick={() => setEdit(null)}>취소</button>
          </div>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { PortfolioSection, ASSET_CATS });
