(() => {
  if (window.__mobileAdminUiPolish) return;
  window.__mobileAdminUiPolish = true;

  let timer = 0;

  function injectStyle() {
    if (document.getElementById('mobile-admin-ui-polish-style')) return;
    const style = document.createElement('style');
    style.id = 'mobile-admin-ui-polish-style';
    style.textContent = `
      .admin-tab-page .modal-header {
        position: sticky !important;
        top: 0 !important;
        z-index: 30 !important;
        min-height: clamp(86px, 15vw, 128px) !important;
        padding: clamp(14px, 2.2vw, 22px) clamp(14px, 3vw, 28px) !important;
        display: grid !important;
        grid-template-columns: 48px minmax(0, 1fr) auto !important;
        align-items: center !important;
        gap: 12px !important;
      }

      .admin-tab-page .modal-header > div:first-of-type {
        grid-column: 2 / 3 !important;
        text-align: center !important;
      }

      .admin-tab-page .modal-header h2,
      .admin-tab-page .modal-header h3 {
        font-size: clamp(1.45rem, 1.05rem + 2.4vw, 2.6rem) !important;
        line-height: 1.05 !important;
      }

      .admin-tab-page .portal-tab-back {
        position: relative !important;
        width: clamp(38px, 8vw, 46px) !important;
        min-width: clamp(38px, 8vw, 46px) !important;
        height: clamp(38px, 8vw, 46px) !important;
        min-height: clamp(38px, 8vw, 46px) !important;
        border-radius: 999px !important;
        padding: 0 !important;
        font-size: 0 !important;
        color: transparent !important;
        overflow: hidden !important;
        justify-self: start !important;
        grid-column: 1 / 2 !important;
        grid-row: 1 !important;
        background: rgba(255,255,255,.94) !important;
        border: 1px solid rgba(100,116,139,.22) !important;
        box-shadow: 0 10px 24px rgba(15,23,42,.12) !important;
      }

      .admin-tab-page .portal-tab-back::before {
        content: '←' !important;
        color: #0f172a !important;
        font-size: clamp(1.15rem, 1rem + .8vw, 1.55rem) !important;
        line-height: 1 !important;
      }

      #eventRequestsModal .admin-tab-header-tools {
        grid-column: 1 / -1 !important;
        width: 100% !important;
        justify-content: center !important;
      }

      #eventRequestsModal .admin-tab-header-tools .event-request-filters {
        width: min(100%, 980px) !important;
        display: grid !important;
        grid-template-columns: minmax(180px, 1.4fr) repeat(3, minmax(120px, .65fr)) !important;
        gap: 8px !important;
        align-items: end !important;
      }

      #eventRequestsModal .admin-tab-header-tools .event-request-filters label {
        min-width: 0 !important;
        width: 100% !important;
        max-width: none !important;
        font-size: clamp(.62rem, .58rem + .25vw, .72rem) !important;
        letter-spacing: .05em !important;
      }

      #eventRequestsModal .admin-tab-header-tools .event-request-filters input,
      #eventRequestsModal .admin-tab-header-tools .event-request-filters select {
        min-height: clamp(32px, 5.6vw, 38px) !important;
        height: clamp(32px, 5.6vw, 38px) !important;
        border-radius: 999px !important;
        padding: 0 10px !important;
        font-size: clamp(.72rem, .68rem + .25vw, .86rem) !important;
      }

      #notificationsModal .modal-card {
        grid-template-rows: auto auto minmax(0, 1fr) !important;
      }

      #notificationsModal .modal-actions {
        padding: 8px clamp(14px, 3vw, 20px) 10px !important;
        justify-content: flex-end !important;
        min-height: 0 !important;
      }

      #notificationsModal #markNotificationsReadButton,
      #notificationsModal .modal-actions button {
        width: auto !important;
        min-width: 0 !important;
        max-width: 220px !important;
        min-height: 34px !important;
        height: auto !important;
        padding: 8px 14px !important;
        border-radius: 999px !important;
        font-size: .84rem !important;
        flex: 0 0 auto !important;
      }

      #notificationsModal #notificationsList {
        min-height: 0 !important;
        overflow: auto !important;
        padding: 10px clamp(14px, 3vw, 20px) clamp(16px, 3vw, 24px) !important;
      }

      #notificationsModal .inline-actions button,
      #notificationsModal [data-action="notification-open"],
      #notificationsModal [data-action="notification-read"] {
        min-height: 36px !important;
        padding: 8px 12px !important;
        font-size: .88rem !important;
        border-radius: 999px !important;
      }

      #usersModal .account-card {
        display: grid !important;
        gap: 14px !important;
      }

      #usersModal .account-card-head {
        display: block !important;
      }

      #usersModal .account-card-actions {
        display: flex !important;
        flex-wrap: wrap !important;
        gap: 10px !important;
        justify-content: flex-start !important;
        padding-top: 12px !important;
        border-top: 1px solid #e2e8f0 !important;
        order: 30 !important;
      }

      #usersModal .account-card-actions button {
        min-height: 38px !important;
        padding: 8px 14px !important;
        font-size: .88rem !important;
        border-radius: 999px !important;
        flex: 0 1 auto !important;
      }

      .sidebar .admin-action-panel,
      .sidebar .admin-tabs-panel {
        overflow: visible !important;
      }

      .sidebar .admin-tabs-panel .sidebar-tabs {
        display: grid !important;
        gap: 10px !important;
      }

      .sidebar .admin-tabs-panel .sidebar-tab,
      .sidebar .admin-action-panel button,
      .sidebar #dashboardButton,
      .sidebar #concernsButton {
        min-height: clamp(42px, 8vw, 56px) !important;
        height: auto !important;
        padding: 10px 14px !important;
        font-size: clamp(.88rem, .82rem + .35vw, 1rem) !important;
        line-height: 1.15 !important;
        white-space: normal !important;
        border-radius: clamp(16px, 4vw, 999px) !important;
      }

      @media (max-width: 860px) {
        .admin-tab-page .modal-header {
          grid-template-columns: 44px minmax(0, 1fr) 44px !important;
          grid-template-rows: auto auto !important;
          align-items: center !important;
          min-height: 96px !important;
          padding: 12px 10px 14px !important;
        }

        .admin-tab-page .modal-header > div:first-of-type {
          grid-column: 2 / 3 !important;
          grid-row: 1 !important;
          text-align: center !important;
        }

        .admin-tab-page .portal-tab-back {
          position: sticky !important;
          left: 10px !important;
          top: 10px !important;
          z-index: 35 !important;
        }

        #eventRequestsModal .admin-tab-header-tools {
          grid-column: 1 / -1 !important;
          grid-row: 2 !important;
          margin-top: 6px !important;
          overflow-x: auto !important;
          padding-bottom: 2px !important;
        }

        #eventRequestsModal .admin-tab-header-tools .event-request-filters {
          grid-template-columns: repeat(4, minmax(82px, 1fr)) !important;
          min-width: 430px !important;
          width: max-content !important;
          gap: 6px !important;
        }

        #eventRequestsModal .admin-tab-header-tools .event-request-filters label {
          font-size: 0 !important;
          gap: 0 !important;
        }

        #eventRequestsModal .admin-tab-header-tools .event-request-filters input,
        #eventRequestsModal .admin-tab-header-tools .event-request-filters select {
          width: 100% !important;
          min-height: 34px !important;
          height: 34px !important;
          font-size: .75rem !important;
          padding: 0 8px !important;
        }

        #eventRequestsModal .admin-tab-header-tools .event-request-filters label:first-child {
          grid-column: span 1 !important;
        }

        .sidebar .admin-action-panel,
        .sidebar .admin-tabs-panel {
          margin: 12px 0 !important;
          padding: 14px !important;
          border: 1px solid rgba(148,163,184,.32) !important;
          border-radius: 20px !important;
          background: rgba(255,255,255,.86) !important;
          box-shadow: 0 12px 30px rgba(15,23,42,.08) !important;
          transform: none !important;
          clear: both !important;
        }

        .sidebar .admin-tabs-panel .section-label,
        .sidebar .admin-action-panel .section-label,
        .sidebar .section-label {
          display: block !important;
          margin-bottom: 10px !important;
          line-height: 1.15 !important;
        }

        .sidebar .admin-tabs-panel .sidebar-tabs,
        .sidebar .admin-action-panel {
          width: 100% !important;
        }

        .sidebar .admin-tabs-panel .sidebar-tab,
        .sidebar .admin-action-panel button,
        .sidebar #dashboardButton,
        .sidebar #concernsButton {
          width: 100% !important;
          max-width: 100% !important;
        }

        #notificationsModal #markNotificationsReadButton,
        #notificationsModal .modal-actions button {
          max-width: 180px !important;
          min-height: 34px !important;
          font-size: .82rem !important;
        }

        #notificationsModal .inline-actions {
          display: grid !important;
          grid-template-columns: 1fr !important;
          gap: 8px !important;
        }

        #notificationsModal .inline-actions button,
        #notificationsModal [data-action="notification-open"],
        #notificationsModal [data-action="notification-read"] {
          width: 100% !important;
          max-width: none !important;
          min-height: 36px !important;
        }

        #usersModal .account-card-actions {
          display: grid !important;
          grid-template-columns: 1fr !important;
          gap: 8px !important;
        }

        #usersModal .account-card-actions button {
          width: 100% !important;
          max-width: none !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function moveAccountActionsBelowDetails() {
    document.querySelectorAll('#usersModal .account-card').forEach((card) => {
      const actions = card.querySelector('.account-card-actions');
      const details = card.querySelector('.account-details');
      if (!actions || !details || actions.dataset.movedBelowDetails === '1') return;
      details.after(actions);
      actions.dataset.movedBelowDetails = '1';
    });
  }

  function compactBackLabels() {
    document.querySelectorAll('.admin-tab-page .portal-tab-back').forEach((button) => {
      button.setAttribute('aria-label', 'Back to Calendar View');
      button.title = 'Back to Calendar View';
    });
  }

  function run() {
    moveAccountActionsBelowDetails();
    compactBackLabels();
  }

  function scheduleRun() {
    clearTimeout(timer);
    timer = setTimeout(run, 80);
  }

  function init() {
    injectStyle();
    run();
    new MutationObserver(scheduleRun).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'class', 'open'] });
    document.addEventListener('click', (event) => {
      if (event.target.closest('#usersButton,#eventRequestsButton,#notificationsButton,#mobileMenuButton')) setTimeout(run, 140);
    }, true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else queueMicrotask(init);
})();
