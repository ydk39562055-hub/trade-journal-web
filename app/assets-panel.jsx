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

function AssetsTab({ assets = [], autoAssets = [], accounts = [], saveAsset, removeAsset, loans = [], quotes = {}, asOf, onRefresh, swingMode = 'profit', onSwingMode }) {
  const [cat, setCat] = React.useState('전체');
  const [edit, setEdit] = React.useState(null);
  // ★ 스크린샷으로 자산 추가(2026-08-09 요청) — 보유현황이 쓰던 추출기를 그대로 쓴다.
  const [busy, setBusy] = React.useState(false);      // AI가 읽는 중
  const [shot, setShot] = React.useState(null);       // 읽어낸 결과(확인 전)
  const [shotErr, setShotErr] = React.useState('');
  const fileRef = React.useRef(null);

  // 심볼만 보고 분류를 짐작한다 — 틀리면 확인 화면에서 바꾸면 된다
  const guessCat = (tk) => {
    const s = String(tk || '').toUpperCase();
    if (/BTC|ETH|XRP|SOL|DOGE|-USD$|USDT/.test(s)) return '암호화폐';
    return '주식_ETF';
  };
  const onFiles = async (ev) => {
    const files = [...ev.target.files]; ev.target.value = '';
    if (!files.length) return;
    setBusy(true); setShotErr(''); setShot(null);
    try {
      const parts = [];
      for (const f of files) { const durl = await compressImage(f); if (durl) parts.push({ mime: 'image/jpeg', data: durl.split(',')[1] }); }
      if (!parts.length) throw new Error('이미지를 못 읽었어요');
      const j = await TJPortfolio.extract(parts);
      const hs = (Array.isArray(j.holdings) ? j.holdings : []).filter((h) => h && (h.name || h.ticker) && Number(h.qty) > 0);
      if (!hs.length) throw new Error('종목을 못 읽었어요. 목록이 잘 보이게 다시 찍어주세요.');
      setShot(hs.map((h, i) => ({
        _i: i, on: true,
        name: h.name || h.ticker, symbol: (h.ticker || '').toUpperCase(),
        cat: guessCat(h.ticker), qty: Number(h.qty) || 0,
        buyPrice: Number(h.avgPrice) || 0,
        currency: h.currency === 'USD' || h.currency === '$' ? '$' : '₩',
      })));
    } catch (e) { setShotErr('스크린샷 분석 실패: ' + e.message); }
    setBusy(false);
  };
  const addShots = () => {
    (shot || []).filter((s) => s.on).forEach((s) => {
      saveAsset({ name: s.name, cat: s.cat, symbol: s.symbol, qty: s.qty,
                  buyPrice: s.buyPrice, price: 0, amount: 0, currency: s.currency, note: '스크린샷으로 추가' });
    });
    setShot(null);
  };

  // 심볼 → 실시간 가격(야후). 심볼 통화가 달라도 자산 통화 기준으로 적어둔 값을 쓴다.
  const priceOf = (sym) => {
    const s = String(sym || '').toUpperCase();
    const q = quotes[s] || quotes[s + '.KS'];
    return q ? Number(q.price) : null;
  };

  // 자동으로 딸려오는 자산(장기 보유·스윙 번 돈)을 앞에 두고 함께 센다.
  // 편집은 못 한다 — 원본은 일지·보유현황이고 여기는 비춰 보여주는 자리다.
  const all = autoAssets.concat(assets);
  const totalUSD = all.reduce((s, a) => s + assetValueUSD(a, priceOf), 0);
  const costUSD = all.reduce((s, a) => s + assetCostUSD(a), 0);
  const loanUSD = loans.reduce((s, l) => s + TJ.toUSD(Number(l.amount) || 0, l.currency || '₩'), 0);
  const netUSD = totalUSD - loanUSD;
  const plUSD = totalUSD - costUSD;

  const byCat = ASSET_CATS
    .map((c) => ({ ...c, sum: all.filter((a) => a.cat === c.key).reduce((s, a) => s + assetValueUSD(a, priceOf), 0) }))
    .filter((c) => c.sum > 0)
    .sort((a, b) => b.sum - a.sum);

  const shown = cat === '전체' ? all : all.filter((a) => a.cat === cat);
  const blank = { name: '', cat: '주식_ETF', symbol: '', qty: '', buyPrice: '', price: '', amount: '', currency: '₩', note: '' };
  const isCash = edit && (edit.cat === '현금_예금' || edit.cat === '부동산' || edit.cat === '연금_보험');
  const canSave = edit && edit.name.trim() && (isCash ? Number(edit.amount) > 0 : Number(edit.qty) > 0);
  const fld = { fontSize: 12, fontWeight: 600, color: 'var(--ink-3)', display: 'block', margin: '11px 0 5px' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
      {/* ── 총자산 ── */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '16px 17px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-3)' }}>총자산</div>
        <div className="mono" style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1.25 }}>{TJ.won(totalUSD)}</div>
        <div className="mono" style={{ fontSize: 12.5, color: 'var(--ink-4)', marginTop: -2 }}>{TJ.usdOnly(totalUSD)}</div>
        <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', marginTop: 6, alignItems: 'center' }}>
          {costUSD > 0 && (
            <span className="mono" style={{ fontSize: 13, fontWeight: 700, color: plUSD >= 0 ? 'var(--win)' : 'var(--loss)' }}>
              {TJ.wonS(plUSD)} · {(costUSD ? (plUSD / costUSD) * 100 : 0).toFixed(1)}%
            </span>
          )}
          <span style={{ fontSize: 12, color: 'var(--ink-4)' }}>{all.length}개 자산{autoAssets.length ? ' (일지에서 ' + autoAssets.length + '개 자동)' : ''}</span>
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

      {/* ── 계좌별 성과 ──
          ★ 2026-08-09 사용자 요청: "스윙 장기 선물로 돈을 얼마나 수익이 났는지 다 확인이 되어야".
          자산은 '지금 얼마 있나', 여기는 '어디서 얼마나 벌었나'. 둘은 다른 질문이라 나눠 놓는다. */}
      {accounts.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '14px 16px' }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 9 }}>계좌별로 얼마나 벌었나</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ color: 'var(--ink-4)', fontSize: 11 }}>
                  <th style={{ textAlign: 'left', padding: '4px 6px' }}>계좌</th>
                  <th style={{ textAlign: 'right', padding: '4px 6px' }}>넣은 돈</th>
                  <th style={{ textAlign: 'right', padding: '4px 6px' }}>번 돈</th>
                  <th style={{ textAlign: 'right', padding: '4px 6px' }}>수익률</th>
                  <th style={{ textAlign: 'right', padding: '4px 6px' }}>지금 잔고</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map(([nm, b]) => (
                  <tr key={nm} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '7px 6px', fontWeight: 700 }}>{nm}</td>
                    <td className="mono" style={{ padding: '7px 6px', textAlign: 'right', color: 'var(--ink-3)' }}>{b.base ? TJ.won(b.base) : '—'}</td>
                    <td className="mono" style={{ padding: '7px 6px', textAlign: 'right', fontWeight: 800, color: b.pnl > 0 ? 'var(--win)' : b.pnl < 0 ? 'var(--loss)' : 'inherit' }}>
                      {b.pnl ? TJ.wonS(b.pnl) : '—'}
                    </td>
                    <td className="mono" style={{ padding: '7px 6px', textAlign: 'right', color: b.ret == null ? 'var(--ink-4)' : b.ret >= 0 ? 'var(--win)' : 'var(--loss)' }}>
                      {b.ret == null ? '—' : (b.ret >= 0 ? '+' : '') + b.ret.toFixed(1) + '%'}
                    </td>
                    <td className="mono" style={{ padding: '7px 6px', textAlign: 'right', fontWeight: 700 }}>{b.base || b.pnl ? TJ.won(b.bal) : '—'}</td>
                  </tr>
                ))}
                {(() => {
                  const base = accounts.reduce((s, [, b]) => s + (b.base || 0), 0);
                  const pnl = accounts.reduce((s, [, b]) => s + (b.pnl || 0), 0);
                  const bal = accounts.reduce((s, [, b]) => s + (b.bal || 0), 0);
                  if (!base && !pnl) return null;
                  return (
                    <tr style={{ borderTop: '2px solid var(--border)' }}>
                      <td style={{ padding: '7px 6px', fontWeight: 800 }}>합계</td>
                      <td className="mono" style={{ padding: '7px 6px', textAlign: 'right', color: 'var(--ink-3)' }}>{TJ.won(base)}</td>
                      <td className="mono" style={{ padding: '7px 6px', textAlign: 'right', fontWeight: 800, color: pnl >= 0 ? 'var(--win)' : 'var(--loss)' }}>{TJ.wonS(pnl)}</td>
                      <td className="mono" style={{ padding: '7px 6px', textAlign: 'right', color: pnl >= 0 ? 'var(--win)' : 'var(--loss)' }}>
                        {base ? (pnl >= 0 ? '+' : '') + (pnl / base * 100).toFixed(1) + '%' : '—'}
                      </td>
                      <td className="mono" style={{ padding: '7px 6px', textAlign: 'right', fontWeight: 800 }}>{TJ.won(bal)}</td>
                    </tr>
                  );
                })()}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--ink-4)', marginTop: 7, lineHeight: 1.55 }}>
            넣은 돈 = 시드 + 추가 입금 · 번 돈 = 실현손익(장기는 보유 평가손익 포함).
            시드가 비어 있으면 설정에서 계좌별 시드를 적어주세요.
          </div>
        </div>
      )}

      {/* ── 분류 칩 ── */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {['전체'].concat(ASSET_CATS.map((c) => c.key)).map((k) => {
          const n = k === '전체' ? all.length : all.filter((a) => a.cat === k).length;
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
                    {a.auto ? <span style={{ fontSize: 9.5, fontWeight: 800, color: '#fff', background: 'var(--violet)', borderRadius: 5, padding: '1px 5px', marginLeft: 5 }}>{a.auto}</span> : null}
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
                  <div className="mono" style={{ fontSize: 14, fontWeight: 800, whiteSpace: 'nowrap' }}>{TJ.won(val)}</div>
                  <div className="mono" style={{ fontSize: 10.5, color: 'var(--ink-4)', whiteSpace: 'nowrap' }}>{TJ.usdOnly(val)}</div>
                  {cost > 0 && hasQty && (
                    <div className="mono" style={{ fontSize: 11.5, fontWeight: 700, color: pl >= 0 ? 'var(--win)' : 'var(--loss)' }}>
                      {TJ.wonS(pl)} · {(cost ? (pl / cost) * 100 : 0).toFixed(1)}%
                    </div>
                  )}
                </div>
                {a.auto ? (
                  <div style={{ fontSize: 10, color: 'var(--ink-4)', textAlign: 'right', flex: 'none', lineHeight: 1.4 }}>
                    일지<br />연동
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 'none' }}>
                    <button onClick={() => setEdit(Object.assign({}, a, { qty: String(a.qty || ''), buyPrice: String(a.buyPrice || ''), price: String(a.price || ''), amount: String(a.amount || '') }))}
                      style={{ fontSize: 11, color: 'var(--ink-4)' }}>수정</button>
                    <button onClick={() => { if (confirm(a.name + ' 을(를) 지울까요?')) removeAsset(a.id); }}
                      style={{ fontSize: 11, color: 'var(--loss)' }}>삭제</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!edit && !shot && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn-ghost" onClick={() => fileRef.current && fileRef.current.click()} disabled={busy}
            style={{ flex: '1 1 190px', justifyContent: 'center', borderStyle: 'dashed', color: 'var(--ink-3)' }}>
            {busy ? 'AI가 읽는 중…' : '📷 스크린샷으로 추가'}
          </button>
          <button className="btn-ghost" onClick={() => setEdit(Object.assign({}, blank))}
            style={{ flex: '1 1 190px', justifyContent: 'center', borderStyle: 'dashed', color: 'var(--ink-3)' }}>
            ＋ 직접 추가
          </button>
          <input ref={fileRef} type="file" accept="image/*" multiple onChange={onFiles} style={{ display: 'none' }} />
        </div>
      )}
      {shotErr && <div style={{ fontSize: 12, color: 'var(--loss)', lineHeight: 1.6 }}>{shotErr}</div>}
      {/* 스윙을 자산에 어떻게 얹을지 — 기본은 '번 돈만'. 평소엔 접어 둔다(2026-08-09: 복잡하다는 지적). */}
      {onSwingMode && (
        <details style={{ fontSize: 11.5, color: 'var(--ink-4)' }}>
        <summary style={{ cursor: 'pointer' }}>스윙 계좌를 자산에 넣는 방식 바꾸기</summary>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginTop: 7 }}>
          {[['profit', '번 돈만'], ['account', '계좌 전체(시드 포함)']].map(([k, l]) => (
            <button key={k} className={'chip' + (swingMode === k ? ' on' : '')} onClick={() => onSwingMode(k)}
              style={{ fontSize: 11.5, padding: '4px 10px' }}>{l}</button>
          ))}
          <span style={{ flexBasis: '100%', lineHeight: 1.5 }}>
            스윙 시드를 이미 예금 자산으로 적어뒀다면 <b>번 돈만</b>이 맞습니다(두 번 세지 않게).
          </span>
        </div>
        </details>
      )}

      {!edit && !shot && (
        <div style={{ fontSize: 11, color: 'var(--ink-4)', lineHeight: 1.55 }}>
          증권사·거래소 보유목록을 찍어 올리면 종목·수량·평단을 읽어 자산으로 넣습니다.
          예금·부동산은 시세가 없으니 <b>직접 추가</b>로 금액만 적으세요.<br />장기 계좌 종목과 스윙 손익은 <b>일지에서 자동으로</b> 올라옵니다 — 여기 또 적지 마세요.
        </div>
      )}

      {/* ── 스크린샷에서 읽어낸 것 확인 ── */}
      {shot && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 14, padding: '13px 14px', background: 'var(--surface)' }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, marginBottom: 3 }}>읽어낸 {shot.length}개 — 맞는지 확인해 주세요</div>
          <div style={{ fontSize: 11, color: 'var(--ink-4)', marginBottom: 9, lineHeight: 1.5 }}>
            분류가 틀렸으면 눌러서 바꾸고, 뺄 것은 체크를 풀어주세요. 넣은 뒤에도 수정할 수 있습니다.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {shot.map((s) => (
              <div key={s._i} style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '9px 11px', opacity: s.on ? 1 : 0.45 }}>
                <input type="checkbox" checked={s.on} onChange={() => setShot(shot.map((x) => (x._i === s._i ? Object.assign({}, x, { on: !x.on }) : x)))} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {s.name}{s.symbol ? <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-4)', marginLeft: 5 }}>{s.symbol}</span> : null}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink-4)' }}>{s.qty}주 · 평단 {TJ.fmt(s.buyPrice, s.currency)}</div>
                  <div style={{ display: 'flex', gap: 5, marginTop: 5, flexWrap: 'wrap' }}>
                    {['주식_ETF', '암호화폐', '채권', '원자재', '기타'].map((k) => (
                      <button key={k} className={'chip' + (s.cat === k ? ' on' : '')}
                        onClick={() => setShot(shot.map((x) => (x._i === s._i ? Object.assign({}, x, { cat: k }) : x)))}
                        style={{ fontSize: 11, padding: '3px 9px' }}>{CAT(k).label}</button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn" style={{ flex: 1 }} disabled={!shot.some((s) => s.on)} onClick={addShots}>
              {shot.filter((s) => s.on).length}개 자산으로 넣기
            </button>
            <button className="btn-ghost" onClick={() => setShot(null)}>취소</button>
          </div>
        </div>
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

/** 자산 합계 — 홈 화면도 같은 값을 써야 해서 밖으로 뺀다(두 곳이 다른 값을 보이면 안 된다). */
function assetsTotal(list, quotes) {
  const priceOf = (sym) => {
    const s = String(sym || '').toUpperCase();
    const q = (quotes || {})[s] || (quotes || {})[s + '.KS'];
    return q ? Number(q.price) : null;
  };
  const total = (list || []).reduce((s, a) => s + assetValueUSD(a, priceOf), 0);
  const cost = (list || []).reduce((s, a) => s + assetCostUSD(a), 0);
  return { total, cost, pl: total - cost, count: (list || []).length };
}

Object.assign(window, { AssetsTab, ASSET_CATS, assetsTotal });
