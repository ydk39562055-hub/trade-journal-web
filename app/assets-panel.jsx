/* 자산 — 전 재산 하나의 포트폴리오.

   ★ 2026-08-09 사용자 요청: "차근차근처럼 하나의 포트폴리오를 만들라고".
     차근차근(my-assets)의 자산 화면을 그대로 옮겼다 —
       상단 총자산(원/달러 병기) · 분류 칩 · 자산 행(수량·평단·현재가·평가금액·손익) · 대출로 순자산.

   시세를 어떻게 채우나:
     · 심볼(티커)이 있는 자산  → **실시간 시세**로 현재가가 자동으로 채워진다(1분마다).
     · 심볼이 없는 자산(예금·부동산·연금) → 현재가를 직접 적는다. 자동으로 안 바뀐다.
   ⚠ 직접 적은 값은 '언제 적은 값인지'를 같이 보여준다. 조용히 늙는 숫자가 제일 위험하다.

   ⚠ 거래일지(스윙)와는 별개다. 일지는 '내가 사고판 기록', 여기는 '지금 내가 가진 전부'. */

const ASSET_CATS = [
  { key: '주식_ETF', label: '주식·ETF', color: '#3B82F6', live: true },
  { key: '암호화폐', label: '암호화폐', color: '#8B5CF6', live: true },
  { key: '채권', label: '채권', color: '#0EA5E9', live: false },
  { key: '원자재', label: '원자재·금', color: '#D97706', live: false },
  { key: '현금_예금', label: '현금·예금', color: '#F59E0B', live: false },
  { key: '부동산', label: '부동산', color: '#10B981', live: false },
  { key: '연금_보험', label: '연금·보험', color: '#6366F1', live: false },
  { key: '기타', label: '기타', color: '#94A3B8', live: false },
];
const CAT = (k) => ASSET_CATS.find((c) => c.key === k) || ASSET_CATS[ASSET_CATS.length - 1];

/* 자산 한 건의 계산 — 차근차근 lib/calculations.ts 와 같은 규칙 */
function assetValueUSD(a, priceOf) {
  const cur = livePrice(a, priceOf);
  const qty = Number(a.qty) || 0;
  if (a.cat === '현금_예금' || !qty) return TJ.toUSD(Number(a.amount) || 0, a.currency || '₩');
  return TJ.toUSD((cur || 0) * qty, a.currency || '₩');
}
function assetCostUSD(a) {
  const qty = Number(a.qty) || 0;
  if (a.cat === '현금_예금' || !qty) return TJ.toUSD(Number(a.amount) || 0, a.currency || '₩');
  return TJ.toUSD((Number(a.buyPrice) || 0) * qty, a.currency || '₩');
}
/** 현재가 — 심볼이 있으면 실시간, 없으면 내가 적은 값 */
function livePrice(a, priceOf) {
  if (a.symbol && priceOf) {
    const p = priceOf(a.symbol);
    if (p != null) return p;
  }
  return Number(a.price) || Number(a.buyPrice) || 0;
}

