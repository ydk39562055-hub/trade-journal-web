/* 거래일지 — 클라우드 동기화 (로그인 없는 "동기화 코드" 방식)
   - 데이터는 Supabase 함수(RPC)로만 접근. 테이블 직접 접근은 RLS로 차단됨.
   - sync_id(동기화 코드)를 아는 기기끼리만 같은 일지를 공유. 코드는 130bit 난수라 추측 불가.
   - publishable 키는 공개용(anon)이라 노출돼도 OK — 실제 보호는 코드 비밀성 + RPC 게이트. */
(function () {
  const SUPA_URL = 'https://oxogtsfxdjbctzehxvae.supabase.co';
  const SUPA_KEY = 'sb_publishable_3vXShFC5dKvMqzUy1KkyGQ_sF0SzUY2';
  const RPC = SUPA_URL + '/rest/v1/rpc/';
  const HEAD = { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json' };

  // 헷갈리는 글자(0 O 1 l I) 제외한 base용 문자
  const CS = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  function genCode() {
    const a = new Uint8Array(20); crypto.getRandomValues(a);
    let s = ''; for (const b of a) s += CS[b % CS.length];
    return s.replace(/(.{5})(?=.)/g, '$1-'); // 5자리마다 하이픈(가독성용, 저장 땐 제거)
  }
  const clean = c => (c || '').replace(/[^0-9A-Za-z]/g, '');

  async function rpc(fn, body) {
    const r = await fetch(RPC + fn, { method: 'POST', headers: HEAD, body: JSON.stringify(body) });
    if (!r.ok) throw new Error('sync/' + fn + ' ' + r.status + ' ' + (await r.text()).slice(0, 140));
    const txt = await r.text();
    return txt ? JSON.parse(txt) : null;
  }
  // → { data, updated_at } | null
  async function pull(code) {
    const rows = await rpc('sync_pull', { p_sync_id: clean(code) });
    return (Array.isArray(rows) && rows[0]) ? rows[0] : null;
  }
  // → updated_at (문자열)
  async function push(code, data) {
    return await rpc('sync_push', { p_sync_id: clean(code), p_data: data });
  }
  /* ── 자동 백업(스냅샷) ─────────────────────────────────────────────
     동기화는 '거울'이라 지운 것도 그대로 반영된다. 되돌리려면 지우기 전 상태가
     따로 남아야 해서, 하루 한 번 통째로 쌓아둔다(서버에서 20시간 제한·최근 14개 유지).
     서버 준비: supabase_snapshot_setup.sql 을 SQL Editor 에 한 번 실행. */
  async function snapPush(code, data) { return await rpc('snap_push', { p_sync_id: clean(code), p_data: data }); }
  async function snapList(code) { return await rpc('snap_list', { p_sync_id: clean(code) }); }
  async function snapGet(code, id) { return await rpc('snap_get', { p_sync_id: clean(code), p_id: id }); }

  window.TJSync = { genCode, clean, pull, push, snapPush, snapList, snapGet };
})();
