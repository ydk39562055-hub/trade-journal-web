/* 거래일지 — 통계 계산 (순수 로직) */
(function () {
  const num = v => (v != null && v !== '' && !isNaN(Number(v))) ? Number(v) : null;

  function computeStats(entries, market) {
    const pool = entries.filter(e => market === 'all' || e.market === market);
    const closed = pool.filter(e => ['win', 'loss', 'be'].includes(e.result));
    const wins = closed.filter(e => e.result === 'win').length;
    const losses = closed.filter(e => e.result === 'loss').length;
    const bes = closed.filter(e => e.result === 'be').length;
    const decisive = wins + losses;
    const winRate = decisive ? (wins / decisive) * 100 : 0;

    const rs = pool.map(e => num(e.realized_r)).filter(v => v != null);
    const sumR = rs.reduce((a, b) => a + b, 0);
    const avgR = rs.length ? sumR / rs.length : 0;
    const posR = rs.filter(r => r > 0).reduce((a, b) => a + b, 0);
    const negR = Math.abs(rs.filter(r => r < 0).reduce((a, b) => a + b, 0));
    const pf = negR ? posR / negR : (posR > 0 ? Infinity : 0);

    const pls = pool.map(e => num(e.pnl)).filter(v => v != null);
    const sumP = pls.reduce((a, b) => a + b, 0);
    const avgP = pls.length ? sumP / pls.length : 0;
    const best = pls.length ? Math.max(...pls) : 0;
    const worst = pls.length ? Math.min(...pls) : 0;
    const winP = pls.filter(v => v > 0), lossP = pls.filter(v => v < 0);
    const avgWin = winP.length ? winP.reduce((a, b) => a + b, 0) / winP.length : 0;
    const avgLoss = lossP.length ? Math.abs(lossP.reduce((a, b) => a + b, 0) / lossP.length) : 0;
    const payoff = avgLoss ? avgWin / avgLoss : (avgWin > 0 ? Infinity : 0);

    const chrono = [...pool].sort((a, b) =>
      (a.traded_at || '').localeCompare(b.traded_at || '') ||
      (a.created_at || '').localeCompare(b.created_at || ''));
    const useMoney = pls.length > 0;

    // equity curve points
    let cum = 0;
    const curve = chrono.map(e => {
      const v = useMoney ? num(e.pnl) : num(e.realized_r);
      if (v != null) cum += v;
      return { label: (e.traded_at || '').slice(5), value: Math.round(cum * 100) / 100 };
    });

    // MDD
    let peak = -Infinity, mdd = 0;
    for (const p of curve) { if (p.value > peak) peak = p.value; const dd = peak - p.value; if (dd > mdd) mdd = dd; }

    // streaks
    const closedChrono = chrono.filter(e => ['win', 'loss'].includes(e.result));
    let maxW = 0, maxL = 0, cw = 0, cl = 0, curStreak = 0, curType = null;
    for (const e of closedChrono) {
      if (e.result === 'win') { cw++; cl = 0; } else { cl++; cw = 0; }
      if (cw > maxW) maxW = cw; if (cl > maxL) maxL = cl;
    }
    // current streak (from end)
    for (let i = closedChrono.length - 1; i >= 0; i--) {
      const r = closedChrono[i].result;
      if (curType == null) { curType = r; curStreak = 1; }
      else if (r === curType) curStreak++;
      else break;
    }

    const dirStat = d => {
      const c = pool.filter(e => e.direction === d);
      const cd = c.filter(e => ['win', 'loss'].includes(e.result));
      const w = cd.filter(e => e.result === 'win').length;
      const p = c.map(e => num(e.pnl)).filter(v => v != null).reduce((a, b) => a + b, 0);
      return { n: c.length, wr: cd.length ? Math.round(w / cd.length * 100) : null, p };
    };
    const long = dirStat('long'), short = dirStat('short');

    // monthly
    const byMonth = {};
    for (const e of pool) { const m = (e.traded_at || '').slice(0, 7); const v = num(e.pnl); if (!m || v == null) continue; byMonth[m] = (byMonth[m] || 0) + v; }
    const months = Object.entries(byMonth).sort((a, b) => a[0].localeCompare(b[0])).map(([m, v]) => ({ label: m.slice(5) + '월', value: v }));

    // tag stats
    const tagAgg = (field) => {
      const agg = {};
      for (const e of pool) for (const t of (e[field] || [])) {
        const s = agg[t] = agg[t] || { n: 0, w: 0, l: 0, p: 0 };
        s.n++; if (e.result === 'win') s.w++; if (e.result === 'loss') s.l++;
        const pv = num(e.pnl); if (pv != null) s.p += pv;
      }
      return Object.entries(agg).map(([t, s]) => ({ tag: t, ...s, wr: (s.w + s.l) ? Math.round(s.w / (s.w + s.l) * 100) : null }))
        .sort((a, b) => b.n - a.n);
    };
    const setupStats = tagAgg('setups');
    const errorStats = tagAgg('errors');

    // 타임프레임별 (단일 필드)
    const tfAgg = {};
    for (const e of pool) {
      const tf = e.timeframe; if (!tf) continue;
      const ts = tfAgg[tf] = tfAgg[tf] || { n: 0, w: 0, l: 0, p: 0 };
      ts.n++; if (e.result === 'win') ts.w++; if (e.result === 'loss') ts.l++;
      const pv = num(e.pnl); if (pv != null) ts.p += pv;
    }
    const TF_ORDER = ['1M', '3M', '5M', '15M', '1H', '4H'];
    const tfStats = TF_ORDER.filter(tf => tfAgg[tf]).map(tf => ({ tag: tf, ...tfAgg[tf], wr: (tfAgg[tf].w + tfAgg[tf].l) ? Math.round(tfAgg[tf].w / (tfAgg[tf].w + tfAgg[tf].l) * 100) : null }));

    const clean = closed.filter(e => !(e.errors && e.errors.length)).length;
    const adherence = closed.length ? Math.round(clean / closed.length * 100) : null;

    // 등급별 (선물 — 등급 체계 검증)
    const GRADE_ORDER = ['A+', 'B', 'C', '—'];
    const gradeAgg = {};
    for (const e of pool) {
      const g = e.grade; if (!g) continue;
      const gs = gradeAgg[g] = gradeAgg[g] || { n: 0, w: 0, l: 0, p: 0, rs: [] };
      gs.n++; if (e.result === 'win') gs.w++; if (e.result === 'loss') gs.l++;
      const pv = num(e.pnl); if (pv != null) gs.p += pv;
      const rv = num(e.realized_r); if (rv != null) gs.rs.push(rv);
    }
    const gradeStats = GRADE_ORDER.filter(g => gradeAgg[g]).map(g => {
      const gs = gradeAgg[g]; const sumr = gs.rs.reduce((a, b) => a + b, 0);
      return { tag: g, n: gs.n, w: gs.w, l: gs.l, p: gs.p,
        wr: (gs.w + gs.l) ? Math.round(gs.w / (gs.w + gs.l) * 100) : null,
        avgR: gs.rs.length ? Math.round(sumr / gs.rs.length * 100) / 100 : null,
        sumR: Math.round(sumr * 100) / 100 };
    });

    return {
      pool, closed, wins, losses, bes, decisive, winRate,
      rs, sumR, avgR, pf, pls, sumP, avgP, best, worst, avgWin, avgLoss, payoff,
      curve, useMoney, mdd, maxW, maxL, curStreak, curType,
      long, short, months, setupStats, errorStats, tfStats, gradeStats, adherence,
      hasAny: closed.length || rs.length || pls.length,
    };
  }

  // 잔고 계산
  function balanceOf(entries, market, seed, deposit) {
    const pnl = entries.filter(e => e.market === market)
      .reduce((a, e) => { const v = num(e.pnl); return a + (v || 0); }, 0);
    const s = num(seed);
    const dep = num(deposit) || 0;            // 추가 입금 누계
    const base = (s || 0) + dep;              // 투입 원금 = 시드 + 입금
    return { seed: s, deposit: dep, base, pnl, bal: base + pnl, ret: base ? pnl / base * 100 : null };
  }

  // 누적 곡선을 마켓별(선물/현물)로 분리
  function curveSplit(pool) {
    const all = [...pool].sort((a, b) =>
      (a.traded_at || '').localeCompare(b.traded_at || '') ||
      (a.created_at || '').localeCompare(b.created_at || ''));
    const useMoney = all.some(e => num(e.pnl) != null);
    const present = [...new Set(all.map(e => e.market))];
    const cum = {}, data = {};
    present.forEach(m => { cum[m] = 0; data[m] = []; });
    for (const e of all) {
      const v = useMoney ? num(e.pnl) : num(e.realized_r);
      if (v == null) continue;
      cum[e.market] += v;
      const lab = (e.traded_at || '').slice(5);
      present.forEach(m => data[m].push({ label: lab, value: Math.round(cum[m] * 100) / 100 }));
    }
    const COL = { '선물': 'var(--futures)', '현물': 'var(--spot)' };
    const series = present.filter(m => data[m].length > 1)
      .map(m => ({ name: m, color: COL[m] || 'var(--violet)', points: data[m] }));
    return { useMoney, series };
  }

  window.TJStats = { computeStats, balanceOf, curveSplit, num };
})();
