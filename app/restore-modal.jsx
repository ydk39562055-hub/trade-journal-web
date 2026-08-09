/* 되돌리기 — 서버에 하루 한 번 자동으로 쌓인 백업 중 하나를 골라 그때로 되돌린다.

   ★ 2026-08-09 사용자 요청: "백업 자동으로 하던가 뭐 그런".
     수동 백업(파일 내려받기)은 사람이 눌러야 해서 결국 안 하게 된다.
     동기화가 켜져 있으면 앱을 열 때 그날 상태를 서버에 통째로 쌓아두고(하루 한 번),
     여기서 날짜를 골라 되돌린다. 사용자가 평소에 할 일은 없다.

   ⚠ 동기화는 '거울'이라 지운 것도 서버에 반영된다. 그래서 지우기 전 상태를 따로 쌓는 것이다.
   ⚠ 되돌리기 전에 지금 상태를 백업 파일로 먼저 내려받는다(되돌리기를 또 되돌릴 수 있게). */

function RestoreModal({ syncId, onRestore, onBackupNow, onClose }) {
  const [list, setList] = React.useState(null);      // null=불러오는 중, []=없음
  const [err, setErr] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    if (!syncId || !window.TJSync || !TJSync.snapList) { setList([]); return; }
    TJSync.snapList(syncId)
      .then((rows) => { if (alive) setList(Array.isArray(rows) ? rows : []); })
      .catch((e) => {
        if (!alive) return;
        setList([]);
        setErr(String(e.message || e).indexOf('404') >= 0 || String(e.message || e).indexOf('snap_list') >= 0
          ? '서버에 자동 백업이 아직 준비되지 않았습니다 — supabase_snapshot_setup.sql 을 한 번 실행해 주세요.'
          : '목록을 못 불러왔습니다: ' + e.message);
      });
    return () => { alive = false; };
  }, [syncId]);

  const when = (iso) => {
    const d = new Date(iso);
    const days = Math.floor((Date.now() - d.getTime()) / 86400000);
    const label = d.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    return label + (days <= 0 ? ' (오늘)' : ` (${days}일 전)`);
  };

  const doRestore = async (row) => {
    if (!confirm(when(row.created_at) + ' 상태로 되돌립니다.\n\n지금 화면의 내용은 그 시점 것으로 바뀝니다.\n안전을 위해 지금 상태를 백업 파일로 먼저 받아둡니다.\n\n계속할까요?')) return;
    setBusy(true); setErr('');
    try {
      if (onBackupNow) onBackupNow();                       // 되돌리기 전 지금 상태를 파일로
      const blob = await TJSync.snapGet(syncId, row.id);
      if (!blob) throw new Error('그 시점 내용을 못 받았습니다');
      onRestore(blob);
    } catch (e) { setErr('되돌리기 실패: ' + e.message); }
    setBusy(false);
  };

  return (
    <Modal open onClose={onClose} title="되돌리기" sub="자동으로 쌓인 백업 중에서 고릅니다 (최근 14개)" maxWidth={440}>
      {!syncId ? (
        <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.7 }}>
          <b>동기화가 꺼져 있습니다.</b><br />
          자동 백업은 동기화를 켜야 돌아갑니다. 설정에서 동기화를 켜면 앱을 열 때마다
          하루 한 번 서버에 그날 상태가 저장되고, 여기서 날짜를 골라 되돌릴 수 있습니다.
        </div>
      ) : list === null ? (
        <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>불러오는 중…</div>
      ) : list.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.7 }}>
          아직 쌓인 자동 백업이 없습니다.<br />
          <span style={{ color: 'var(--ink-4)', fontSize: 12 }}>
            앱을 열어둔 채 잠시 기다리면 오늘 것이 저장됩니다. 하루에 한 번만 쌓입니다.
          </span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {list.map((row) => (
            <div key={row.id} style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{when(row.created_at)}</div>
                <div style={{ fontSize: 11, color: 'var(--ink-4)' }}>{Math.round((row.bytes || 0) / 1024).toLocaleString()} KB</div>
              </div>
              <button className="btn-ghost btn-sm" disabled={busy} onClick={() => doRestore(row)}
                style={{ padding: '6px 12px', fontSize: 12.5, flexShrink: 0 }}>이때로</button>
            </div>
          ))}
        </div>
      )}

      {err && <div style={{ fontSize: 12, color: 'var(--loss)', marginTop: 11, lineHeight: 1.6 }}>{err}</div>}

      <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 13, lineHeight: 1.6 }}>
        하루에 한 번, 앱을 열 때 자동으로 쌓입니다(최근 14개 유지). 되돌리기 전에는 지금 상태를
        백업 파일로 먼저 받아두므로, 되돌린 것을 또 되돌릴 수 있습니다.
      </div>
    </Modal>
  );
}

Object.assign(window, { RestoreModal });
