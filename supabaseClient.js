window.SUPABASE_CONFIG = Object.freeze({
  url: 'https://xtagvyyopokrhvvnseom.supabase.co',
  publishableKey: 'sb_publishable_G32XGo5ldXGO4TvqImNdSw_3-6_08LE'
});

(() => {
  const href = 'csc-live-theme.css?v=20260603-connect-theme-v2';
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
})();

(() => {
  const fullName = 'Centralized Organization Network for News, Events, Communication, & Timely Updates';

  function applyConnectBranding() {
    document.title = `CONNECT | ${fullName}`;

    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) metaDescription.setAttribute('content', fullName);

    const brandTitle = document.querySelector('.brand-area h1');
    if (brandTitle) brandTitle.textContent = 'CONNECT';

    const brandSubtitle = document.querySelector('.brand-area p');
    if (brandSubtitle) brandSubtitle.textContent = fullName;
  }

  applyConnectBranding();
  document.addEventListener('DOMContentLoaded', applyConnectBranding);
})();
