window.SUPABASE_CONFIG = Object.freeze({
  url: 'https://xtagvyyopokrhvvnseom.supabase.co',
  publishableKey: 'sb_publishable_G32XGo5ldXGO4TvqImNdSw_3-6_08LE'
});

(() => {
  const stylesheets = [
    'csc-live-theme.css?v=20260605-accent-horizontal-v1',
    'connect-calendar-overrides.css?v=20260605-accent-horizontal-v1',
    'connect-portal-pages.css?v=20260605-accent-horizontal-v1'
  ];

  stylesheets.forEach((href) => {
    if (document.querySelector(`link[href="${href}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  });
})();

(() => {
  const fullName = 'Centralized Organization Network for News, Events, Coordination, & Timely Events';
  const compactName = ['Centralized Organization Network', 'News • Events • Coordination • Timely Events'];

  function applyConnectBranding() {
    document.title = document.title?.startsWith('CONNECT') ? document.title : `CONNECT | ${fullName}`;

    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) metaDescription.setAttribute('content', fullName);

    const brandTitle = document.querySelector('.brand-area h1');
    if (brandTitle) brandTitle.textContent = 'CONNECT';

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
