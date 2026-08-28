(() => {
  if (window.__modalResponsiveCenter) return;
  window.__modalResponsiveCenter = true;

  function injectStyle() {
    if (document.getElementById('modal-responsive-center-style')) return;
    const style = document.createElement('style');
    style.id = 'modal-responsive-center-style';
    style.textContent = `
      :root {
        --modal-fluid-width: min(94vw, 760px);
        --modal-wide-width: min(96vw, 1040px);
        --modal-compact-width: min(92vw, 560px);
        --modal-safe-height: min(90dvh, 820px);
        --modal-pad: clamp(14px, 2.4vw, 24px);
        --modal-title-size: clamp(1.05rem, 1.1rem + .65vw, 1.55rem);
        --modal-text-size: clamp(.88rem, .82rem + .25vw, 1rem);
        --modal-button-font: clamp(.82rem, .78rem + .28vw, .98rem);
        --modal-button-height: clamp(38px, 3.4vw, 48px);
        --modal-button-pad-x: clamp(12px, 2vw, 20px);
        --modal-button-radius: clamp(12px, 2.4vw, 999px);
      }

      dialog.modal:not(.admin-tab-fullpage),
      dialog.public-announcement-popup {
        position: fixed !important;
        inset: 0 !important;
        width: 100vw !important;
        height: 100dvh !important;
        max-width: none !important;
        max-height: none !important;
        margin: 0 !important;
        padding: var(--modal-pad) !important;
        border: 0 !important;
        background: transparent !important;
        overflow: hidden !important;
        place-items: center !important;
        align-items: center !important;
        justify-items: center !important;
      }

      dialog.modal:not(.admin-tab-fullpage)[open],
      dialog.public-announcement-popup[open] {
        display: grid !important;
      }

      dialog.modal:not(.admin-tab-fullpage)::backdrop,
      dialog.public-announcement-popup::backdrop {
        background: rgba(7, 28, 61, .58) !important;
        backdrop-filter: blur(8px) !important;
      }

      dialog.modal:not(.admin-tab-fullpage) > .modal-card,
      dialog.modal:not(.admin-tab-fullpage) > form.modal-card,
      dialog.modal:not(.admin-tab-fullpage) > article.modal-card,
      dialog.public-announcement-popup > .modal-card {
        width: var(--modal-fluid-width) !important;
        max-width: var(--modal-fluid-width) !important;
        max-height: var(--modal-safe-height) !important;
        margin: auto !important;
        display: grid !important;
        grid-template-rows: auto minmax(0, 1fr) auto !important;
        overflow: hidden !important;
        border-radius: clamp(18px, 3vw, 28px) !important;
        box-sizing: border-box !important;
        font-size: var(--modal-text-size) !important;
      }

      dialog.modal:not(.admin-tab-fullpage) .modal-card.wide-modal,
      dialog.modal:not(.admin-tab-fullpage) .modal-card.conflict-card,
      dialog.modal:not(.admin-tab-fullpage) .modal-card.agreement-card {
        width: var(--modal-wide-width) !important;
        max-width: var(--modal-wide-width) !important;
      }

      dialog.modal:not(.admin-tab-fullpage) .modal-card > :not(.modal-header):not(.modal-actions),
      dialog.modal:not(.admin-tab-fullpage) .modal-card > .form-grid,
      dialog.modal:not(.admin-tab-fullpage) .modal-card > .activity-list,
      dialog.modal:not(.admin-tab-fullpage) .modal-card > .dashboard-grid,
      dialog.modal:not(.admin-tab-fullpage) .modal-card > .details-list,
      dialog.modal:not(.admin-tab-fullpage) .modal-card > .agreement-body,
      dialog.modal:not(.admin-tab-fullpage) .modal-card > .conflict-body,
      dialog.public-announcement-popup .public-announcement-popup-body {
        min-height: 0 !important;
        overflow: auto !important;
        overflow-wrap: anywhere !important;
        white-space: normal !important;
      }

      dialog.modal:not(.admin-tab-fullpage) .modal-header,
      dialog.public-announcement-popup .modal-header {
        display: flex !important;
        align-items: flex-start !important;
        justify-content: space-between !important;
        gap: clamp(10px, 2vw, 18px) !important;
        padding: clamp(14px, 2.2vw, 22px) !important;
        flex-wrap: nowrap !important;
      }

      dialog.modal:not(.admin-tab-fullpage) .modal-header h2,
      dialog.modal:not(.admin-tab-fullpage) .modal-header h3,
      dialog.public-announcement-popup .modal-header h3 {
        font-size: var(--modal-title-size) !important;
        line-height: 1.18 !important;
        overflow-wrap: anywhere !important;
      }

      dialog.modal:not(.admin-tab-fullpage) .modal-header p,
      dialog.public-announcement-popup .modal-header p,
      dialog.modal:not(.admin-tab-fullpage) p,
      dialog.modal:not(.admin-tab-fullpage) dd,
      dialog.modal:not(.admin-tab-fullpage) li,
      dialog.modal:not(.admin-tab-fullpage) label,
      dialog.public-announcement-popup p {
        font-size: var(--modal-text-size) !important;
        line-height: 1.45 !important;
        overflow-wrap: anywhere !important;
      }

      dialog.modal:not(.admin-tab-fullpage) .modal-actions,
      dialog.public-announcement-popup .modal-actions {
        display: flex !important;
        flex-wrap: wrap !important;
        gap: clamp(8px, 1.6vw, 12px) !important;
        align-items: center !important;
        justify-content: flex-end !important;
        padding: clamp(12px, 2vw, 18px) !important;
      }

      dialog.modal:not(.admin-tab-fullpage) button,
      dialog.modal:not(.admin-tab-fullpage) .primary-button,
      dialog.modal:not(.admin-tab-fullpage) .secondary-button,
      dialog.modal:not(.admin-tab-fullpage) .danger-button,
      dialog.modal:not(.admin-tab-fullpage) .text-button,
      dialog.modal:not(.admin-tab-fullpage) .icon-button,
      dialog.modal:not(.admin-tab-fullpage) a.primary-button,
      dialog.modal:not(.admin-tab-fullpage) a.secondary-button,
      dialog.public-announcement-popup button,
      .public-day-dialog button,
      .public-day-panel button {
        min-height: var(--modal-button-height) !important;
        max-width: 100% !important;
        padding-inline: var(--modal-button-pad-x) !important;
        padding-block: clamp(8px, 1.4vw, 12px) !important;
        border-radius: var(--modal-button-radius) !important;
        font-size: var(--modal-button-font) !important;
        line-height: 1.18 !important;
        white-space: normal !important;
        text-align: center !important;
        overflow-wrap: anywhere !important;
        word-break: normal !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        gap: clamp(4px, 1vw, 8px) !important;
        box-sizing: border-box !important;
      }

      dialog.modal:not(.admin-tab-fullpage) .icon-button,
      dialog.public-announcement-popup .icon-button,
      .public-day-dialog .icon-button,
      .public-day-panel .icon-button {
        width: var(--modal-button-height) !important;
        min-width: var(--modal-button-height) !important;
        max-width: var(--modal-button-height) !important;
        padding: 0 !important;
        flex: 0 0 auto !important;
        border-radius: 999px !important;
        font-size: clamp(1rem, 1rem + .4vw, 1.35rem) !important;
      }

      dialog.modal:not(.admin-tab-fullpage) .modal-actions button,
      dialog.modal:not(.admin-tab-fullpage) .modal-actions a,
      dialog.public-announcement-popup .modal-actions button,
      .public-day-dialog .modal-actions button,
      .public-day-panel .modal-actions button {
        flex: 0 1 auto !important;
        min-width: clamp(98px, 18vw, 180px) !important;
      }

      dialog.modal:not(.admin-tab-fullpage) .split-actions,
      dialog.modal:not(.admin-tab-fullpage) .inline-actions,
      .public-day-dialog .inline-actions,
      .public-day-panel .inline-actions {
        display: flex !important;
        flex-wrap: wrap !important;
        gap: clamp(8px, 1.6vw, 12px) !important;
      }

      dialog.modal:not(.admin-tab-fullpage) .split-actions > div,
      dialog.modal:not(.admin-tab-fullpage) .inline-actions {
        display: flex !important;
        flex-wrap: wrap !important;
        gap: clamp(8px, 1.6vw, 12px) !important;
      }

      dialog.modal:not(.admin-tab-fullpage) .form-grid {
        display: grid !important;
        grid-template-columns: repeat(auto-fit, minmax(min(240px, 100%), 1fr)) !important;
        gap: clamp(10px, 1.8vw, 16px) !important;
      }

      dialog.modal:not(.admin-tab-fullpage) .form-grid .full-span,
      dialog.modal:not(.admin-tab-fullpage) .full-span {
        grid-column: 1 / -1 !important;
      }

      dialog.modal:not(.admin-tab-fullpage) input,
      dialog.modal:not(.admin-tab-fullpage) select,
      dialog.modal:not(.admin-tab-fullpage) textarea {
        max-width: 100% !important;
        font-size: clamp(.9rem, .84rem + .25vw, 1rem) !important;
      }

      .public-day-dialog,
      .public-day-panel {
        left: 50% !important;
        top: 50% !important;
        width: min(94vw, 560px) !important;
        max-height: min(86dvh, 680px) !important;
        transform: translate(-50%, -50%) scale(.96) !important;
        font-size: var(--modal-text-size) !important;
        overflow-y: auto !important;
        overflow-wrap: anywhere !important;
      }

      .public-day-dialog.open,
      .public-day-panel.open {
        transform: translate(-50%, -50%) scale(1) !important;
      }

      .public-day-dialog .public-day-header h3,
      .public-day-panel .public-day-header h3 {
        font-size: var(--modal-title-size) !important;
        line-height: 1.18 !important;
        overflow-wrap: anywhere !important;
      }

      @media (max-width: 640px) {
        :root {
          --modal-fluid-width: calc(100vw - 20px);
          --modal-wide-width: calc(100vw - 20px);
          --modal-compact-width: calc(100vw - 20px);
          --modal-safe-height: calc(100dvh - 20px);
          --modal-pad: 10px;
          --modal-button-height: 42px;
          --modal-button-font: .88rem;
          --modal-button-pad-x: 12px;
        }

        dialog.modal:not(.admin-tab-fullpage),
        dialog.public-announcement-popup {
          align-items: center !important;
          justify-items: center !important;
        }

        dialog.modal:not(.admin-tab-fullpage) > .modal-card,
        dialog.modal:not(.admin-tab-fullpage) > form.modal-card,
        dialog.modal:not(.admin-tab-fullpage) > article.modal-card,
        dialog.public-announcement-popup > .modal-card {
          border-radius: 18px !important;
          max-height: calc(100dvh - 20px) !important;
        }

        dialog.modal:not(.admin-tab-fullpage) .modal-header,
        dialog.public-announcement-popup .modal-header {
          padding: 14px !important;
        }

        dialog.modal:not(.admin-tab-fullpage) .modal-actions,
        dialog.public-announcement-popup .modal-actions,
        dialog.modal:not(.admin-tab-fullpage) .split-actions,
        dialog.modal:not(.admin-tab-fullpage) .inline-actions {
          justify-content: stretch !important;
        }

        dialog.modal:not(.admin-tab-fullpage) .modal-actions button,
        dialog.modal:not(.admin-tab-fullpage) .modal-actions a,
        dialog.modal:not(.admin-tab-fullpage) .split-actions button,
        dialog.modal:not(.admin-tab-fullpage) .split-actions a,
        dialog.modal:not(.admin-tab-fullpage) .inline-actions button,
        dialog.modal:not(.admin-tab-fullpage) .inline-actions a,
        dialog.public-announcement-popup button,
        .public-day-dialog button,
        .public-day-panel button {
          flex: 1 1 min(100%, 150px) !important;
          width: auto !important;
          min-width: min(100%, 130px) !important;
        }

        dialog.modal:not(.admin-tab-fullpage) .icon-button,
        dialog.public-announcement-popup .icon-button,
        .public-day-dialog .icon-button,
        .public-day-panel .icon-button {
          flex: 0 0 var(--modal-button-height) !important;
          width: var(--modal-button-height) !important;
          min-width: var(--modal-button-height) !important;
          max-width: var(--modal-button-height) !important;
        }

        .public-day-dialog,
        .public-day-panel {
          width: calc(100vw - 20px) !important;
          max-height: calc(100dvh - 20px) !important;
          padding: 14px !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectStyle);
  else injectStyle();
})();