function AssetsTab({ assets = [], saveAsset, removeAsset, loans = [], quotes = {}, asOf, onRefresh }) {
  const [cat, setCat] = React.useState('전체');
  const [edit, setEdit] = React.useState(null);

  // 심볼 → 실시간 가격(야후). 심볼 통화가 달라도 자산 통화 기준으로 적어둔 값을 쓴다.
  const priceOf = (sym) => {
    const s = String(sym || '').toUpperCase();
    const q = quotes[s] || quotes[s + '.KS'];
    return q ? Number(q.price) : null;
  };

  const totalUSD = assets.reduce((s, a) => s + assetValueUSD(a, priceOf), 0);
  const costUSD = assets.reduce((s, a) => s + assetCostUSD(a), 0);
  const loanUSD = loans.reduce((s, l) => s + TJ.toUSD(Number(l.amount) || 0, l.currency || '₩'), 0);
  const netUSD = totalUSD - loanUSD;
  const plUSD = totalUSD - costUSD;

  const byCat = ASSET_CATS
    .map((c) => ({ ...c, sum: assets.filter((a) => a.cat === c.key).reduce((s, a) => s + assetValueUSD(a, priceOf), 0) }))
    .filter((c) => c.sum > 0)
    .sort((a, b) => b.sum - a.sum);

  const shown = cat === '전체' ? assets : assets.filter((a) => a.cat === cat);
  const blank = { name: '', cat: '주식_ETF', symbol: '', qty: '', buyPrice: '', price: '', amount: '', currency: '₩', note: '' };
  const isCash = edit && (edit.cat === '현금_예금' || edit.cat === '부동산' || edit.cat === '연금_보험');
  const canSave = edit && edit.name.trim() && (isCash ? Number(edit.amount) > 0 : Number(edit.qty) > 0);
  const fld = { fontSize: 12, fontWeight: 600, color: 'var(--ink-3)', display: 'block', margin: '11px 0 5px' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
      {/* ── 총자산 ── */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '16px 17px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-3)' }}>총자산</div>
        <div className="mono" style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1.25 }}>{TJ.money(totalUSD)}</div>
        <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', marginTop: 6, alignItems: 'center' }}>
          {costUSD > 0 && (
            <span className="mono" style={{ fontSize: 13, fontWeight: 700, color: plUSD >= 0 ? 'var(--win)' : 'var(--loss)' }}>
              {TJ.moneyS(plUSD)} · {(costUSD ? (plUSD / costUSD) * 100 : 0).toFixed(1)}%
            </span>
          )}
          <span style={{ fontSize: 12, color: 'var(--ink-4)' }}>{assets.length}개 자산</span>
          {loanUSD > 0 && <span style={{ fontSize: 12, color: 'var(--ink-4)' }}>· 대출 {TJ.money(loanUSD)} → 순자산 <b className="mono">{TJ.money(netUSD)}</b></span>}
          {onRefresh && (
            <button onClick={onRefresh} style={{ fontSize: 11.5, color: 'var(--ink-4)', marginLeft: 'auto' }}>
              {asOf ? '시세 ' + asOf + ' · 새로고침' : '시세 새로고침'}
            </button>
          )}
        </div>

        {byCat.length > 0 && (
          <React.Fragment>
            <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', marginTop: 13, background: 'var(--surface-2)' }}>
              {byCat.map((c) => <div key={c.key} title={c.label} style={{ width: (c.sum / totalUSD) * 100 + '%', background: c.color }} />)}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 8 }}>
              {byCat.map((c) => (
                <span key={c.key} style={{ fontSize: 11.5, color: 'var(--ink-2)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <i style={{ width: 8, height: 8, borderRadius: 2, background: c.color, display: 'inline-block' }} />
                  {c.label} <b className="mono">{Math.round((c.sum / totalUSD) * 100)}%</b>
                </span>
              ))}
            </div>
          </React.Fragment>
        )}
      </div>

      {/* ── 분류 칩 ── */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {['전체'].concat(ASSET_CATS.map((c) => c.key)).map((k) => {
          const n = k === '전체' ? assets.length : assets.filter((a) => a.cat === k).length;
          if (k !== '전체' && !n) return null;
          return (
            <button key={k} className={'chip' + (cat === k ? ' on' : '')} onClick={() => setCat(k)} style={{ fontSize: 12.5, padding: '6px 12px' }}>
              {k === '전체' ? '전체' : CAT(k).label} {n}
            </button>
          );
        })}
      </div>

      {/* ── 자산 목록 ── */}
      {shown.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--ink-4)', fontSize: 13, padding: '26px 0', lineHeight: 1.7 }}>
          아직 자산이 없습니다.<br />아래 <b>＋ 자산 추가</b>로 예금·부동산·주식을 담아보세요.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {shown.map((a) => {
            const cur = livePrice(a, priceOf);
            const val = assetValueUSD(a, priceOf);
            const cost = assetCostUSD(a);
            const pl = val - cost;
            const hasQty = !!(Number(a.qty) > 0);
            const isLive = !!(a.symbol && priceOf(a.symbol) != null);
            return (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '11px 13px' }}>
                <i style={{ width: 9, height: 9, borderRadius: 3, flex: 'none', background: CAT(a.cat).color }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {a.name}
                    {a.symbol ? <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-4)', marginLeft: 5 }}>{a.symbol}</span> : null}
                    {isLive ? <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--win)', marginLeft: 5 }}>실시간</span> : null}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink-4)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {CAT(a.cat).label}
                    {hasQty ? ' · ' + a.qty + '주 × ' + TJ.fmt(cur, a.currency) : ''}
                    {hasQty && Number(a.buyPrice) > 0 ? ' · 평단 ' + TJ.fmt(Number(a.buyPrice), a.currency) : ''}
                    {!isLive && a.updated_at ? ' · ' + String(a.updated_at).slice(0, 10) + ' 기준' : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flex: 'none' }}>
                  <div className="mono" style={{ fontSize: 14, fontWeight: 800, whiteSpace: 'nowrap' }}>{TJ.money(val)}</div>
                  {cost > 0 && hasQty && (
                    <div className="mono" style={{ fontSize: 11.5, fontWeight: 700, color: pl >= 0 ? 'var(--win)' : 'var(--loss)' }}>
                      {TJ.moneyS(pl)} · {(cost ? (pl / cost) * 100 : 0).toFixed(1)}%
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 'none' }}>
                  <button onClick={() => setEdit(Object.assign({}, a, { qty: String(a.qty || ''), buyPrice: String(a.buyPrice || ''), price: String(a.price || ''), amount: String(a.amount || '') }))}
                    style={{ fontSize: 11, color: 'var(--ink-4)' }}>수정</button>
                  <button onClick={() => { if (confirm(a.name + ' 을(를) 지울까요?')) removeAsset(a.id); }}
                    style={{ fontSize: 11, color: 'var(--loss)' }}>삭제</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!edit && (
        <button className="btn-ghost" onClick={() => setEdit(Object.assign({}, blank))}
          style={{ width: '100%', justifyContent: 'center', borderStyle: 'dashed', color: 'var(--ink-3)' }}>
          ＋ 자산 추가
        </button>
      )}

      {/* ── 추가 · 수정 ── */}
      {edit && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 14, padding: '14px 15px', background: 'var(--surface)' }}>
          <label style={fld}>분류</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {ASSET_CATS.map((c) => (
              <button key={c.key} className={'chip' + (edit.cat === c.key ? ' on' : '')}
                onClick={() => setEdit(Object.assign({}, edit, { cat: c.key }))} style={{ fontSize: 12, padding: '5px 11px' }}>{c.label}</button>
            ))}
          </div>

          <label style={fld}>이름</label>
          <input value={edit.name} onChange={(e) => setEdit(Object.assign({}, edit, { name: e.target.value }))}
            placeholder={isCash ? '예금(국민) / 우리집 / 연금저축' : '삼성전자 / 애플 / 비트코인'} autoFocus />

          {isCash ? (
            <React.Fragment>
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
                        onClick={() => setEdit(Object.assign({}, edit, { currency: c }))} style={{ fontSize: 13, padding: '7px 12px' }}>{c}</button>
                    ))}
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 7, lineHeight: 1.5 }}>
                시세를 낼 수 없는 자산입니다 — 금액이 달라지면 직접 고쳐주세요.
              </div>
            </React.Fragment>
          ) : (
            <React.Fragment>
              <label style={fld}>심볼 <span style={{ fontWeight: 500, color: 'var(--ink-4)', fontSize: 11.5 }}>(넣으면 현재가가 실시간으로 채워집니다 · 한국주식은 6자리)</span></label>
              <input value={edit.symbol} onChange={(e) => setEdit(Object.assign({}, edit, { symbol: e.target.value.toUpperCase() }))} placeholder="AAPL · 005930 · BTC-USD" />
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <label style={fld}>수량</label>
                  <input type="number" inputMode="decimal" value={edit.qty}
                    onChange={(e) => setEdit(Object.assign({}, edit, { qty: e.target.value }))} placeholder="0" />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={fld}>평단(산 가격)</label>
                  <input type="number" inputMode="decimal" value={edit.buyPrice}
                    onChange={(e) => setEdit(Object.assign({}, edit, { buyPrice: e.target.value }))} placeholder="0" />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <label style={fld}>현재가 <span style={{ fontWeight: 500, color: 'var(--ink-4)', fontSize: 11.5 }}>(심볼 없을 때만)</span></label>
                  <input type="number" inputMode="decimal" value={edit.price}
                    onChange={(e) => setEdit(Object.assign({}, edit, { price: e.target.value }))} placeholder="비우면 평단으로 봅니다" />
                </div>
                <div style={{ width: 104 }}>
                  <label style={fld}>통화</label>
                  <div style={{ display: 'flex', gap: 5 }}>
                    {['₩', '$'].map((c) => (
                      <button key={c} className={'chip' + (edit.currency === c ? ' on' : '')}
                        onClick={() => setEdit(Object.assign({}, edit, { currency: c }))} style={{ fontSize: 13, padding: '7px 12px' }}>{c}</button>
                    ))}
                  </div>
                </div>
              </div>
            </React.Fragment>
          )}

          <label style={fld}>메모 <span style={{ fontWeight: 500, color: 'var(--ink-4)', fontSize: 11.5 }}>(선택)</span></label>
          <input value={edit.note || ''} onChange={(e) => setEdit(Object.assign({}, edit, { note: e.target.value }))} placeholder="만기 2027-03 / 전세보증금 뺀 값 등" />

          <div style={{ display: 'flex', gap: 8, marginTop: 13 }}>
            <button className="btn" style={{ flex: 1 }} disabled={!canSave}
              onClick={() => {
                saveAsset(Object.assign({}, edit, {
                  qty: Number(edit.qty) || 0, buyPrice: Number(edit.buyPrice) || 0,
                  price: Number(edit.price) || 0, amount: Number(edit.amount) || 0,
                }));
                setEdit(null);
              }}>저장</button>
            <button className="btn-ghost" onClick={() => setEdit(null)}>취소</button>
          </div>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { AssetsTab, ASSET_CATS });
