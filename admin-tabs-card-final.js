(() => {
  if (window.__adminTabsCardFinal) return;
  window.__adminTabsCardFinal = true;

  function injectStyle() {
    if (document.getElementById('admin-tabs-card-final-style')) return;
    const style = document.createElement('style');
    style.id = 'admin-tabs-card-final-style';
    style.textContent = `
      body.portal-shell .sidebar {
        overflow-x: hidden !important;
      }

      body.portal-shell .sidebar .admin-action-panel,
      body.portal-shell .sidebar .admin-tabs-panel {
        background: linear-gradient(180deg, rgba(239, 246, 255, 0.96), rgba(255, 255, 255, 0.92)) !important;
        border: 1px solid rgba(37, 99, 235, 0.2) !important;
        border-radius: 14px !important;
        box-shadow: 0 14px 28px rgba(15, 23, 42, 0.08) !important;
        display: grid !important;
        gap: 9px !important;
        min-width: 0 !important;
        overflow: hidden !important;
        padding: 12px !important;
        width: 100% !important;
        max-width: 100% !important;
        box-sizing: border-box !important;
        transform: none !important;
      }

      body.portal-shell .sidebar .admin-tabs-panel,
      body.portal-shell .sidebar .admin-action-panel {
        position: relative !important;
        isolation: isolate !important;
      }

      body.portal-shell .sidebar .admin-tabs-panel::before,
      body.portal-shell .sidebar .admin-tabs-panel::after,
      body.portal-shell .sidebar .admin-action-panel::before,
      body.portal-shell .sidebar .admin-action-panel::after,
      body.portal-shell .sidebar .admin-tabs-panel *::before,
      body.portal-shell .sidebar .admin-tabs-panel *::after {
        content: none !important;
        display: none !important;
      }

      body.portal-shell .sidebar .admin-tabs-panel > .section-label,
      body.portal-shell .sidebar .admin-action-panel > .section-label {
        align-items: center !important;
        background: transparent !important;
        border: 0 !important;
        border-radius: 0 !important;
        box-shadow: none !important;
        color: #334155 !important;
        display: block !important;
        font-family: 'Poppins', 'Inter', Arial, Helvetica, sans-serif !important;
        font-size: 12px !important;
        font-weight: 900 !important;
        justify-content: flex-start !important;
        letter-spacing: 0.06em !important;
        line-height: 1.15 !important;
        margin: 0 0 10px 0 !important;
        min-height: 0 !important;
        padding: 0 !important;
        text-align: left !important;
        text-transform: uppercase !important;
        width: auto !important;
        max-width: 100% !important;
        transform: none !important;
      }

      body.portal-shell .sidebar .admin-tabs-panel .sidebar-tabs {
        display: grid !important;
        gap: 7px !important;
        grid-template-columns: 1fr !important;
        min-width: 0 !important;
        overflow: hidden !important;
        width: 100% !important;
        max-width: 100% !important;
        box-sizing: border-box !important;
      }

      body.portal-shell .sidebar .admin-tabs-panel .sidebar-tab,
      body.portal-shell .sidebar .admin-action-panel button,
      body.portal-shell .sidebar .admin-action-panel .create-button,
      body.portal-shell .sidebar .admin-action-panel .secondary-button {
        align-items: center !important;
        background: #ffffff !important;
        border: 1px solid rgba(37, 99, 235, 0.24) !important;
        border-radius: 10px !important;
        box-sizing: border-box !important;
        color: #0f172a !important;
        display: inline-flex !important;
        justify-content: center !important;
        line-height: 1.2 !important;
        margin: 0 !important;
        max-width: 100% !important;
        min-height: 42px !important;
        min-width: 0 !important;
        overflow: hidden !important;
        overflow-wrap: anywhere !important;
        padding: 10px !important;
        position: relative !important;
        right: auto !important;
        left: auto !important;
        text-align: center !important;
        transform: none !important;
        white-space: normal !important;
        width: 100% !important;
      }

      body.portal-shell .sidebar .admin-action-panel .create-button {
        background: linear-gradient(135deg, #3b82f6, #2563eb) !important;
        border-color: #2563eb !important;
        color: #fff !important;
      }

      @media (max-width: 860px) {
        body.portal-shell .sidebar .admin-action-panel,
        body.portal-shell .sidebar .admin-tabs-panel {
          margin: 12px 0 !important;
          padding: 14px !important;
          border-radius: 20px !important;
          overflow: hidden !important;
        }

        body.portal-shell .sidebar .admin-tabs-panel > .section-label,
        body.portal-shell .sidebar .admin-action-panel > .section-label {
          margin: 0 0 10px 0 !important;
          padding: 0 !important;
          background: transparent !important;
          border: 0 !important;
          text-align: left !important;
        }

        body.portal-shell .sidebar .admin-tabs-panel .sidebar-tab,
        body.portal-shell .sidebar .admin-action-panel button,
        body.portal-shell .sidebar .admin-action-panel .create-button,
        body.portal-shell .sidebar .admin-action-panel .secondary-button {
          min-height: 46px !important;
          border-radius: 999px !important;
          padding: 10px 14px !important;
          font-size: .92rem !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectStyle);
  else injectStyle();
})();
