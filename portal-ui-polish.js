(() => {
  if (window.__portalUiPolish) return;
  window.__portalUiPolish = true;

  let enhanceTimer = 0;

  function style() {
    if (document.getElementById('portal-ui-polish-style')) return;
    const s = document.createElement('style');
    s.id = 'portal-ui-polish-style';
    s.textContent = `
      body.is-manager .admin-tabs-panel{display:block!important;visibility:visible!important;opacity:1!important;}
      body.is-manager #eventRequestsButton,
      body.is-manager #usersButton{display:none!important;}
      body.is-manager #announcementsButton{display:inline-flex!important;}

      #notificationsModal .modal-card{background:linear-gradient(180deg,#fff,#f8fafc)!important;}
      #notificationsList{display:grid!important;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr))!important;gap:14px!important;align-items:stretch!important;}
      #notificationsList>.activity-item{display:grid!important;grid-template-rows:auto 1fr auto!important;gap:10px!important;background:#fff!important;border:1px solid #dbe4ef!important;border-radius:18px!important;padding:16px 16px 14px 18px!important;box-shadow:0 14px 36px rgba(15,23,42,.08)!important;position:relative!important;overflow:hidden!important;min-height:160px!important;}
      #notificationsList>.activity-item::before{content:"";position:absolute;left:0;top:0;bottom:0;width:5px;background:linear-gradient(180deg,#2563eb,#38bdf8)!important;}
      #notificationsList>.activity-item.unread-notification::before{background:linear-gradient(180deg,#f59e0b,#f97316)!important;}
      #notificationsList>.activity-item>strong{display:flex!important;align-items:flex-start!important;justify-content:space-between!important;gap:10px!important;color:#0f172a!important;font-size:1rem!important;line-height:1.35!important;}
      #notificationsList>.activity-item>p{display:grid!important;grid-template-columns:92px minmax(0,1fr)!important;gap:10px!important;margin:0!important;padding:.55rem 0 0!important;border-top:1px solid #e2e8f0!important;color:#475569!important;line-height:1.45!important;overflow-wrap:anywhere!important;}
      #notificationsList>.activity-item>p:nth-of-type(1)::before{content:"Message";font-weight:800;color:#334155;font-size:.75rem;text-transform:uppercase;letter-spacing:.06em;}
      #notificationsList>.activity-item>p:nth-of-type(2)::before{content:"Date";font-weight:800;color:#334155;font-size:.75rem;text-transform:uppercase;letter-spacing:.06em;}
      #notificationsList>.activity-item>.inline-actions{display:flex!important;flex-wrap:wrap!important;gap:8px!important;align-items:center!important;justify-content:flex-end!important;margin-top:auto!important;padding-top:.7rem!important;border-top:1px solid #e2e8f0!important;}
      #notificationsList>.activity-item>.inline-actions:empty{display:none!important;}
      #notificationsList>.activity-item button{min-height:38px!important;border-radius:999px!important;}

      body.portal-saving .calendar-panel,
      body.portal-saving dialog[open] .modal-card{transition:opacity .14s ease, transform .14s ease!important;}
      body.portal-saving .calendar-panel{opacity:.96!important;}
      body.portal-saving #toastRegion{pointer-events:none!important;}

      .ui-light-cards-enabled .activity-item,
      .ui-light-cards-enabled .notification-item,
      .ui-light-cards-enabled .public-day-event{transition:box-shadow .18s ease, transform .18s ease, background-color .18s ease!important;}

      @media(max-width:720px){
        #notificationsList{grid-template-columns:1fr!important;gap:12px!important;}
        #notificationsList>.activity-item{min-height:auto!important;border-radius:16px!important;padding:14px!important;}
        #notificationsList>.activity-item>p{grid-template-columns:1fr!important;gap:4px!important;}
        #notificationsList>.activity-item>.inline-actions{justify-content:stretch!important;}
        #notificationsList>.activity-item>.inline-actions button{flex:1 1 150px!important;}
      }
    `;
    document.head.appendChild(s);
  }

  function enhanceNotifications() {
    const list = document.getElementById('notificationsList');
    if (!list) return;
    list.classList.add('ui-card-list', 'ui-notification-card-list');
    [...list.children].forEach((card) => {
      if (!card.matches('.activity-item')) return;
      card.classList.add('ui-light-card', 'ui-notification-message-card');
      const actions = card.querySelector('.inline-actions');
      if (actions && !actions.children.length) actions.remove();
    });
  }

  function showOrgAnnouncements() {
    const body = document.body;
    const panel = document.querySelector('.admin-tabs-panel');
    const announcementButton = document.getElementById('announcementsButton');
    if (!body.classList.contains('is-manager') || !panel || !announcementButton) return;
    panel.hidden = false;
    panel.classList.remove('super-admin-only');
    announcementButton.hidden = false;
    announcementButton.disabled = false;
  }

  function markSaving() {
    document.body.classList.add('portal-saving');
    clearTimeout(window.__portalSavingTimer);
    window.__portalSavingTimer = setTimeout(() => document.body.classList.remove('portal-saving'), 900);
  }

  function debounceEnhance() {
    clearTimeout(enhanceTimer);
    enhanceTimer = setTimeout(() => {
      enhanceNotifications();
      showOrgAnnouncements();
    }, 80);
  }

  function init() {
    style();
    debounceEnhance();
    document.addEventListener('submit', (e) => {
      if (e.target?.matches?.('form')) markSaving();
    }, true);
    document.addEventListener('click', (e) => {
      if (e.target.closest('#agreementSubmitButton,#eventReviewSubmitButton,[data-action="notification-read"],#markNotificationsReadButton,[data-action="announcement-show"],[data-action="announcement-hide"],[data-action="announcement-edit"],[data-action="announcement-delete"]')) markSaving();
    }, true);
    new MutationObserver(debounceEnhance).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden'] });
    window.addEventListener('resize', debounceEnhance, { passive: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else queueMicrotask(init);
})();
