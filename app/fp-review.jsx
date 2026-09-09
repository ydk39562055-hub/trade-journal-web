const fpNum = value => typeof value === 'number' && Number.isFinite(value)
  ? value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 5 })
  : '미확정';
function FpReview({ review }) {
  const r = review?.priceR;
  const hasR = typeof r === 'number' && Number.isFinite(r);
  const rText = hasR ? `${r > 0 ? '+' : ''}${r.toFixed(2)}R` : review?.reason === 'position_open' ? '보유 중' : '미확정';
  return <section className="fp-levels" aria-label="진입 SL TP 실현 R">
    <dl className="fp-levels-grid">
      <div><dt>진입가</dt><dd>{fpNum(review?.entryPrice)}</dd></div>
      <div className="fp-level-sl"><dt>SL · 손절가</dt><dd>{fpNum(review?.initialStop)}</dd></div>
      <div className="fp-level-tp"><dt>TP · 익절가</dt><dd>{fpNum(review?.initialTarget)}</dd></div>
      <div className={hasR ? r > 0 ? 'fp-level-positive' : r < 0 ? 'fp-level-negative' : '' : ''}><dt>실현 R</dt><dd>{rText}</dd></div>
    </dl>
    <p className="fp-levels-note">최초 진입·SL·TP 기준 · R은 분할 청산을 합산한 비용 차감 전 결과</p>
  </section>;
}
window.FpReview = FpReview;
