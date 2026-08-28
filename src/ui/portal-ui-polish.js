// Feature copy of virtual module: portal-ui-polish.js
// Keep behavior identical until modular migration is verified.

(() => {
  if (window.__portalUiPolish) return;
  window.__portalUiPolish = true;

  let enhanceTimer = 0;
  function style() {
    if (document.getElementById('portal-ui-polish-style')) return;
    const s = document.createElement('style');
    s.id = 'portal-ui-polish-style';
    s.textContent = `
      body.is-manager #announcementsModal #announcementForm{display:none!important;}

      #notificationsModal .modal-card{background:linear-gradient(180deg,#fff,#f8fafc)!important;}
      #notificationsList{display:flex!important;flex-direction:column!important;gap:14px!important;align-items:stretch!important;}
      #notificationsList>.activity-item{display:grid!important;grid-template-rows:auto auto auto!important;gap:10px!important;background:#fff!important;border:1px solid #dbe4ef!important;border-radius:18px!important;padding:16px 16px 14px 18px!important;box-shadow:0 14px 36px rgba(15,23,42,.08)!important;position:relative!important;overflow:hidden!important;min-height:0!important;width:100%!important;}
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

      .portal-shell .sidebar,body.admin-dashboard-shell .sidebar,body.org-dashboard-shell .sidebar{align-content:stretch!important;align-items:stretch!important;box-sizing:border-box!important;display:flex!important;flex:0 0 min(86vw,320px)!important;flex-direction:column!important;gap:0!important;height:100dvh!important;left:0!important;max-height:100dvh!important;max-width:320px!important;min-height:0!important;overflow:hidden!important;padding:12px!important;position:fixed!important;top:0!important;width:min(86vw,320px)!important;z-index:60!important;}
      .portal-shell .sidebar-scroll-area,body.admin-dashboard-shell .sidebar-scroll-area,body.org-dashboard-shell .sidebar-scroll-area{align-content:start!important;align-items:stretch!important;box-sizing:border-box!important;display:flex!important;flex:1 1 auto!important;flex-direction:column!important;gap:12px!important;min-height:0!important;overflow-x:hidden!important;overflow-y:auto!important;padding:0 2px 12px 0!important;scrollbar-gutter:stable!important;width:100%!important;}
      .portal-shell .sidebar-scroll-area>.sidebar-section,body.admin-dashboard-shell .sidebar-scroll-area>.sidebar-section,body.org-dashboard-shell .sidebar-scroll-area>.sidebar-section{flex:0 0 auto!important;margin-bottom:0!important;}
      .portal-shell .sidebar>.sidebar-account-spacer,body.admin-dashboard-shell .sidebar>.sidebar-account-spacer,body.org-dashboard-shell .sidebar>.sidebar-account-spacer{display:none!important;}
      .portal-shell .account-section,body.admin-dashboard-shell .account-section,body.org-dashboard-shell .account-section{background:linear-gradient(180deg,rgba(248,250,252,.96),#f8fafc)!important;border-bottom:0!important;border-top:1px solid rgba(148,163,184,.28)!important;bottom:auto!important;box-sizing:border-box!important;flex:0 0 auto!important;margin:0!important;margin-top:auto!important;padding:10px 0 0!important;position:static!important;width:100%!important;z-index:3!important;}
      .portal-shell .account-row,body.admin-dashboard-shell .account-row,body.org-dashboard-shell .account-row{align-items:center!important;display:grid!important;grid-template-columns:44px minmax(0,1fr) auto!important;gap:10px!important;width:100%!important;}
      .portal-shell .account-row.restricted-only,body.admin-dashboard-shell .account-row.restricted-only,body.org-dashboard-shell .account-row.restricted-only{display:grid!important;}
      .portal-shell .account-avatar,body.admin-dashboard-shell .account-avatar,body.org-dashboard-shell .account-avatar{align-items:center!important;aspect-ratio:1!important;background:#4169f4!important;border-radius:999px!important;color:#fff!important;display:inline-flex!important;font-size:1rem!important;font-weight:900!important;justify-content:center!important;line-height:1!important;min-width:0!important;width:44px!important;}
      .portal-shell .account-copy,body.admin-dashboard-shell .account-copy,body.org-dashboard-shell .account-copy{display:grid!important;gap:2px!important;min-width:0!important;}
      .portal-shell .account-name,body.admin-dashboard-shell .account-name,body.org-dashboard-shell .account-name{color:#0f172a!important;display:block!important;font-size:.92rem!important;font-weight:900!important;line-height:1.15!important;min-width:0!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;}
      .portal-shell .account-type,body.admin-dashboard-shell .account-type,body.org-dashboard-shell .account-type{color:#64748b!important;display:block!important;font-size:.78rem!important;font-weight:600!important;line-height:1.2!important;min-width:0!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;}
      .portal-shell #logoutButton,body.admin-dashboard-shell #logoutButton,body.org-dashboard-shell #logoutButton{align-items:center!important;background:#dc2626!important;border:1px solid #dc2626!important;border-radius:7px!important;box-shadow:none!important;color:#fff!important;display:inline-flex!important;font-size:.9rem!important;font-weight:800!important;justify-content:center!important;line-height:1!important;margin:0!important;min-height:42px!important;min-width:76px!important;padding:0 13px!important;text-decoration:none!important;width:auto!important;}
      .portal-shell #logoutButton:hover,body.admin-dashboard-shell #logoutButton:hover,body.org-dashboard-shell #logoutButton:hover{background:#b91c1c!important;border-color:#b91c1c!important;color:#fff!important;}
      .portal-shell .sidebar-section,body.admin-dashboard-shell .sidebar-section,body.org-dashboard-shell .sidebar-section{box-sizing:border-box!important;max-width:100%!important;min-width:0!important;width:100%!important;}
      .portal-shell .sidebar-scroll-area>.sidebar-section,body.admin-dashboard-shell .sidebar-scroll-area>.sidebar-section,body.org-dashboard-shell .sidebar-scroll-area>.sidebar-section{border-radius:13px!important;padding:12px!important;}
      .portal-shell .sidebar .section-label,body.admin-dashboard-shell .sidebar .section-label,body.org-dashboard-shell .sidebar .section-label{display:block!important;font-size:.78rem!important;font-weight:900!important;line-height:1.1!important;margin:0 0 8px!important;overflow-wrap:anywhere!important;}
      .portal-shell .sidebar-tabs,body.admin-dashboard-shell .sidebar-tabs,body.org-dashboard-shell .sidebar-tabs{display:grid!important;gap:10px!important;width:100%!important;}
      .portal-shell .sidebar-scroll-area button:not(.icon-button),body.admin-dashboard-shell .sidebar-scroll-area button:not(.icon-button),body.org-dashboard-shell .sidebar-scroll-area button:not(.icon-button){box-sizing:border-box!important;font-size:.95rem!important;line-height:1.15!important;min-height:44px!important;overflow-wrap:anywhere!important;padding:9px 12px!important;white-space:normal!important;width:100%!important;}
      .portal-shell .status-card,body.admin-dashboard-shell .status-card,body.org-dashboard-shell .status-card{display:grid!important;gap:10px!important;min-width:0!important;}
      .portal-shell .status-value,body.admin-dashboard-shell .status-value,body.org-dashboard-shell .status-value{box-sizing:border-box!important;font-size:.95rem!important;line-height:1.15!important;max-width:100%!important;min-height:40px!important;overflow-wrap:anywhere!important;padding:9px 12px!important;width:max-content!important;}
      .portal-shell .status-card button,body.admin-dashboard-shell .status-card button,body.org-dashboard-shell .status-card button{width:100%!important;}

      @media(max-width:720px){
        #notificationsList{gap:12px!important;}
        #notificationsList>.activity-item{border-radius:16px!important;padding:14px!important;}
        #notificationsList>.activity-item>p{grid-template-columns:1fr!important;gap:4px!important;}
        #notificationsList>.activity-item>.inline-actions{justify-content:stretch!important;}
        #notificationsList>.activity-item>.inline-actions button{flex:1 1 150px!important;}
        .portal-shell .account-row,body.admin-dashboard-shell .account-row,body.org-dashboard-shell .account-row{grid-template-columns:42px minmax(0,1fr) auto!important;gap:8px!important;}
        .portal-shell .account-avatar,body.admin-dashboard-shell .account-avatar,body.org-dashboard-shell .account-avatar{width:42px!important;}
        .portal-shell #logoutButton,body.admin-dashboard-shell #logoutButton,body.org-dashboard-shell #logoutButton{min-width:72px!important;padding:0 11px!important;}
        .portal-shell .sidebar,body.admin-dashboard-shell .sidebar,body.org-dashboard-shell .sidebar{height:100dvh!important;max-height:100dvh!important;}
      }
    `;
    document.head.appendChild(s);
  }

  function store() { return window.CONNECT_STATE?.store; }
  function currentUser() { return (store()?.users || []).find((user) => user.id === store()?.currentUserId) || {}; }

  function enhanceNotifications() {
    const list = document.getElementById('notificationsList');
    if (!list) return;
    list.classList.remove('ui-card-list');
    list.classList.add('ui-notification-card-list');
    [...list.children].forEach((card) => {
      if (!card.matches('.activity-item')) return;
      card.classList.add('ui-light-card', 'ui-notification-message-card');
      const actions = card.querySelector('.inline-actions');
      if (actions && !actions.children.length) actions.remove();
    });
  }

  function notifyConcernOwnerWithRemarks() {}

  function requireResolveRemarks(event) {
    const button = event.target.closest('[data-action="concern-resolve"]');
    if (!button) return;
    const concern = (store()?.concerns || []).find((item) => item.id === button.dataset.id);
    if (!concern) return;
    const remarks = prompt('Remarks are required before marking this concern as resolved:', concern.admin_response || '');
    if (remarks === null) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    const cleaned = String(remarks).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    if (!cleaned) {
      alert('Remarks are required before marking this concern as resolved.');
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (cleaned.length > 1000) {
      alert('Concern remarks must be 1000 characters or fewer.');
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    concern.admin_response = cleaned;
    notifyConcernOwnerWithRemarks(concern, cleaned);
  }

  function showMobileOrgAnnouncementPopup() {
    if (!document.body.classList.contains('is-manager') || window.innerWidth > 768) return;
    const key = `org_announcement_popup_${currentUser().id || 'manager'}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    setTimeout(() => {
      if (window.innerWidth > 768 || document.querySelector('dialog[open]')) return;
      const preview = document.getElementById('announcementPreview');
      if (preview) preview.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 650);
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
      showMobileOrgAnnouncementPopup();
    }, 80);
  }

  function init() {
    style();
    debounceEnhance();
    document.addEventListener('click', requireResolveRemarks, true);
    document.addEventListener('submit', (e) => {
      if (e.target?.matches?.('form')) markSaving();
    }, true);
    document.addEventListener('click', (e) => {
      if (e.target.closest('#agreementSubmitButton,#eventReviewSubmitButton,#markNotificationsReadButton,[data-action="announcement-show"],[data-action="announcement-hide"],[data-action="announcement-edit"],[data-action="announcement-delete"],[data-action="concern-resolve"]')) markSaving();
    }, true);
    new MutationObserver(debounceEnhance).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden', 'open'] });
    window.addEventListener('resize', debounceEnhance, { passive: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else queueMicrotask(init);
})();
