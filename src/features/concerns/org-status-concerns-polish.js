// Extracted from org-dashboard.html inline script #7 id=csc-sync-org-status-concerns-polish-v1 attrs=id="csc-sync-org-status-concerns-polish-v1"

(() => {
  if (window.__cscOrgStatusConcernsPolishV1) return;
  window.__cscOrgStatusConcernsPolishV1 = true;

  const STYLE_ID = 'csc-sync-org-status-concerns-polish-style-v1';
  let orgPolishTimer = 0;

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      body.org-dashboard-shell #eventForm[data-event-mode="create"] .modal-actions.split-actions > div {
        display: none !important;
      }

      body.org-dashboard-shell #eventForm[data-event-mode="create"] .modal-actions.split-actions {
        justify-content: flex-end !important;
      }

      body.org-dashboard-shell #eventForm[data-event-mode="create"] .modal-actions.split-actions > .primary-button,
      body.org-dashboard-shell #eventForm[data-event-mode="create"] .modal-actions.split-actions > button[type="submit"] {
        flex: 0 1 auto !important;
        min-width: min(100%, 160px) !important;
      }

      body.org-dashboard-shell #detailsCancelButton,
      body.org-dashboard-shell #detailsRejectButton,
      body.org-dashboard-shell #detailsApproveButton {
        display: none !important;
      }

      body.org-dashboard-shell #dashboardModal[open] .org-modal-scroll-body {
        display: grid !important;
        gap: clamp(12px, 1.8vw, 18px) !important;
        grid-template-rows: auto minmax(0, 1fr) !important;
      }

      body.org-dashboard-shell #dashboardModal[open] #dashboardGrid {
        align-items: stretch !important;
        display: grid !important;
        gap: clamp(8px, 1.5vw, 12px) !important;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 132px), 1fr)) !important;
        margin: 0 !important;
        min-width: 0 !important;
      }

      body.org-dashboard-shell #dashboardModal[open] .metric {
        align-content: center !important;
        border-radius: 12px !important;
        gap: 3px !important;
        min-height: 68px !important;
        padding: clamp(9px, 1.6vw, 12px) !important;
        text-align: center !important;
      }

      body.org-dashboard-shell #dashboardModal[open] .metric strong {
        font-size: clamp(18px, 4.6vw, 24px) !important;
        line-height: 1 !important;
      }

      body.org-dashboard-shell #dashboardModal[open] .metric span {
        font-size: clamp(11px, 2.7vw, 13px) !important;
        line-height: 1.15 !important;
        overflow-wrap: anywhere !important;
      }

      body.org-dashboard-shell #dashboardModal[open] #dashboardList {
        align-content: start !important;
        border: 1px solid #dbe4ef !important;
        border-radius: 14px !important;
        display: grid !important;
        gap: 10px !important;
        max-height: min(44vh, 420px) !important;
        min-height: 120px !important;
        overflow-x: hidden !important;
        overflow-y: auto !important;
        padding: 10px !important;
        scrollbar-gutter: stable !important;
      }

      body.org-dashboard-shell #dashboardModal[open] #dashboardList .activity-item {
        background: #ffffff !important;
        border: 1px solid #dbe4ef !important;
        border-left: 5px solid var(--aup-blue, #2563eb) !important;
        border-radius: 12px !important;
        box-shadow: 0 10px 22px rgba(15, 23, 42, 0.07) !important;
        box-sizing: border-box !important;
        display: grid !important;
        gap: 6px !important;
        margin: 0 !important;
        max-width: 100% !important;
        min-width: 0 !important;
        padding: 10px 12px !important;
      }

      body.org-dashboard-shell #dashboardModal[open] #dashboardList .activity-item strong {
        font-size: clamp(14px, 3.8vw, 16px) !important;
        line-height: 1.2 !important;
        overflow-wrap: anywhere !important;
      }

      body.org-dashboard-shell #dashboardModal[open] #dashboardList .activity-item p {
        color: #475569 !important;
        font-size: clamp(12px, 3.2vw, 14px) !important;
        line-height: 1.35 !important;
        margin: 0 !important;
        overflow-wrap: anywhere !important;
      }      @media (max-width: 720px) {
        body.org-dashboard-shell #dashboardModal[open] #dashboardGrid {
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        }

        body.org-dashboard-shell #dashboardModal[open] #dashboardList {
          max-height: min(48vh, 360px) !important;
          padding: 8px !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function syncEventFormMode() {
    const form = document.getElementById('eventForm');
    if (!form) return;
    const eventId = document.getElementById('eventId')?.value?.trim();
    const title = document.getElementById('eventModalTitle')?.textContent?.trim().toLowerCase() || '';
    const isCreateTitle = title.includes('create') || title.includes('post university');
    const mode = isCreateTitle || !eventId ? 'create' : 'edit';
    if (form.dataset.eventMode !== mode) form.dataset.eventMode = mode;
    const editOnlyGroup = form.querySelector('.modal-actions.split-actions > div');
    if (editOnlyGroup) {
      const hidden = mode === 'create';
      if (editOnlyGroup.hidden !== hidden) editOnlyGroup.hidden = hidden;
      if (editOnlyGroup.getAttribute('aria-hidden') !== String(hidden)) editOnlyGroup.setAttribute('aria-hidden', String(hidden));
      const display = hidden ? 'none' : 'flex';
      if (editOnlyGroup.style.getPropertyValue('display') !== display) editOnlyGroup.style.setProperty('display', display, 'important');
    }
    ['deleteEventButton', 'cancelEventButton'].forEach((id) => {
      const button = document.getElementById(id);
      if (!button) return;
      if (mode === 'create') {
        if (!button.hidden) button.hidden = true;
        if (button.getAttribute('aria-hidden') !== 'true') button.setAttribute('aria-hidden', 'true');
        if (button.style.getPropertyValue('display') !== 'none') button.style.setProperty('display', 'none', 'important');
        if (!button.disabled) button.disabled = true;
      } else {
        if (button.hasAttribute('aria-hidden')) button.removeAttribute('aria-hidden');
        if (button.style.getPropertyValue('display')) button.style.removeProperty('display');
        if (button.disabled) button.disabled = false;
      }
    });
  }

  function labelConcernRows() {
    document.querySelectorAll('#concernsList .activity-item').forEach((card) => {
      card.querySelectorAll('p').forEach((row, index) => {
        if (row.dataset.uiLabel) return;
        const text = (row.textContent || '').toLowerCase();
        let label = 'Info';
        if (text.includes('category')) label = 'Category';
        else if (text.includes('priority')) label = 'Priority';
        else if (text.includes('status')) label = 'Status';
        else if (text.includes('submitted') || text.includes('date')) label = 'Date';
        else if (text.includes('response') || text.includes('remarks')) label = 'Response';
        else if (index === 0) label = 'Details';
        row.dataset.uiLabel = label;
      });
    });
  }

  function removeOrgApprovalActions() {
    ['detailsCancelButton', 'detailsRejectButton', 'detailsApproveButton'].forEach((id) => {
      const button = document.getElementById(id);
      if (!button) return;
      if (!button.hidden) button.hidden = true;
      if (!button.disabled) button.disabled = true;
      if (button.getAttribute('aria-hidden') !== 'true') button.setAttribute('aria-hidden', 'true');
      if (button.style.getPropertyValue('display') !== 'none') button.style.setProperty('display', 'none', 'important');
    });
  }

  function syncPolish() {
    syncEventFormMode();
    labelConcernRows();
    removeOrgApprovalActions();
  }

  function scheduleSync(delay = 0) {
    window.clearTimeout(orgPolishTimer);
    orgPolishTimer = window.setTimeout(syncPolish, delay);
  }

  function init() {
    injectStyle();
    syncPolish();
    ['click', 'input', 'change', 'toggle'].forEach((type) => {
      document.addEventListener(type, () => {
        scheduleSync(0);
        scheduleSync(120);
      }, true);
    });
    new MutationObserver(() => scheduleSync()).observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['open', 'hidden', 'class', 'value']
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
