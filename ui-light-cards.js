(() => {
  if (window.__cscLightCardsUi) return;
  window.__cscLightCardsUi = true;

  const PANEL_IDS = [
    'eventRequestsModal',
    'notificationsModal',
    'usersModal',
    'announcementsModal',
    'organizationsModal',
    'blockedTimesModal',
    'categoriesModal',
    'detailsModal',
    'eventReviewModal'
  ];
  const LIST_IDS = [
    'eventRequestsList',
    'notificationsList',
    'usersList',
    'accountRequestsList',
    'announcementsList',
    'organizationsList',
    'blockedTimesList',
    'categoriesList',
    'activityLogList',
    'publicDayEvents'
  ];

  function injectStyle() {
    if (document.getElementById('ui-light-cards-style')) return;
    const style = document.createElement('style');
    style.id = 'ui-light-cards-style';
    style.textContent = `
      :root{
        --ui-card-bg:#ffffff;
        --ui-card-soft:#f8fafc;
        --ui-card-line:#e2e8f0;
        --ui-card-strong:#0f172a;
        --ui-card-muted:#64748b;
        --ui-card-accent:#2563eb;
        --ui-card-radius:18px;
      }
      body.ui-light-cards-enabled dialog.portal-tab-view .modal-card,
      body.ui-light-cards-enabled dialog .modal-card{
        background:linear-gradient(180deg,#ffffff 0%,#f8fafc 100%)!important;
        border:1px solid rgba(226,232,240,.95)!important;
        box-shadow:0 22px 70px rgba(15,23,42,.12)!important;
      }
      body.ui-light-cards-enabled .modal-header{
        gap:.9rem!important;
      }
      body.ui-light-cards-enabled .modal-header h2,
      body.ui-light-cards-enabled .modal-header h3{
        letter-spacing:-.02em!important;
      }
      .ui-card-list{
        display:grid!important;
        grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr))!important;
        gap:14px!important;
        align-items:stretch!important;
      }
      #eventRequestsList.ui-card-list,
      #usersList.ui-card-list,
      #accountRequestsList.ui-card-list,
      #announcementsList.ui-card-list,
      #blockedTimesList.ui-card-list,
      #organizationsList.ui-card-list{
        grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr))!important;
      }
      .ui-light-card,
      body.ui-light-cards-enabled .activity-item,
      body.ui-light-cards-enabled .notification-item,
      body.ui-light-cards-enabled .public-day-event{
        position:relative!important;
        display:flex!important;
        flex-direction:column!important;
        gap:.55rem!important;
        min-width:0!important;
        background:var(--ui-card-bg)!important;
        border:1px solid var(--ui-card-line)!important;
        border-radius:var(--ui-card-radius)!important;
        padding:16px!important;
        box-shadow:0 14px 36px rgba(15,23,42,.08)!important;
        overflow:hidden!important;
      }
      .ui-light-card::before,
      body.ui-light-cards-enabled .activity-item::before,
      body.ui-light-cards-enabled .notification-item::before{
        content:"";
        position:absolute;
        inset:0 auto 0 0;
        width:5px;
        background:linear-gradient(180deg,var(--ui-card-accent),#38bdf8);
        opacity:.86;
      }
      .ui-light-card strong,
      body.ui-light-cards-enabled .activity-item>strong,
      body.ui-light-cards-enabled .notification-item>strong,
      body.ui-light-cards-enabled .public-day-event>strong{
        color:var(--ui-card-strong)!important;
        font-size:1rem!important;
        line-height:1.35!important;
        padding-left:.15rem!important;
      }
      .ui-light-card p,
      body.ui-light-cards-enabled .activity-item p,
      body.ui-light-cards-enabled .notification-item p,
      body.ui-light-cards-enabled .public-day-event p{
        display:grid!important;
        grid-template-columns:minmax(96px,.42fr) minmax(0,1fr)!important;
        gap:10px!important;
        align-items:start!important;
        margin:0!important;
        padding:.55rem 0 0!important;
        border-top:1px solid rgba(226,232,240,.9)!important;
        color:var(--ui-card-muted)!important;
        line-height:1.45!important;
        overflow-wrap:anywhere!important;
      }
      .ui-light-card p::before,
      body.ui-light-cards-enabled .activity-item p::before,
      body.ui-light-cards-enabled .notification-item p::before,
      body.ui-light-cards-enabled .public-day-event p::before{
        content:attr(data-ui-label);
        color:#334155;
        font-weight:700;
        font-size:.76rem;
        text-transform:uppercase;
        letter-spacing:.06em;
      }
      .ui-light-card p:not([data-ui-label])::before,
      body.ui-light-cards-enabled .activity-item p:not([data-ui-label])::before,
      body.ui-light-cards-enabled .notification-item p:not([data-ui-label])::before,
      body.ui-light-cards-enabled .public-day-event p:not([data-ui-label])::before{
        content:"Details";
      }
      body.ui-light-cards-enabled .activity-item .inline-actions,
      body.ui-light-cards-enabled .notification-item .inline-actions,
      body.ui-light-cards-enabled .activity-item button,
      body.ui-light-cards-enabled .notification-item button{
        flex-wrap:wrap!important;
      }
      body.ui-light-cards-enabled .activity-item .inline-actions,
      body.ui-light-cards-enabled .notification-item .inline-actions,
      body.ui-light-cards-enabled .activity-item:has(button) > div:last-child{
        display:flex!important;
        gap:8px!important;
        align-items:center!important;
        padding-top:.65rem!important;
        border-top:1px solid rgba(226,232,240,.9)!important;
      }
      body.ui-light-cards-enabled .status-pill,
      body.ui-light-cards-enabled .badge,
      body.ui-light-cards-enabled .notification-badge{
        box-shadow:0 4px 14px rgba(15,23,42,.08)!important;
      }
      body.ui-light-cards-enabled .form-grid,
      body.ui-light-cards-enabled .modal-body form{
        background:rgba(255,255,255,.72)!important;
        border:1px solid rgba(226,232,240,.72)!important;
        border-radius:18px!important;
        padding:14px!important;
      }
      body.ui-light-cards-enabled .empty-text,
      body.ui-light-cards-enabled .empty-state{
        background:#fff!important;
        border:1px dashed #cbd5e1!important;
        border-radius:18px!important;
        padding:18px!important;
        color:#64748b!important;
      }
      body.ui-light-cards-enabled .admin-edit-summary,
      body.ui-light-cards-enabled .cin-edit-summary{
        border-radius:16px!important;
        border:1px solid #fed7aa!important;
        background:#fff7ed!important;
      }
      @media (max-width:720px){
        .ui-card-list{
          grid-template-columns:1fr!important;
          gap:12px!important;
        }
        .ui-light-card,
        body.ui-light-cards-enabled .activity-item,
        body.ui-light-cards-enabled .notification-item,
        body.ui-light-cards-enabled .public-day-event{
          border-radius:16px!important;
          padding:14px!important;
        }
        .ui-light-card p,
        body.ui-light-cards-enabled .activity-item p,
        body.ui-light-cards-enabled .notification-item p,
        body.ui-light-cards-enabled .public-day-event p{
          grid-template-columns:1fr!important;
          gap:4px!important;
        }
      }
      @media (min-width:1100px){
        #eventRequestsList.ui-card-list,
        #usersList.ui-card-list,
        #accountRequestsList.ui-card-list{
          grid-template-columns:repeat(auto-fit,minmax(420px,1fr))!important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function labelForText(text = '', index = 0) {
    const lower = text.toLowerCase();
    if (lower.includes('@') || lower.includes('email')) return 'Email';
    if (lower.includes('pending') || lower.includes('approved') || lower.includes('rejected') || lower.includes('status')) return 'Status';
    if (lower.includes('venue') || lower.includes('room') || lower.includes('location')) return 'Venue';
    if (lower.includes('to ') || lower.includes('from ') || /\b\d{1,2}:\d{2}\b/.test(lower)) return 'Schedule';
    if (lower.includes('organization') || lower.includes('org')) return 'Organization';
    if (lower.includes('reason') || lower.includes('recommendation') || lower.includes('comment')) return 'Notes';
    if (lower.includes('contact') || lower.includes('phone')) return 'Contact';
    return index === 0 ? 'Details' : `Info ${index + 1}`;
  }

  function enhanceCard(card) {
    if (!card || card.dataset.uiLightCard === '1') return;
    card.dataset.uiLightCard = '1';
    card.classList.add('ui-light-card');
    [...card.querySelectorAll(':scope > p')].forEach((row, index) => {
      if (!row.dataset.uiLabel) row.dataset.uiLabel = labelForText(row.textContent || '', index);
    });
  }

  function enhanceList(list) {
    if (!list) return;
    list.classList.add('ui-card-list');
    [...list.children].forEach((child) => {
      if (child.matches?.('.activity-item,.notification-item,.public-day-event,article,li')) enhanceCard(child);
    });
  }

  function enhancePanels() {
    document.body.classList.add('ui-light-cards-enabled');
    PANEL_IDS.forEach((id) => document.getElementById(id)?.classList.add('ui-light-panel'));
    LIST_IDS.forEach((id) => enhanceList(document.getElementById(id)));
    document.querySelectorAll('.activity-item,.notification-item,.public-day-event').forEach(enhanceCard);
  }

  function init() {
    injectStyle();
    enhancePanels();
    const observer = new MutationObserver(enhancePanels);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', enhancePanels, { passive: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else queueMicrotask(init);
})();
