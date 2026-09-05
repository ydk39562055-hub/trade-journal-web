(function () {
  let pending;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); pending = e; });
  window.addEventListener('appinstalled', () => { pending = null; });
  window.TJPWA = {
    async install() {
      if (matchMedia('(display-mode: standalone)').matches) { alert('이미 앱으로 열려 있어요.'); return; }
      if (pending) { const prompt = pending; pending = null; await prompt.prompt(); return; }
      alert(/iPad|iPhone|iPod/.test(navigator.userAgent)
        ? 'Safari에서 이 거래일지를 열고 공유 버튼 → 홈 화면에 추가를 눌러 주세요.'
        : 'Chrome에서 이 거래일지를 열고 메뉴(⋮) → 홈 화면에 추가 또는 앱 설치를 눌러 주세요.');
    },
  };
  if ('serviceWorker' in navigator) window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => {});
  });
})();
