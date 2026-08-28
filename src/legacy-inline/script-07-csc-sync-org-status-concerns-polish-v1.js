(() => {
  if (window.__cscOrgStatusConcernsPolishV1) return;
  window.__cscOrgStatusConcernsPolishV1 = true;

  const STYLE_ID = 'csc-sync-org-status-concerns-polish-style-v1';
  let orgPolishTimer = 0;

    function injectStyle() {
    document.getElementById('csc-sync-concerns-database-bridge-style-v1')?.remove();
  }

  function init() {
    injectStyle();
    syncPolish();
    ['click', 'input', 'change', 'toggle'].forEach((type) => {
      document.addEventListener(type, () => {
        scheduleSync(0);
        scheduleSync(120);
      }, true);
    });
    new MutationObserver(() => scheduleSync()).observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['open', 'hidden', 'class', 'value']
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
