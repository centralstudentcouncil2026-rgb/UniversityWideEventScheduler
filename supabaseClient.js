window.SUPABASE_CONFIG = Object.freeze({
  url: 'https://ockpzmmpxebqmeipirsz.supabase.co',
  publishableKey: 'sb_publishable_67aTD3F2GDhTpoiHzpYkdw_4fQrUJms'
});

(() => {
  const assetBase = new URL('.', document.currentScript?.src || window.location.href);
  const assetVersion = '20260625-admin-tabs-inline-v3';
  const stylesheets = [
    `csc-live-theme.css?v=${assetVersion}`,
    `connect-calendar-overrides.css?v=${assetVersion}`,
    `connect-portal-pages.css?v=${assetVersion}`
  ];

  stylesheets.forEach((href) => {
    const resolvedHref = new URL(href, assetBase).href;
    if ([...document.querySelectorAll('link[rel="stylesheet"]')].some((link) => link.href === resolvedHref || link.getAttribute('href') === href)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = resolvedHref;
    document.head.appendChild(link);
  });
})();

(() => {
  const fullName = 'CSC S.Y.N.C. — Systemized Year-round Network Calendar';
  const compactName = ['CSC S.Y.N.C.', 'Systemized Year-round Network Calendar'];

  function applyConnectBranding() {
    document.title = document.title?.startsWith('CSC S.Y.N.C.') ? document.title : fullName;

    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) metaDescription.setAttribute('content', fullName);

    const brandTitle = document.querySelector('.brand-area h1');
    if (brandTitle) brandTitle.textContent = 'CSC S.Y.N.C.';

    const brandSubtitle = document.querySelector('.brand-area p');
    if (!brandSubtitle) return;

    if (brandSubtitle.classList.contains('brand-tagline-grid')) {
      brandSubtitle.innerHTML = `<span>${compactName[0]}</span><span>${compactName[1]}</span>`;
      return;
    }

    brandSubtitle.textContent = fullName;
  }

  applyConnectBranding();
  document.addEventListener('DOMContentLoaded', applyConnectBranding);
})();

(() => {
  function normalizeCalendarEventColors() {
    document.querySelectorAll('.fc-event').forEach((eventElement) => {
      if (eventElement.classList.contains('event-super-admin-block') || eventElement.classList.contains('event-blocked')) return;
      if (eventElement.classList.contains('event-week-span-multi')) return;

      const organizationColor = eventElement.style.backgroundColor || eventElement.style.borderColor;
      if (!organizationColor) return;

      eventElement.style.setProperty('background', organizationColor, 'important');
      eventElement.style.setProperty('background-color', organizationColor, 'important');
      eventElement.style.setProperty('border-color', organizationColor, 'important');
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    normalizeCalendarEventColors();
    const calendar = document.getElementById('calendar');
    if (!calendar) return;

    const observer = new MutationObserver(normalizeCalendarEventColors);
    observer.observe(calendar, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
  });
})();
