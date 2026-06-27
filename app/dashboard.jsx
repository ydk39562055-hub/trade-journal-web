/* 거래일지 — 통계 대시보드 모달 */
const { useState: useStateD } = React;

function DashboardModal({ entries, market: initMarket, useMoneyDefault, onClose }) {
  // 선물·현물 완전 분리 — 통계도 한 시장만(합산 '전체' 없음)
  const [mkt, setMkt] = useStateD(initMarket === '현물' ? '현물' : '선물');
  const s = TJStats.computeStats(entries, mkt);
  const money = s.useMoney;
  const fnum = n => (n === Infinity ? '∞' : Math.round(n * 100) / 100);

  return (
    <Modal open onClose={onClose} maxWidth={620}
      title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>통계 대시보드</span>}
      sub="입력한 결과·R·손익 기준으로 자동 집계됩니다">
      <Segmented value={mkt} onChange={setMkt} style={{ width: '100%', marginBottom: 4 }}
        options={[{ v: '선물', label: '선물' }, { v: '현물', label: '현물' }]} />

      {!s.hasAny ? (
        <div style={{ color: 'var(--ink-3)', textAlign: 'center', padding: '40px 0', fontSize: 14 }}>
          {mkt === 'all' ? '전체' : mkt}에 결과를 입력한 거래가 없어요.
        </div>
      ) : (
        <div>
          {/* 핵심 KPI + 도넛 */}
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', margin: '18px 0 8px', flexWrap: 'wrap' }}>
            <WinDonut win={s.wins} loss={s.losses} be={s.bes} size={124} />
            <div style={{ flex: 1, minWidth: 180, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
              <KPI label="마감 거래" value={`${s.closed.length}건`} sub={`익 ${s.wins} · 손 ${s.losses} · 본 ${s.bes}`} />
              <KPI label="누적 손익" value={money ? fmtMoney(s.sumP, true) : fmtR(s.sumR)} accent={(money ? s.sumP : s.sumR) >= 0 ? 'var(--win)' : 'var(--loss)'} />
              <KPI label="손익비 (PF)" value={fnum(s.pf)} sub={s.pf >= 1.5 ? '양호' : s.pf >= 1 ? '보통' : '개선 필요'} />
              <KPI label="기댓값" value={money ? fmtMoney(s.avgP, true) : fmtR(s.avgR)} sub="/ 거래" />
            </div>
          </div>

          {/* 자본 곡선 */}
          {(() => {
            const split = TJStats.curveSplit(s.pool);
            const multi = split.series.length > 1;
            if (!split.series.length) return null;
            return (
              <>
                <SectionTitle>누적 손익 곡선 ({money ? '금액' : 'R'})</SectionTitle>
                <div className="card" style={{ padding: 14 }}>
                  {multi && (
                    <div style={{ display: 'flex', gap: 14, marginBottom: 4, justifyContent: 'flex-end' }}>
                      {split.series.map(se => (
                        <span key={se.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--ink-3)', fontWeight: 600 }}>
                          <span style={{ width: 9, height: 3, borderRadius: 2, background: se.color }} />{se.name}
                        </span>
                      ))}
                    </div>
                  )}
                  <EquityCurve series={multi ? split.series : null} points={!multi ? split.series[0].points : null} money={split.useMoney} height={156} />
                </div>
              </>
            );
          })()}

          {/* R 분포 */}
          {s.rs.length > 0 && (
            <>
              <SectionTitle>R 분포</SectionTitle>
              <div className="card" style={{ padding: '16px 16px 12px' }}>
                <RDistribution rs={s.rs} />
              </div>
            </>
          )}

          {/* 등급별 성과 */}
          {s.gradeStats.length > 0 && (
            <>
              <SectionTitle>등급별 성과 (등급 체계가 작동하나)</SectionTitle>
              <GradeTable rows={s.gradeStats} />
            </>
          )}

          {/* 자세한 지표 */}
          <SectionTitle>상세 지표</SectionTitle>
          <div className="card" style={{ padding: '4px 16px' }}>
            <StatRow label="승률 (익 / 익+손)"><span style={{ color: 'var(--ink)' }}>{Math.round(s.winRate)}%</span></StatRow>
            {money && <StatRow label="최고 익절 / 최대 손실"><span style={{ fontSize: 12.5 }}><span className="pos">+{fmtMoney(s.best)}</span> / <span className="neg">−{fmtMoney(Math.abs(s.worst))}</span></span></StatRow>}
            {money && <StatRow label="평균 익절 / 평균 손절"><span style={{ fontSize: 12.5 }}>+{fmtMoney(s.avgWin)} / −{fmtMoney(s.avgLoss)} · {fnum(s.payoff)}</span></StatRow>}
            <StatRow label="누적 R · 평균 R">{(s.sumR > 0 ? '+' : '') + fnum(s.sumR)}R · {(s.avgR > 0 ? '+' : '') + fnum(s.avgR)}R</StatRow>
            <StatRow label="최대 연승 / 연패"><span><span className="pos">{s.maxW}</span> / <span className="neg">{s.maxL}</span></span></StatRow>
            <StatRow label="최대 낙폭 (MDD)"><span className="neg">{money ? '−' + fmtMoney(s.mdd) : '−' + fnum(s.mdd) + 'R'}</span></StatRow>
            {s.adherence != null && <StatRow label="규칙 준수율 (실수 0)" last><span style={{ color: 'var(--ink)' }}>{s.adherence}%</span></StatRow>}
          </div>

          {/* 방향별 */}
          {(s.long.n || s.short.n) > 0 && (
            <>
              <SectionTitle>방향별 손익</SectionTitle>
              <div className="card" style={{ padding: '16px' }}>
                <HBars rows={[{ label: '롱', value: s.long.p }, { label: '숏', value: s.short.p }]} />
                <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 12, color: 'var(--ink-3)' }}>
                  <span>롱 {s.long.n}건 · 승률 {s.long.wr ?? '–'}%</span>
                  <span>숏 {s.short.n}건 · 승률 {s.short.wr ?? '–'}%</span>
                </div>
              </div>
            </>
          )}

          {/* 월별 */}
          {s.months.length > 0 && (
            <>
              <SectionTitle>월별 손익</SectionTitle>
              <div className="card" style={{ padding: '16px' }}>
                <HBars rows={s.months} />
              </div>
            </>
          )}

          {/* 타임프레임별 */}
          {s.tfStats.length > 0 && (
            <>
              <SectionTitle>타임프레임별 (몇 분봉이 잘 맞나)</SectionTitle>
              <TagTable rows={s.tfStats} money={money} />
            </>
          )}

          {/* 셋업별 */}
          {s.setupStats.length > 0 && (
            <>
              <SectionTitle>셋업별 (어떤 셋업이 잘 되나)</SectionTitle>
              <TagTable rows={s.setupStats} money={money} />
            </>
          )}

          {/* 실수별 */}
          {s.errorStats.length > 0 && (
            <>
              <SectionTitle>실수 태그별 (약점)</SectionTitle>
              <TagTable rows={s.errorStats} money={money} warn />
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

function TagTable({ rows, money, warn }) {
  return (
    <div className="card" style={{ padding: '4px 16px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 10, fontSize: 11.5, color: 'var(--ink-4)', fontWeight: 700, padding: '10px 0 8px', borderBottom: '1px solid var(--border)', textTransform: 'uppercase', letterSpacing: '.03em' }}>
        <span>태그</span><span style={{ textAlign: 'right', minWidth: 36 }}>건수</span><span style={{ textAlign: 'right', minWidth: 44 }}>승률</span><span style={{ textAlign: 'right', minWidth: 66 }}>손익</span>
      </div>
      {rows.map((r, i) => (
        <div key={r.tag} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 10, alignItems: 'center', padding: '11px 0', borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none' }}>
          <span style={{ fontSize: 13 }}>
            <span className={'chip static ' + (warn ? 'err' : 'setup')} style={{ padding: '3px 9px', fontSize: 12 }}>{r.tag}</span>
          </span>
          <span className="mono" style={{ textAlign: 'right', fontSize: 13, fontWeight: 700 }}>{r.n}</span>
          <span className="mono" style={{ textAlign: 'right', fontSize: 13, color: 'var(--ink-2)' }}>{r.wr == null ? '–' : r.wr + '%'}</span>
          <span className="mono" style={{ textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{r.p >= 0 ? '+' : '−'}${Math.abs(Math.round(r.p)).toLocaleString('en-US')}</span>
        </div>
      ))}
    </div>
  );
}

/* 등급별 성과 표 (등급 배지 + 평균R) */
function GradeTable({ rows }) {
  const col = g => g === 'A+' ? 'var(--win)' : g === 'B' ? 'var(--violet)' : g === '—' ? 'var(--ink-4)' : 'var(--loss)';
  const hcol = { textAlign: 'right' };
  return (
    <div className="card" style={{ padding: '4px 16px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto auto', gap: 10, fontSize: 11.5, color: 'var(--ink-4)', fontWeight: 700, padding: '10px 0 8px', borderBottom: '1px solid var(--border)', textTransform: 'uppercase', letterSpacing: '.03em' }}>
        <span>등급</span><span style={hcol}>건수</span><span style={hcol}>승률</span><span style={hcol}>평균R</span><span style={{ ...hcol, minWidth: 66 }}>손익</span>
      </div>
      {rows.map((r, i) => (
        <div key={r.tag} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto auto', gap: 10, alignItems: 'center', padding: '11px 0', borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none' }}>
          <span><span className="mono" style={{ fontWeight: 800, color: '#fff', background: col(r.tag), padding: '2px 9px', borderRadius: 6, fontSize: 12.5 }}>{r.tag}</span></span>
          <span className="mono" style={{ textAlign: 'right', fontSize: 13, fontWeight: 700 }}>{r.n}</span>
          <span className="mono" style={{ textAlign: 'right', fontSize: 13, color: 'var(--ink-2)' }}>{r.wr == null ? '–' : r.wr + '%'}</span>
          <span className="mono" style={{ textAlign: 'right', fontSize: 13, fontWeight: 700, color: r.avgR == null ? 'var(--ink-4)' : r.avgR >= 0 ? 'var(--win)' : 'var(--loss)' }}>{r.avgR == null ? '–' : (r.avgR > 0 ? '+' : '') + r.avgR + 'R'}</span>
          <span className="mono" style={{ textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{r.p >= 0 ? '+' : '−'}${Math.abs(Math.round(r.p)).toLocaleString('en-US')}</span>
        </div>
      ))}
    </div>
  );
}

Object.assign(window, { DashboardModal });
