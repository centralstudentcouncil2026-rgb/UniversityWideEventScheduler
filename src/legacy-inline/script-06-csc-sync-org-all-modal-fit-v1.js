// Extracted from org-dashboard.html inline script #6 id=csc-sync-org-all-modal-fit-v1 attrs=id="csc-sync-org-all-modal-fit-v1"

(() => {
  if (window.__cscOrgAllModalFitV1) return;
  window.__cscOrgAllModalFitV1 = true;

  const STYLE_ID = 'csc-sync-org-all-modal-fit-style-v1';
  let orgModalSyncTimer = 0;
  const MODAL_IDS = [
    'loginModal',
    'registerModal',
    'eventModal',
    'detailsModal',
    'conflictModal',
    'agreementModal',
    'filtersModal',
    'notificationsModal',
    'dashboardModal',
    'eventReviewModal',
    'blockedTimesModal',
    'activityStatusModal',
    'categoriesModal',
    'organizationsModal',
    'accountEditModal',
    'activityLogModal',
    'confirmModal',
    'statusCallUnavailableModal'
  ];
  const FULL_PAGE_IDS = ['announcementsModal', 'eventRequestsModal', 'usersModal'];
  const WIDTHS = {
    loginModal: '460px',
    registerModal: '720px',
    eventModal: '920px',
    detailsModal: '760px',
    conflictModal: '720px',
    agreementModal: '960px',
    filtersModal: '760px',
    notificationsModal: '720px',
    dashboardModal: '920px',
    eventReviewModal: '680px',
    blockedTimesModal: '920px',
    activityStatusModal: '520px',
    categoriesModal: '680px',
    organizationsModal: '760px',
    accountEditModal: '720px',
    activityLogModal: '920px',
    confirmModal: '480px',
    statusCallUnavailableModal: '460px'
  };

  function modalSelectors(suffix = '') {
    return MODAL_IDS.map((id) => `body.org-dashboard-shell #${id}${suffix}`).join(',\n');
  }

  function widthRules() {
    return Object.entries(WIDTHS)
      .map(([id, width]) => `body.org-dashboard-shell #${id}{--org-modal-width:${width};}`)
      .join('\n');
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      body.org-dashboard-shell {
        --org-modal-edge: clamp(10px, 2.6vw, 30px);
        --org-modal-radius: 18px;
        --org-modal-mobile-edge: 10px;
      }

      ${widthRules()}

      body.org-dashboard-shell dialog.modal:not([open]) {
        display: none !important;
      }

      ${modalSelectors('[open]')} {
        align-items: center !important;
        background: transparent !important;
        border: 0 !important;
        border-radius: 0 !important;
        bottom: 0 !important;
        box-sizing: border-box !important;
        display: grid !important;
        height: var(--org-modal-vh, 100dvh) !important;
        inset: 0 !important;
        justify-items: center !important;
        left: 0 !important;
        margin: 0 !important;
        max-height: none !important;
        max-width: none !important;
        min-height: 0 !important;
        overflow: hidden !important;
        padding: var(--org-modal-edge) !important;
        place-items: center !important;
        position: fixed !important;
        right: 0 !important;
        top: 0 !important;
        transform: none !important;
        width: 100vw !important;
      }

      ${modalSelectors('[open]::backdrop')} {
        background: rgba(15, 23, 42, 0.45) !important;
      }

      ${modalSelectors('[open] > .modal-card')},
      body.org-dashboard-shell #eventModal[open] > #eventForm.modal-card {
        background: #ffffff !important;
        border: 1px solid var(--aup-border, #d6deea) !important;
        border-radius: var(--org-modal-radius) !important;
        box-shadow: 0 24px 70px rgba(15, 23, 42, 0.22) !important;
        box-sizing: border-box !important;
        display: flex !important;
        flex-direction: column !important;
        gap: 0 !important;
        height: auto !important;
        margin: auto !important;
        max-height: calc(var(--org-modal-vh, 100dvh) - (var(--org-modal-edge) * 2)) !important;
        max-width: min(100%, var(--org-modal-width, 760px)) !important;
        min-height: 0 !important;
        min-width: 0 !important;
        overflow: hidden !important;
        padding: 0 !important;
        pointer-events: auto !important;
        width: min(100%, var(--org-modal-width, 760px)) !important;
      }

      body.org-dashboard-shell #loginModal[open] > .modal-card,
      body.org-dashboard-shell #confirmModal[open] > .modal-card,
      body.org-dashboard-shell #activityStatusModal[open] > .modal-card,
      body.org-dashboard-shell #statusCallUnavailableModal[open] > .modal-card {
        max-height: min(680px, calc(var(--org-modal-vh, 100dvh) - (var(--org-modal-edge) * 2))) !important;
      }

      ${modalSelectors('[open] .modal-header')} {
        align-items: center !important;
        background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%) !important;
        border-bottom: 1px solid #e2e8f0 !important;
        border-radius: var(--org-modal-radius) var(--org-modal-radius) 0 0 !important;
        box-sizing: border-box !important;
        display: flex !important;
        flex: 0 0 auto !important;
        gap: 14px !important;
        justify-content: space-between !important;
        margin: 0 !important;
        min-height: 64px !important;
        min-width: 0 !important;
        padding: clamp(14px, 2vw, 20px) clamp(16px, 2.4vw, 24px) !important;
        position: relative !important;
        top: auto !important;
        width: 100% !important;
        z-index: 4 !important;
      }

      ${modalSelectors('[open] .modal-header > div')} {
        min-width: 0 !important;
      }

      ${modalSelectors('[open] .modal-header h3')} {
        color: var(--aup-navy, #0f172a) !important;
        font-size: clamp(20px, 2.2vw, 28px) !important;
        line-height: 1.15 !important;
        margin: 0 !important;
        overflow-wrap: anywhere !important;
      }

      ${modalSelectors('[open] .modal-header p')} {
        color: var(--aup-muted, #64748b) !important;
        font-size: clamp(13px, 1.5vw, 15px) !important;
        line-height: 1.4 !important;
        margin: 5px 0 0 !important;
        overflow-wrap: anywhere !important;
      }

      ${modalSelectors('[open] .modal-header .icon-button')} {
        align-items: center !important;
        aspect-ratio: 1 / 1 !important;
        border-radius: 50% !important;
        display: inline-flex !important;
        flex: 0 0 42px !important;
        height: 42px !important;
        justify-content: center !important;
        max-height: 42px !important;
        max-width: 42px !important;
        min-height: 42px !important;
        min-width: 42px !important;
        padding: 0 !important;
        width: 42px !important;
      }

      ${modalSelectors('[open] .org-modal-scroll-body')} {
        background: #ffffff !important;
        box-sizing: border-box !important;
        display: block !important;
        flex: 1 1 auto !important;
        margin: 0 !important;
        min-height: 0 !important;
        overflow-x: hidden !important;
        overflow-y: auto !important;
        overscroll-behavior: contain !important;
        padding: clamp(16px, 2.3vw, 24px) !important;
        scrollbar-gutter: stable both-edges !important;
        width: 100% !important;
      }

      ${modalSelectors('[open] .org-modal-scroll-body > :first-child')} {
        margin-top: 0 !important;
      }

      ${modalSelectors('[open] .org-modal-scroll-body > :last-child')} {
        margin-bottom: 0 !important;
      }

      ${modalSelectors('[open] .form-grid')},
      ${modalSelectors('[open] .schedule-grid')},
      ${modalSelectors('[open] .shared-time-grid')},
      ${modalSelectors('[open] .dashboard-grid')} {
        box-sizing: border-box !important;
        gap: clamp(12px, 1.6vw, 18px) !important;
        min-width: 0 !important;
      }

      ${modalSelectors('[open] .activity-list')},
      ${modalSelectors('[open] .details-list')},
      ${modalSelectors('[open] .conflict-body')},
      ${modalSelectors('[open] .agreement-body')} {
        box-sizing: border-box !important;
        min-width: 0 !important;
        overflow-wrap: anywhere !important;
      }

      ${modalSelectors('[open] .activity-item')},
      ${modalSelectors('[open] .notification-item')},
      ${modalSelectors('[open] .details-list > *')} {
        max-width: 100% !important;
        min-width: 0 !important;
        overflow-wrap: anywhere !important;
      }

      ${modalSelectors('[open] input')},
      ${modalSelectors('[open] select')},
      ${modalSelectors('[open] textarea')} {
        box-sizing: border-box !important;
        max-width: 100% !important;
        min-width: 0 !important;
      }

      ${modalSelectors('[open] .modal-actions')} {
        align-items: center !important;
        background: linear-gradient(180deg, rgba(248, 250, 252, 0.92), #ffffff) !important;
        border-top: 1px solid #e2e8f0 !important;
        box-sizing: border-box !important;
        display: flex !important;
        flex: 0 0 auto !important;
        flex-direction: row !important;
        flex-wrap: wrap !important;
        gap: 10px !important;
        justify-content: flex-end !important;
        margin: 0 !important;
        min-width: 0 !important;
        overflow: visible !important;
        padding: clamp(12px, 2vw, 18px) clamp(16px, 2.4vw, 24px) !important;
        position: relative !important;
        width: 100% !important;
        z-index: 3 !important;
      }

      body.org-dashboard-shell #eventModal[open] .modal-actions.split-actions {
        justify-content: space-between !important;
      }

      body.org-dashboard-shell #eventModal[open] .modal-actions.split-actions > div {
        display: flex !important;
        flex: 1 1 260px !important;
        flex-wrap: wrap !important;
        gap: 10px !important;
        min-width: 0 !important;
      }

      ${modalSelectors('[open] .modal-actions button')},
      ${modalSelectors('[open] .primary-button')},
      ${modalSelectors('[open] .secondary-button')},
      ${modalSelectors('[open] .danger-button')} {
        align-items: center !important;
        box-sizing: border-box !important;
        display: inline-flex !important;
        flex: 0 1 auto !important;
        justify-content: center !important;
        line-height: 1.15 !important;
        max-width: 100% !important;
        min-height: 42px !important;
        min-width: max-content !important;
        overflow: hidden !important;
        padding: 0 18px !important;
        text-align: center !important;
        text-overflow: ellipsis !important;
        white-space: nowrap !important;
      }

      body.org-dashboard-shell #detailsModal[open] .modal-actions button {
        flex: 1 1 112px !important;
        min-width: 112px !important;
      }

      body.org-dashboard-shell #detailsModal[open] .modal-actions button[hidden],
      body.org-dashboard-shell #detailsModal[open] .modal-actions button.action-hidden {
        display: none !important;
      }

      body.org-dashboard-shell #detailsModal[open] .modal-actions[hidden],
      body.org-dashboard-shell #detailsModal[open] .modal-actions.action-hidden {
        display: none !important;
      }

      body.org-dashboard-shell #notificationsModal[open] .notifications-modal-header {
        align-items: center !important;
      }

      body.org-dashboard-shell #notificationsModal[open] .notification-header-actions {
        align-items: center !important;
        display: flex !important;
        flex: 0 0 auto !important;
        flex-wrap: wrap !important;
        gap: 10px !important;
        justify-content: flex-end !important;
      }

      body.org-dashboard-shell #notificationsModal[open] #markNotificationsReadButton {
        min-width: 150px !important;
      }

      body.org-dashboard-shell #activityStatusModal[open] .form-grid,
      body.org-dashboard-shell #statusCallUnavailableModal[open] .org-modal-scroll-body {
        background: transparent !important;
        border: 0 !important;
        box-shadow: none !important;
        padding: 0 !important;
      }

      body.org-dashboard-shell #activityStatusModal[open] .org-modal-scroll-body {
        padding: clamp(16px, 2.3vw, 24px) !important;
      }

      body.org-dashboard-shell .status-card {
        background: linear-gradient(180deg, rgba(255, 251, 235, 0.92), rgba(255, 255, 255, 0.72)) !important;
        border: 1px solid rgba(245, 158, 11, 0.42) !important;
        border-radius: 14px !important;
        box-shadow: 0 12px 28px rgba(245, 158, 11, 0.08) !important;
        display: grid !important;
        gap: 10px !important;
        padding: 12px !important;
      }

      body.org-dashboard-shell .status-card > .section-label {
        color: #334155 !important;
        font-size: clamp(11px, 2.8vw, 13px) !important;
        font-weight: 900 !important;
        line-height: 1.25 !important;
        text-transform: uppercase !important;
      }

      body.org-dashboard-shell .status-card .status-value {
        align-items: center !important;
        background: #dcfce7 !important;
        border: 1px solid #bbf7d0 !important;
        border-radius: 999px !important;
        color: #047857 !important;
        display: inline-flex !important;
        font-size: clamp(13px, 3.3vw, 15px) !important;
        font-weight: 900 !important;
        line-height: 1.2 !important;
        margin-top: 0 !important;
        overflow-wrap: anywhere !important;
        padding: 8px 11px !important;
        white-space: normal !important;
        width: fit-content !important;
      }

      body.org-dashboard-shell .status-card .status-value::before {
        background: currentColor !important;
        border-radius: 999px !important;
        content: "" !important;
        flex: 0 0 8px !important;
        height: 8px !important;
        margin-right: 8px !important;
        width: 8px !important;
      }

      body.org-dashboard-shell .status-card .status-call-button {
        align-items: center !important;
        background: var(--aup-blue, #2563eb) !important;
        border: 1px solid var(--aup-blue, #2563eb) !important;
        border-radius: 999px !important;
        box-shadow: 0 12px 24px rgba(37, 99, 235, 0.22) !important;
        box-sizing: border-box !important;
        color: #ffffff !important;
        cursor: pointer !important;
        display: flex !important;
        font-size: clamp(13px, 3.2vw, 16px) !important;
        font-weight: 900 !important;
        gap: 8px !important;
        justify-content: center !important;
        line-height: 1.15 !important;
        margin: 4px 0 0 !important;
        max-width: none !important;
        min-height: 44px !important;
        min-width: 0 !important;
        overflow: hidden !important;
        overflow-wrap: anywhere !important;
        padding: 9px 10px !important;
        text-align: center !important;
        text-decoration: none !important;
        white-space: normal !important;
        word-break: break-word !important;
        width: 100% !important;
      }

      body.org-dashboard-shell .status-card .status-call-button.is-call-available,
      body.org-dashboard-shell .status-card .status-call-button.is-call-unavailable {
        background: var(--aup-blue, #2563eb) !important;
        border-color: var(--aup-blue, #2563eb) !important;
        color: #ffffff !important;
      }

      body.org-dashboard-shell #announcementsModal.admin-tab-page,
      body.org-dashboard-shell #eventRequestsModal.admin-tab-page,
      body.org-dashboard-shell #usersModal.admin-tab-page {
        box-sizing: border-box !important;
        min-height: 100% !important;
        overflow-x: hidden !important;
      }

      body.org-dashboard-shell #announcementsModal.admin-tab-page .modal-card,
      body.org-dashboard-shell #eventRequestsModal.admin-tab-page .modal-card,
      body.org-dashboard-shell #usersModal.admin-tab-page .modal-card {
        border-radius: 0 !important;
        display: flex !important;
        flex-direction: column !important;
        min-height: 100% !important;
        overflow: visible !important;
        width: 100% !important;
      }

      body.org-dashboard-shell #announcementsModal.admin-tab-page .modal-header,
      body.org-dashboard-shell #eventRequestsModal.admin-tab-page .modal-header,
      body.org-dashboard-shell #usersModal.admin-tab-page .modal-header {
        align-items: center !important;
        background: linear-gradient(135deg, #ffd400 0%, #e0a000 100%) !important;
        border-bottom: 1px solid var(--aup-blue, #2563eb) !important;
        border-radius: 0 !important;
        box-sizing: border-box !important;
        display: grid !important;
        gap: 10px !important;
        grid-template-columns: 48px minmax(0, 1fr) 48px !important;
        margin: 0 !important;
        min-height: 58px !important;
        padding: 14px 18px 12px !important;
        position: sticky !important;
        top: 0 !important;
        z-index: 20 !important;
      }

      body.org-dashboard-shell #announcementsModal.admin-tab-page .modal-header > div,
      body.org-dashboard-shell #eventRequestsModal.admin-tab-page .modal-header > div,
      body.org-dashboard-shell #usersModal.admin-tab-page .modal-header > div {
        grid-column: 2 !important;
        text-align: center !important;
      }

      body.org-dashboard-shell #announcementsModal.admin-tab-page .modal-header h3,
      body.org-dashboard-shell #eventRequestsModal.admin-tab-page .modal-header h3,
      body.org-dashboard-shell #usersModal.admin-tab-page .modal-header h3 {
        font-size: clamp(1.05rem, 1.6vw, 1.35rem) !important;
        line-height: 1.1 !important;
        margin: 0 !important;
      }

      body.org-dashboard-shell #announcementsModal.admin-tab-page .portal-tab-back,
      body.org-dashboard-shell #eventRequestsModal.admin-tab-page .portal-tab-back,
      body.org-dashboard-shell #usersModal.admin-tab-page .portal-tab-back {
        align-items: center !important;
        aspect-ratio: 1 / 1 !important;
        border-radius: 999px !important;
        display: inline-flex !important;
        flex: 0 0 40px !important;
        font-size: 0 !important;
        height: 40px !important;
        justify-content: center !important;
        min-height: 40px !important;
        min-width: 40px !important;
        padding: 0 !important;
        width: 40px !important;
      }

      body.org-dashboard-shell #announcementsModal.admin-tab-page .portal-tab-back::before,
      body.org-dashboard-shell #eventRequestsModal.admin-tab-page .portal-tab-back::before,
      body.org-dashboard-shell #usersModal.admin-tab-page .portal-tab-back::before {
        color: #0f172a !important;
        content: '<' !important;
        font-size: 1.1rem !important;
        font-weight: 700 !important;
        line-height: 1 !important;
      }

      body.org-dashboard-shell #announcementsModal.admin-tab-page .modal-header .icon-button,
      body.org-dashboard-shell #eventRequestsModal.admin-tab-page .modal-header .icon-button,
      body.org-dashboard-shell #usersModal.admin-tab-page .modal-header .icon-button {
        grid-column: 1 !important;
        justify-self: start !important;
      }

      @media (max-width: 720px) {
        body.org-dashboard-shell {
          --org-modal-edge: var(--org-modal-mobile-edge);
          --org-modal-radius: 16px;
        }

        ${modalSelectors('[open]')} {
          padding: var(--org-modal-mobile-edge) !important;
        }

        ${modalSelectors('[open] > .modal-card')},
        body.org-dashboard-shell #eventModal[open] > #eventForm.modal-card {
          border-radius: 16px !important;
          max-height: calc(var(--org-modal-vh, 100dvh) - (var(--org-modal-mobile-edge) * 2)) !important;
          max-width: 100% !important;
          width: 100% !important;
        }

        ${modalSelectors('[open] .modal-header')} {
          border-radius: 16px 16px 0 0 !important;
          min-height: 58px !important;
          padding: 12px 14px !important;
        }

        ${modalSelectors('[open] .modal-header h3')} {
          font-size: clamp(18px, 5.6vw, 23px) !important;
        }

        ${modalSelectors('[open] .modal-header p')} {
          font-size: 13px !important;
        }

        ${modalSelectors('[open] .modal-header .icon-button')} {
          flex-basis: 40px !important;
          height: 40px !important;
          max-height: 40px !important;
          max-width: 40px !important;
          min-height: 40px !important;
          min-width: 40px !important;
          width: 40px !important;
        }

        ${modalSelectors('[open] .org-modal-scroll-body')} {
          padding: 14px !important;
        }

        ${modalSelectors('[open] .form-grid')},
        ${modalSelectors('[open] .schedule-grid')},
        ${modalSelectors('[open] .shared-time-grid')},
        ${modalSelectors('[open] .dashboard-grid')} {
          grid-template-columns: minmax(0, 1fr) !important;
        }

        ${modalSelectors('[open] .full-span')} {
          grid-column: auto !important;
        }

        ${modalSelectors('[open] .modal-actions')} {
          gap: 8px !important;
          justify-content: stretch !important;
          padding: 12px 14px !important;
        }

        ${modalSelectors('[open] .modal-actions button')},
        ${modalSelectors('[open] .primary-button')},
        ${modalSelectors('[open] .secondary-button')},
        ${modalSelectors('[open] .danger-button')} {
          flex: 1 1 132px !important;
          min-width: 0 !important;
          padding: 0 12px !important;
          white-space: normal !important;
        }

        body.org-dashboard-shell #eventModal[open] .modal-actions.split-actions,
        body.org-dashboard-shell #eventModal[open] .modal-actions.split-actions > div {
          align-items: stretch !important;
          flex-direction: row !important;
          flex-wrap: wrap !important;
          justify-content: stretch !important;
        }

        body.org-dashboard-shell #notificationsModal[open] .notifications-modal-header {
          align-items: flex-start !important;
          gap: 10px !important;
        }

        body.org-dashboard-shell #notificationsModal[open] .notification-header-actions {
          justify-content: flex-end !important;
        }

        body.org-dashboard-shell #notificationsModal[open] #markNotificationsReadButton {
          min-height: 38px !important;
          min-width: 0 !important;
          width: auto !important;
        }

        body.org-dashboard-shell .status-card .status-call-button {
          font-size: clamp(12px, 3.8vw, 15px) !important;
          max-width: none !important;
          min-height: 44px !important;
          width: 100% !important;
        }

        body.org-dashboard-shell #announcementsModal.admin-tab-page .modal-header,
        body.org-dashboard-shell #eventRequestsModal.admin-tab-page .modal-header,
        body.org-dashboard-shell #usersModal.admin-tab-page .modal-header {
          grid-template-columns: 44px minmax(0, 1fr) 44px !important;
          min-height: 58px !important;
          padding: 10px 12px !important;
        }
      }

      @media (max-width: 420px) {
        body.org-dashboard-shell {
          --org-modal-mobile-edge: 8px;
        }

        ${modalSelectors('[open] .modal-actions button')},
        ${modalSelectors('[open] .primary-button')},
        ${modalSelectors('[open] .secondary-button')},
        ${modalSelectors('[open] .danger-button')} {
          flex-basis: 100% !important;
          min-height: 42px !important;
        }

        body.org-dashboard-shell #detailsModal[open] .modal-actions button {
          flex-basis: calc(50% - 4px) !important;
        }

        body.org-dashboard-shell #detailsModal[open] .modal-actions button[hidden],
        body.org-dashboard-shell #detailsModal[open] .modal-actions button.action-hidden {
          display: none !important;
        }

        body.org-dashboard-shell #detailsModal[open] .modal-actions[hidden],
        body.org-dashboard-shell #detailsModal[open] .modal-actions.action-hidden {
          display: none !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function viewportHeight() {
    return Math.max(320, Math.floor(window.visualViewport?.height || window.innerHeight || document.documentElement.clientHeight || 720));
  }

  function setImportantStyle(node, property, value) {
    if (!node) return;
    if (node.style.getPropertyValue(property) === value && node.style.getPropertyPriority(property) === 'important') return;
    node.style.setProperty(property, value, 'important');
  }

  function clearImportantStyles(node, properties) {
    if (!node) return;
    properties.forEach((property) => {
      if (node.style.getPropertyValue(property)) node.style.removeProperty(property);
    });
  }

  function ensureScrollBody(card) {
    if (!card || card.querySelector(':scope > .org-modal-scroll-body')) return;
    const children = Array.from(card.children);
    const header = children.find((child) => child.classList?.contains('modal-header'));
    const actions = [...children].reverse().find((child) => child.classList?.contains('modal-actions'));
    const startIndex = header ? children.indexOf(header) + 1 : 0;
    const endIndex = actions ? children.indexOf(actions) : children.length;
    const bodyChildren = children.slice(startIndex, endIndex).filter((child) => !child.classList?.contains('modal-actions'));
    if (!bodyChildren.length) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'org-modal-scroll-body';
    const anchor = header || card.firstChild;
    if (anchor?.nextSibling) card.insertBefore(wrapper, anchor.nextSibling);
    else card.appendChild(wrapper);
    bodyChildren.forEach((child) => wrapper.appendChild(child));
  }

  function tuneCard(modal) {
    const card = modal.querySelector(':scope > .modal-card, :scope > #eventForm.modal-card');
    if (!card) return;
    ensureScrollBody(card);
    setImportantStyle(card, 'max-height', `calc(var(--org-modal-vh, ${viewportHeight()}px) - (var(--org-modal-edge) * 2))`);
    setImportantStyle(card, 'overflow', 'hidden');
  }

  function resetClosedModal(modal) {
    if (!modal) return;
    clearImportantStyles(modal, [
      'position',
      'inset',
      'top',
      'left',
      'right',
      'bottom',
      'margin',
      'transform',
      'display',
      'place-items',
      'height',
      'width',
      'max-width',
      'max-height',
      'overflow'
    ]);
  }

  function frameModal(modal) {
    if (!modal || !document.body.classList.contains('org-dashboard-shell')) return;
    if (!modal.open) {
      resetClosedModal(modal);
      return;
    }
    setImportantStyle(modal, 'position', 'fixed');
    setImportantStyle(modal, 'inset', '0');
    setImportantStyle(modal, 'top', '0');
    setImportantStyle(modal, 'left', '0');
    setImportantStyle(modal, 'right', '0');
    setImportantStyle(modal, 'bottom', '0');
    setImportantStyle(modal, 'margin', '0');
    setImportantStyle(modal, 'transform', 'none');
    setImportantStyle(modal, 'display', 'grid');
    setImportantStyle(modal, 'place-items', 'center');
    setImportantStyle(modal, 'height', 'var(--org-modal-vh)');
    setImportantStyle(modal, 'width', '100vw');
    setImportantStyle(modal, 'max-width', 'none');
    setImportantStyle(modal, 'max-height', 'none');
    setImportantStyle(modal, 'overflow', 'hidden');
    tuneCard(modal);
  }

  function syncAllOrgModals() {
    const height = `${viewportHeight()}px`;
    if (document.documentElement.style.getPropertyValue('--org-modal-vh') !== height) {
      document.documentElement.style.setProperty('--org-modal-vh', height);
    }
    MODAL_IDS.forEach((id) => frameModal(document.getElementById(id)));
    FULL_PAGE_IDS.forEach((id) => {
      const page = document.getElementById(id);
      if (page) page.classList.toggle('org-full-page-tab', page.classList.contains('admin-tab-page'));
    });
  }

  function scheduleSync(delay = 0) {
    window.clearTimeout(orgModalSyncTimer);
    orgModalSyncTimer = window.setTimeout(() => window.requestAnimationFrame(syncAllOrgModals), delay);
  }

  function bindImmediateCloseReset() {
    MODAL_IDS.forEach((id) => {
      const modal = document.getElementById(id);
      if (!modal || modal.dataset.orgModalCloseResetBound === '1') return;
      modal.dataset.orgModalCloseResetBound = '1';
      modal.addEventListener('close', () => {
        resetClosedModal(modal);
      });
    });
  }

  function init() {
    injectStyle();
    bindImmediateCloseReset();
    syncAllOrgModals();
    window.addEventListener('resize', () => scheduleSync(), { passive: true });
    window.visualViewport?.addEventListener('resize', () => scheduleSync(), { passive: true });
    window.visualViewport?.addEventListener('scroll', () => scheduleSync(), { passive: true });
    document.addEventListener('toggle', (event) => {
      if (event.target?.matches?.('dialog.modal') && MODAL_IDS.includes(event.target.id)) {
        frameModal(event.target);
        return;
      }
      scheduleSync();
    }, true);
    document.addEventListener('click', () => {
      scheduleSync(0);
      scheduleSync(80);
      scheduleSync(260);
    }, true);
    new MutationObserver(() => scheduleSync()).observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['open', 'class', 'hidden']
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
