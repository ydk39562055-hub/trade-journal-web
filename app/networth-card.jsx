/* 홈 맨 위 '내 전 재산' 카드.

   ★ 2026-08-09 사용자 지적: "지금 보면 내 자산이 얼마인지 전혀 알 수 없는 상태이고,
     수익이 난 것만 메인에 표시되고 있는데, 전체 자산을 모르니 답답해."
   → 홈에서 제일 먼저 보이는 자리에 **총자산 한 줄**을 놓는다. 수익보다 자산이 먼저다.

   아직 아무것도 안 적었으면 숫자 대신 **바로 적을 수 있는 칸**을 띄운다.
   빈 화면에 0원만 띄워두면 어디서 시작할지 몰라 그대로 방치된다. */

function NetWorthCard({ total, pl, cost, count, autoCount, onOpen, onQuickAdd }) {
  const [quick, setQuick] = React.useState(null);   // {예금, 부동산, 기타}
  const empty = !count;

  const start = () => setQuick({ 예금: '', 부동산: '', 기타: '' });
  const submit = () => {
    const rows = [
      ['예금', '현금_예금', '예금·현금'],
      ['부동산', '부동산', '집·부동산'],
      ['기타', '기타', '그 밖의 자산'],
    ];
    let n = 0;
    rows.forEach(([k, cat, label]) => {
      const v = Number(quick[k]);
      if (v > 0) { onQuickAdd({ name: label, cat, amount: v, currency: '₩', qty: 0, buyPrice: 0, price: 0, symbol: '' }); n++; }
    });
    setQuick(null);
    if (!n) return;
  };

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '15px 17px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-3)' }}>내 전 재산</div>
        <button onClick={onOpen} style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--violet-600)', fontWeight: 700 }}>자산 관리 ›</button>
      </div>

      {empty ? (
        <React.Fragment>
          <div style={{ fontSize: 13.5, color: 'var(--ink-2)', marginTop: 7, lineHeight: 1.65 }}>
            아직 자산을 안 적으셨어요. <b>예금·집 금액만 적으면</b> 전 재산이 바로 나옵니다.
            <div style={{ fontSize: 11.5, color: 'var(--ink-4)', marginTop: 3 }}>
              주식·코인은 일지(장기)와 보유현황에서 자동으로 올라옵니다 — 여기 안 적어도 됩니다.
            </div>
          </div>
          {!quick ? (
            <button className="btn" onClick={start} style={{ width: '100%', justifyContent: 'center', marginTop: 11 }}>
              30초만에 채우기
            </button>
          ) : (
            <div style={{ marginTop: 11 }}>
              {[['예금', '예금·현금 (원)'], ['부동산', '집·부동산 (원)'], ['기타', '그 밖의 자산 (원)']].map(([k, label]) => (
                <div key={k} style={{ marginBottom: 8 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-3)', display: 'block', marginBottom: 4 }}>{label}</label>
                  <input type="number" inputMode="decimal" value={quick[k]} placeholder="0"
                    onChange={(e) => setQuick(Object.assign({}, quick, { [k]: e.target.value }))} />
                </div>
              ))}
              <div style={{ fontSize: 11, color: 'var(--ink-4)', lineHeight: 1.5, marginBottom: 9 }}>
                대충 적어도 됩니다 — 나중에 자산 탭에서 이름·금액을 고칠 수 있어요.
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn" style={{ flex: 1 }} onClick={submit}>저장</button>
                <button className="btn-ghost" onClick={() => setQuick(null)}>취소</button>
              </div>
            </div>
          )}
        </React.Fragment>
      ) : (
        <React.Fragment>
          <div className="mono" style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1.25, marginTop: 2 }}>
            {TJ.won(total)}
          </div>
          <div className="mono" style={{ fontSize: 12.5, color: 'var(--ink-4)', marginTop: -2 }}>{TJ.usdOnly(total)}</div>
          <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', marginTop: 5, alignItems: 'center' }}>
            {cost > 0 && (
              <span className="mono" style={{ fontSize: 13, fontWeight: 700, color: pl >= 0 ? 'var(--win)' : 'var(--loss)' }}>
                {TJ.wonS(pl)} · {(cost ? (pl / cost) * 100 : 0).toFixed(1)}%
              </span>
            )}
            <span style={{ fontSize: 11.5, color: 'var(--ink-4)' }}>
              {count}개 자산{autoCount ? ' · 일지에서 ' + autoCount + '개 자동' : ''}
            </span>
          </div>
        </React.Fragment>
      )}
    </div>
  );
}

Object.assign(window, { NetWorthCard });
