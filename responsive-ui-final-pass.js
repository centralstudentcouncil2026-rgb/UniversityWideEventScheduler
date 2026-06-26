(() => {
  if (window.__responsiveUiFinalPass) return;
  window.__responsiveUiFinalPass = true;

  let timer = 0;

  function injectStyle() {
    if (document.getElementById('responsive-ui-final-pass-style')) return;
    const style = document.createElement('style');
    style.id = 'responsive-ui-final-pass-style';
    style.textContent = `
      :root {
        --ui-btn-h: clamp(34px, 5.2vw, 40px);
        --ui-btn-font: clamp(.78rem, .74rem + .25vw, .9rem);
        --ui-card-font: clamp(.86rem, .8rem + .28vw, .98rem);
        --ui-title-font: clamp(1.15rem, 1rem + 1.5vw, 1.85rem);
      }

      /* Global compact web-app buttons */
      body.portal-shell button:not(.icon-button),
      body.portal-shell .primary-button,
      body.portal-shell .secondary-button,
      body.portal-shell .danger-button,
      body.portal-shell .text-button,
      body.portal-shell .sidebar-tab,
      body.portal-shell .status-call-button,
      body.public-shell button:not(.icon-button),
      body.public-shell .primary-button,
      body.public-shell .secondary-button,
      body.public-shell .danger-button,
      body.public-shell .status-call-button,
      dialog.modal button:not(.icon-button),
      .public-announcement-popup button:not(.icon-button) {
        min-height: var(--ui-btn-h) !important;
        height: auto !important;
        padding: 7px 13px !important;
        border-radius: 999px !important;
        font-size: var(--ui-btn-font) !important;
        line-height: 1.18 !important;
        max-width: 100% !important;
        white-space: normal !important;
        overflow-wrap: anywhere !important;
        text-align: center !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        box-sizing: border-box !important;
      }

      body.portal-shell .create-button {
        min-height: clamp(42px, 6vw, 48px) !important;
        font-size: clamp(.9rem, .84rem + .32vw, 1rem) !important;
      }

      body.portal-shell .activity-item,
      body.portal-shell .account-card,
      body.portal-shell .event-request-detail-card,
      body.portal-shell #notificationsList > .activity-item,
      body.portal-shell .notice,
      body.public-shell .notice,
      .public-announcement-popup .notice,
      .public-day-dialog,
      .public-day-panel {
        font-size: var(--ui-card-font) !important;
        line-height: 1.42 !important;
        overflow-wrap: anywhere !important;
        word-break: normal !important;
      }

      /* Long cards: allow slide/scroll instead of stretching the page forever */
      body.portal-shell .admin-tab-page .activity-item,
      body.portal-shell .admin-tab-page .account-card,
      body.portal-shell .admin-tab-page .event-request-detail-card,
      body.portal-shell #notificationsList > .activity-item,
      dialog.modal .activity-item,
      .public-announcement-popup .notice {
        max-height: min(72dvh, 720px) !important;
        overflow-y: auto !important;
        overflow-x: hidden !important;
        -webkit-overflow-scrolling: touch !important;
      }

      body.portal-shell .admin-tab-page .modal-card > :not(.modal-header),
      body.portal-shell dialog.modal .modal-card > :not(.modal-header):not(.modal-actions),
      body.public-shell dialog.modal .modal-card > :not(.modal-header):not(.modal-actions),
      .public-announcement-popup .public-announcement-popup-body,
      .public-day-dialog .public-day-events,
      .public-day-panel .public-day-events {
        min-height: 0 !important;
        overflow-y: auto !important;
        overflow-x: hidden !important;
        -webkit-overflow-scrolling: touch !important;
      }

      /* Public announcement popup: mobile-friendly centered sheet */
      dialog.public-announcement-popup,
      #publicAnnouncementPopup {
        padding: clamp(10px, 3vw, 18px) !important;
        align-items: center !important;
        justify-items: center !important;
      }

      dialog.public-announcement-popup[open],
      #publicAnnouncementPopup[open] {
        display: grid !important;
      }

      dialog.public-announcement-popup > .modal-card,
      #publicAnnouncementPopup > .modal-card {
        width: min(94vw, 560px) !important;
        max-width: min(94vw, 560px) !important;
        max-height: min(88dvh, 680px) !important;
        display: grid !important;
        grid-template-rows: auto minmax(0, 1fr) !important;
        overflow: hidden !important;
        border-radius: clamp(18px, 4vw, 24px) !important;
      }

      dialog.public-announcement-popup .modal-header,
      #publicAnnouncementPopup .modal-header {
        padding: clamp(12px, 3vw, 18px) !important;
        gap: 10px !important;
      }

      dialog.public-announcement-popup .modal-header h3,
      #publicAnnouncementPopup .modal-header h3,
      body.portal-shell .modal-header h3,
      body.portal-shell .modal-header h2 {
        font-size: var(--ui-title-font) !important;
        line-height: 1.12 !important;
        overflow-wrap: anywhere !important;
      }

      dialog.public-announcement-popup .public-announcement-popup-body,
      #publicAnnouncementPopupBody {
        padding: clamp(10px, 3vw, 16px) !important;
        display: grid !important;
        gap: 10px !important;
      }

      dialog.public-announcement-popup .notice,
      #publicAnnouncementPopup .notice {
        border-radius: 16px !important;
        padding: clamp(12px, 3vw, 16px) !important;
        max-height: min(58dvh, 460px) !important;
      }

      /* Notifications: button directly below title, no oversized blank area */
      #notificationsModal .modal-card {
        display: grid !important;
        grid-template-rows: auto auto minmax(0, 1fr) !important;
        max-height: min(92dvh, 780px) !important;
      }

      #notificationsModal .modal-header {
        padding-bottom: 8px !important;
        margin-bottom: 0 !important;
      }

      #notificationsModal .modal-actions {
        padding: 0 clamp(14px, 3vw, 20px) 8px !important;
        margin: 0 !important;
        min-height: 0 !important;
        justify-content: flex-start !important;
        border: 0 !important;
      }

      #notificationsModal #markNotificationsReadButton {
        align-self: start !important;
        width: auto !important;
        max-width: 190px !important;
        min-width: 0 !important;
        min-height: 34px !important;
        padding: 7px 12px !important;
        font-size: .82rem !important;
        flex: 0 0 auto !important;
      }

      #notificationsModal #notificationsList {
        padding: 8px clamp(14px, 3vw, 20px) clamp(14px, 3vw, 22px) !important;
        gap: 10px !important;
        max-height: none !important;
        min-height: 0 !important;
        overflow-y: auto !important;
      }

      #notificationsModal #notificationsList > .activity-item {
        padding: clamp(12px, 3vw, 16px) !important;
        border-radius: 16px !important;
        gap: 8px !important;
      }

      #notificationsModal #notificationsList > .activity-item strong {
        font-size: clamp(1rem, .92rem + .5vw, 1.25rem) !important;
        line-height: 1.15 !important;
      }

      #notificationsModal #notificationsList > .activity-item p {
        font-size: clamp(.82rem, .78rem + .25vw, .92rem) !important;
        line-height: 1.35 !important;
      }

      #notificationsModal .inline-actions {
        gap: 8px !important;
        padding-top: 8px !important;
      }

      #notificationsModal .inline-actions button,
      #notificationsModal [data-action="notification-open"],
      #notificationsModal [data-action="notification-read"] {
        min-height: 34px !important;
        padding: 7px 12px !important;
        font-size: .82rem !important;
        border-radius: 999px !important;
      }

      /* Event request header filters */
      #eventRequestsModal .admin-tab-header-tools {
        width: 100% !important;
        max-width: 100% !important;
        justify-content: stretch !important;
        align-items: stretch !important;
      }

      #eventRequestsModal .event-request-filters {
        width: 100% !important;
        max-width: 100% !important;
        display: grid !important;
        grid-template-columns: minmax(180px, 1.25fr) repeat(3, minmax(120px, .7fr)) !important;
        gap: 8px !important;
        align-items: end !important;
        box-sizing: border-box !important;
      }

      #eventRequestsModal .event-request-filters label {
        min-width: 0 !important;
        width: 100% !important;
        max-width: none !important;
      }

      #eventRequestsModal .event-request-filters input,
      #eventRequestsModal .event-request-filters select,
      #eventRequestsModal .er-search-icon-button {
        width: 100% !important;
        min-height: 34px !important;
        height: 34px !important;
        border-radius: 999px !important;
        font-size: .78rem !important;
        box-sizing: border-box !important;
      }

      #eventRequestsModal .er-search-icon-button {
        display: none !important;
        border: 1px solid #cbd5e1 !important;
        background: #fff !important;
        color: #0f172a !important;
        box-shadow: 0 8px 18px rgba(15, 23, 42, .06) !important;
      }

      /* Admin pages/cards: compact, app-like buttons */
      body.portal-shell .admin-tab-page .er-card-actions,
      body.portal-shell .admin-tab-page .account-card-actions,
      body.portal-shell .activity-item .inline-actions,
      body.portal-shell .modal-actions,
      body.portal-shell .split-actions {
        gap: 8px !important;
        flex-wrap: wrap !important;
      }

      body.portal-shell .admin-tab-page .er-card-actions button,
      body.portal-shell .admin-tab-page .account-card-actions button,
      body.portal-shell .activity-item button,
      body.portal-shell .modal-actions button,
      body.portal-shell .split-actions button {
        min-height: 34px !important;
        padding: 7px 12px !important;
        font-size: .82rem !important;
        border-radius: 999px !important;
        flex: 0 1 auto !important;
        min-width: 0 !important;
      }

      @media (max-width: 860px) {
        :root {
          --ui-btn-h: 34px;
          --ui-btn-font: .78rem;
          --ui-card-font: .88rem;
        }

        dialog.public-announcement-popup > .modal-card,
        #publicAnnouncementPopup > .modal-card {
          width: calc(100vw - 20px) !important;
          max-width: calc(100vw - 20px) !important;
          max-height: calc(100dvh - 24px) !important;
        }

        dialog.public-announcement-popup .modal-header,
        #publicAnnouncementPopup .modal-header {
          padding: 12px !important;
        }

        dialog.public-announcement-popup .public-announcement-popup-body,
        #publicAnnouncementPopupBody {
          padding: 10px !important;
        }

        #notificationsModal .modal-card {
          max-height: calc(100dvh - 20px) !important;
        }

        #notificationsModal .modal-header {
          padding: 14px 14px 6px !important;
        }

        #notificationsModal .modal-actions {
          padding: 0 14px 6px !important;
        }

        #notificationsModal #markNotificationsReadButton {
          max-width: 170px !important;
          min-height: 32px !important;
          font-size: .78rem !important;
          padding: 6px 11px !important;
        }

        #eventRequestsModal .admin-tab-header-tools {
          grid-column: 1 / -1 !important;
          grid-row: 2 !important;
          overflow: visible !important;
          padding: 0 !important;
        }

        #eventRequestsModal .event-request-filters {
          grid-template-columns: 38px repeat(3, minmax(0, 1fr)) !important;
          gap: 6px !important;
          width: 100% !important;
          min-width: 0 !important;
        }

        #eventRequestsModal .event-request-filters .er-search-icon-button {
          display: inline-flex !important;
          grid-column: 1 / 2 !important;
          grid-row: 1 !important;
          padding: 0 !important;
          min-width: 38px !important;
          max-width: 38px !important;
          font-size: 1rem !important;
        }

        #eventRequestsModal .event-request-filters label {
          font-size: 0 !important;
          letter-spacing: 0 !important;
          gap: 0 !important;
          min-width: 0 !important;
        }

        #eventRequestsModal .event-request-filters label:first-of-type {
          display: none !important;
        }

        #eventRequestsModal .event-request-filters.search-expanded label:first-of-type {
          display: flex !important;
          grid-column: 1 / -1 !important;
          grid-row: 2 !important;
        }

        #eventRequestsModal .event-request-filters.search-expanded label:first-of-type input {
          height: 34px !important;
          min-height: 34px !important;
          font-size: .82rem !important;
        }

        #eventRequestsModal .event-request-filters label:not(:first-of-type) {
          grid-row: 1 !important;
        }

        #eventRequestsModal .event-request-filters input,
        #eventRequestsModal .event-request-filters select {
          min-height: 34px !important;
          height: 34px !important;
          padding: 0 7px !important;
          font-size: .72rem !important;
        }

        body.portal-shell .admin-tab-page .event-request-detail-card,
        body.portal-shell .admin-tab-page .account-card,
        body.portal-shell #notificationsList > .activity-item,
        dialog.modal .activity-item {
          max-height: calc(100dvh - 150px) !important;
        }

        body.portal-shell .admin-tab-page .er-card-actions,
        body.portal-shell .admin-tab-page .account-card-actions,
        #notificationsModal .inline-actions {
          display: grid !important;
          grid-template-columns: 1fr 1fr !important;
          gap: 7px !important;
        }

        body.portal-shell .admin-tab-page .er-card-actions button,
        body.portal-shell .admin-tab-page .account-card-actions button,
        #notificationsModal .inline-actions button {
          width: 100% !important;
          max-width: none !important;
          min-height: 34px !important;
          padding: 7px 10px !important;
          font-size: .78rem !important;
        }
      }

      @media (max-width: 460px) {
        #eventRequestsModal .event-request-filters {
          grid-template-columns: 36px repeat(3, minmax(0, 1fr)) !important;
          gap: 5px !important;
        }

        #eventRequestsModal .event-request-filters .er-search-icon-button {
          min-width: 36px !important;
          max-width: 36px !important;
        }

        #eventRequestsModal .event-request-filters select {
          font-size: .68rem !important;
          padding: 0 5px !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureEventRequestSearchButton() {
    const filters = document.getElementById('eventRequestFilters');
    const searchInput = document.getElementById('erFilterSearch');
    if (!filters || !searchInput || filters.querySelector('.er-search-icon-button')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'er-search-icon-button';
    button.setAttribute('aria-label', 'Search event requests');
    button.title = 'Search event requests';
    button.textContent = '🔍';
    button.addEventListener('click', () => {
      filters.classList.toggle('search-expanded');
      if (filters.classList.contains('search-expanded')) {
        setTimeout(() => searchInput.focus(), 60);
      }
    });
    filters.prepend(button);
    searchInput.addEventListener('input', () => {
      button.classList.toggle('has-search', Boolean(searchInput.value.trim()));
      if (searchInput.value.trim()) filters.classList.add('search-expanded');
    });
  }

  function normalizeScrollableCards() {
    document.querySelectorAll('.admin-tab-page .activity-item, .admin-tab-page .account-card, .admin-tab-page .event-request-detail-card, #notificationsList > .activity-item, .public-announcement-popup .notice').forEach((card) => {
      card.classList.add('ui-scrollable-card');
      card.style.webkitOverflowScrolling = 'touch';
    });
  }

  function run() {
    ensureEventRequestSearchButton();
    normalizeScrollableCards();
  }

  function scheduleRun() {
    clearTimeout(timer);
    timer = setTimeout(run, 80);
  }

  function init() {
    injectStyle();
    run();
    new MutationObserver(scheduleRun).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden', 'open'] });
    document.addEventListener('click', (event) => {
      if (event.target.closest('#eventRequestsButton,#notificationsButton,#announcementsButton,#usersButton,#mobileMenuButton')) setTimeout(run, 120);
    }, true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else queueMicrotask(init);
})();
