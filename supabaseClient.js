window.SUPABASE_CONFIG = Object.freeze({
  url: 'https://xtagvyyopokrhvvnseom.supabase.co',
  publishableKey: 'sb_publishable_G32XGo5ldXGO4TvqImNdSw_3-6_08LE'
});

(() => {
  const href = 'csc-live-theme.css?v=20260603-csc-live-theme-v1';
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
})();
