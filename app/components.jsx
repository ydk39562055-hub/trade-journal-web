/* 사진 확대 라이트박스 (전역) */
function openLightbox(src){
  const ov=document.createElement('div');
  ov.style.cssText='position:fixed;inset:0;z-index:200;background:rgba(20,16,12,.86);display:grid;place-items:center;padding:16px;cursor:zoom-out';
  const im=document.createElement('img'); im.src=src;
  im.style.cssText='max-width:96%;max-height:92vh;border-radius:12px;box-shadow:0 24px 60px rgba(0,0,0,.5)';
  ov.appendChild(im); ov.onclick=()=>ov.remove();
  document.body.appendChild(ov);
}
/* 거래일지 — 공용 컴포넌트 */
const { useEffect: useEffectCo, useRef: useRefCo, useState: useStateCo } = React;

/* ─── 모달 (오버레이 + 시트) ─── */
function Modal({ open, onClose, children, maxWidth = 560, title, sub, sheet }) {
  useEffectCo(() => {
    if (!open) return;
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open]);
  if (!open) return null;
  return (
    <div onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(28,24,49,.42)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: sheet ? 'flex-end' : 'center', justifyContent: 'center',
        padding: sheet ? 0 : '24px 16px', animation: 'fade-in .18s ease',
      }}>
      <div className="card" style={{
        width: '100%', maxWidth: sheet ? 560 : maxWidth,
        maxHeight: sheet ? '92vh' : '90vh', display: 'flex', flexDirection: 'column',
        borderRadius: sheet ? '22px 22px 0 0' : 'var(--r-xl)',
        boxShadow: 'var(--shadow-pop)', overflow: 'hidden',
        animation: (sheet ? 'rise' : 'pop-in') + ' .26s var(--ease)',
      }}>
        {(title || onClose) && (
          <div className="row" style={{ padding: '18px 20px 12px', gap: 12, flexShrink: 0 }}>
            <div style={{ flex: 1 }}>
              {title && <h2 style={{ fontSize: 18 }}>{title}</h2>}
              {sub && <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 2 }}>{sub}</div>}
            </div>
            <button onClick={onClose} aria-label="닫기" style={{
              width: 32, height: 32, borderRadius: 9, color: 'var(--ink-3)',
              fontSize: 20, display: 'grid', placeItems: 'center', flexShrink: 0,
            }} onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-tint)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>✕</button>
          </div>
        )}
        <div style={{ overflow: 'auto', padding: '0 20px 20px' }}>{children}</div>
      </div>
    </div>
  );
}

/* ─── 마켓 라벨 (중립 점 + 글자) ─── */
function MarketTag({ market }) {
  const f = market === '선물';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', flexShrink: 0 }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: f ? 'var(--futures)' : 'var(--spot)' }} />
      <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-2)' }}>{market}</span>
    </span>
  );
}

/* ─── 방향 (중립 텍스트) ─── */
function DirArrow({ dir }) {
  if (!dir) return null;
  const long = dir === 'long';
  return (
    <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-3)', whiteSpace: 'nowrap', flexShrink: 0 }}>
      {long ? '롱' : '숏'}
    </span>
  );
}

