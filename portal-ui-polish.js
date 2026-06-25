(() => {
  if (window.__portalUiPolish) return;
  window.__portalUiPolish = true;

  let enhanceTimer = 0;
  function style() {
    if (document.getElementById('portal-ui-polish-style')) return;
    const s = document.createElement('style');
    s.id = 'portal-ui-polish-style';
    s.textContent = `
      body.is-manager .admin-tabs-panel{display:none!important;}
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

      @media(max-width:720px){
        #notificationsList{gap:12px!important;}
        #notificationsList>.activity-item{border-radius:16px!important;padding:14px!important;}
        #notificationsList>.activity-item>p{grid-template-columns:1fr!important;gap:4px!important;}
        #notificationsList>.activity-item>.inline-actions{justify-content:stretch!important;}
        #notificationsList>.activity-item>.inline-actions button{flex:1 1 150px!important;}
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

  function notifyConcernOwnerWithRemarks(concern, remarks) {
    const current = currentUser();
    if (!Array.isArray(store().notifications)) store().notifications = [];
    (store().users || [])
      .filter((user) => user.organization_id === concern.organization_id && user.role === 'organization_manager')
      .forEach((user) => {
        store().notifications.push({
          notification_id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
          user_id: user.id,
          notification_type: 'concern_resolution_remarks',
          reference_id: concern.id,
          title: 'Concern Resolved with Remarks',
          message: `${current.full_name || 'Admin'} resolved "${concern.title}". Remarks: ${remarks}`,
          is_read: false,
          created_at: new Date().toISOString()
        });
      });
  }

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
      if (e.target.closest('#agreementSubmitButton,#eventReviewSubmitButton,[data-action="notification-read"],#markNotificationsReadButton,[data-action="announcement-show"],[data-action="announcement-hide"],[data-action="announcement-edit"],[data-action="announcement-delete"],[data-action="concern-resolve"]')) markSaving();
    }, true);
    new MutationObserver(debounceEnhance).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden', 'open'] });
    window.addEventListener('resize', debounceEnhance, { passive: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else queueMicrotask(init);
})();
