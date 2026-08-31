(function () {
  function applyLateFormatter() {
    if (window.__eventAccountingLateFormatterLoading) return;
    window.__eventAccountingLateFormatterLoading = true;
    const script = document.createElement('script');
    script.src = 'assets/domain.js?v=20260831-02-late';
    script.onload = function () { window.__eventAccountingLateFormatterLoaded = true; };
    document.body.appendChild(script);
  }

  if (document.readyState === 'complete') applyLateFormatter();
  else window.addEventListener('load', applyLateFormatter, { once: true });
})();