/* 작은 아이콘 버튼 */
function IconBtn({ onClick, title, danger, children }) {
  return (
    <button onClick={onClick} title={title} aria-label={title} style={{
      width: 28, height: 28, borderRadius: 8, display: 'grid', placeItems: 'center',
      color: danger ? 'var(--loss)' : 'var(--ink-3)', transition: 'background .14s, color .14s',
    }}
      onMouseEnter={e => { e.currentTarget.style.background = danger ? 'var(--loss-soft)' : 'var(--bg-tint)'; e.currentTarget.style.color = danger ? 'var(--loss)' : 'var(--ink)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = danger ? 'var(--loss)' : 'var(--ink-3)'; }}>
      {children}
    </button>
  );
}

/* ─── 일지 카드 ─── */
function EntryCard({ e, onEdit, onDelete, index }) {
  const [hov, setHov] = useStateCo(false);
  const rv = TJStats.num(e.realized_r);
  const pv = TJStats.num(e.pnl);
  const res = e.result && TJ.RESULT[e.result];
  const hasMoney = pv != null && pv !== 0;
  return (
    <div className="entry-card card" data-screen-label={`entry-${index}`} style={{
      padding: 'var(--card-pad)', display: 'flex', flexDirection: 'column', gap: 11,
      transition: 'box-shadow .18s, border-color .18s', position: 'relative',
    }}
      onMouseEnter={ev => { setHov(true); ev.currentTarget.style.boxShadow = 'var(--shadow-md)'; ev.currentTarget.style.borderColor = 'var(--border-strong)'; }}
      onMouseLeave={ev => { setHov(false); ev.currentTarget.style.boxShadow = 'var(--shadow-sm)'; ev.currentTarget.style.borderColor = 'var(--border)'; }}>

      {/* hover 액션 */}
      <div style={{ position: 'absolute', top: 11, right: 13, display: 'flex', gap: 12, opacity: hov ? 1 : 0, pointerEvents: hov ? 'auto' : 'none', transition: 'opacity .14s', background: 'var(--surface)', boxShadow: '-12px 0 10px 4px var(--surface)' }}>
        <button onClick={() => onEdit(e.id)} style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-3)' }}
          onMouseEnter={ev => ev.currentTarget.style.color = 'var(--ink)'} onMouseLeave={ev => ev.currentTarget.style.color = 'var(--ink-3)'}>수정</button>
        <button onClick={() => onDelete(e.id)} style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-3)' }}
          onMouseEnter={ev => ev.currentTarget.style.color = 'var(--loss)'} onMouseLeave={ev => ev.currentTarget.style.color = 'var(--ink-3)'}>삭제</button>
      </div>

      {/* head */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, paddingRight: 4 }}>
        <MarketTag market={e.market} />
        <DirArrow dir={e.direction} />
        <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--ink-4)', flexShrink: 0 }} />
        <span className="mono" style={{ fontSize: 12.5, color: 'var(--ink-3)', fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}>{e.traded_at}</span>
        {e.timeframe && (
          <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-2)', background: 'var(--bg-tint)', padding: '2px 7px', borderRadius: 6, whiteSpace: 'nowrap', flexShrink: 0 }}>{e.timeframe}</span>
        )}
        <div style={{ flex: 1, minWidth: 4 }} />
        {hasMoney ? (
          <span className="mono" style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)', whiteSpace: 'nowrap', flexShrink: 0, letterSpacing: '-.01em' }}>
            {pv >= 0 ? '+' : '−'}${Math.abs(Math.round(pv)).toLocaleString('en-US')}
          </span>
        ) : (res && <span className={`resbadge ${res.cls}`} style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>{res.ko}</span>)}
        {rv != null && rv !== 0 && (
          <span className="mono" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-3)', whiteSpace: 'nowrap', flexShrink: 0 }}>
            {rv > 0 ? '+' : ''}{rv}R
          </span>
        )}
      </div>

      {/* body */}
      {e.body && <div style={{ fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.62, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{e.body}</div>}

      {/* photos */}
      {e.photos?.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {e.photos.map((p, i) => <img key={i} src={p} onClick={() => openLightbox(p)} style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 9, border: '1px solid var(--border)', cursor: 'zoom-in' }} />)}
        </div>
      )}

      {/* tags */}
      {(e.setups?.length || e.errors?.length) ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {(e.setups || []).map(t => <span key={t} className="chip static setup">{t}</span>)}
          {(e.errors || []).map(t => <span key={t} className="chip static err">{t}</span>)}
        </div>
      ) : null}
    </div>
  );
}

/* ─── KPI 작은 카드 ─── */
function KPI({ label, value, sub, accent, big }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)',
      padding: big ? '16px 18px' : '13px 15px', display: 'flex', flexDirection: 'column', gap: 3,
      boxShadow: 'var(--shadow-sm)',
    }}>
      <div style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 600 }}>{label}</div>
      <div className="mono" style={{ fontSize: big ? 26 : 20, fontWeight: 800, lineHeight: 1.1, color: 'var(--ink)' }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: 'var(--ink-3)', fontWeight: 500 }}>{sub}</div>}
    </div>
  );
}

/* ─── 통계 행 ─── */
function StatRow({ label, children, last }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: last ? 'none' : '1px solid var(--border)' }}>
      <span style={{ fontSize: 13.5, color: 'var(--ink-2)' }}>{label}</span>
      <span className="mono" style={{ fontSize: 14, fontWeight: 700 }}>{children}</span>
    </div>
  );
}

/* ─── 섹션 제목 ─── */
function SectionTitle({ children, style }) {
  return <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-3)', letterSpacing: '.04em', textTransform: 'uppercase', margin: '22px 0 10px', ...style }}>{children}</h3>;
}

/* ─── 세그먼트 ─── */
function Segmented({ value, options, onChange, accent, style }) {
  return (
    <div className={'seg' + (accent ? ' accent' : '')} style={style}>
      {options.map(o => (
        <button key={o.v} className={value === o.v ? 'on' : ''} onClick={() => onChange(o.v)}>{o.label}</button>
      ))}
    </div>
  );
}

Object.assign(window, { Modal, EntryCard, KPI, StatRow, SectionTitle, Segmented, MarketTag, DirArrow });
