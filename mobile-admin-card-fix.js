(() => {
  if (window.__mobileAdminCardFix) return;
  window.__mobileAdminCardFix = true;

  function injectStyle() {
    if (document.getElementById('mobile-admin-card-fix-style')) return;
    const style = document.createElement('style');
    style.id = 'mobile-admin-card-fix-style';
    style.textContent = `
      @media (max-width: 860px) {
        body.portal-shell .sidebar {
          overflow-x: hidden !important;
          box-sizing: border-box !important;
        }

        body.portal-shell .sidebar .admin-action-panel,
        body.portal-shell .sidebar .admin-tabs-panel,
        body.portal-shell .sidebar .sidebar-section.admin-action-panel,
        body.portal-shell .sidebar .sidebar-section.admin-tabs-panel {
          position: relative !important;
          isolation: isolate !important;
          overflow: hidden !important;
          box-sizing: border-box !important;
          width: 100% !important;
          max-width: 100% !important;
          margin: 12px 0 !important;
          padding: 16px !important;
          border: 1px solid rgba(148, 163, 184, .32) !important;
          border-radius: 22px !important;
          background: linear-gradient(180deg, rgba(239, 246, 255, .96), rgba(255, 255, 255, .94)) !important;
          box-shadow: 0 14px 30px rgba(15, 23, 42, .08) !important;
          transform: none !important;
          left: auto !important;
          right: auto !important;
        }

        body.portal-shell .sidebar .admin-action-panel::before,
        body.portal-shell .sidebar .admin-action-panel::after,
        body.portal-shell .sidebar .admin-tabs-panel::before,
        body.portal-shell .sidebar .admin-tabs-panel::after,
        body.portal-shell .sidebar .admin-tabs-panel > .section-label::before,
        body.portal-shell .sidebar .admin-tabs-panel > .section-label::after,
        body.portal-shell .sidebar .admin-action-panel > .section-label::before,
        body.portal-shell .sidebar .admin-action-panel > .section-label::after {
          content: none !important;
          display: none !important;
        }

        body.portal-shell .sidebar .admin-tabs-panel > .section-label,
        body.portal-shell .sidebar .admin-action-panel > .section-label {
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          width: 100% !important;
          max-width: 100% !important;
          min-height: 42px !important;
          box-sizing: border-box !important;
          margin: 0 0 12px 0 !important;
          padding: 10px 12px !important;
          border: 1px solid rgba(148, 163, 184, .24) !important;
          border-radius: 16px !important;
          background: rgba(255, 255, 255, .78) !important;
          color: #0f172a !important;
          box-shadow: none !important;
          line-height: 1.15 !important;
          text-align: center !important;
          transform: none !important;
          left: auto !important;
          right: auto !important;
        }

        body.portal-shell .sidebar .admin-tabs-panel .sidebar-tabs,
        body.portal-shell .sidebar .admin-action-panel .sidebar-tabs {
          overflow: hidden !important;
          box-sizing: border-box !important;
          width: 100% !important;
          max-width: 100% !important;
          display: grid !important;
          gap: 10px !important;
        }

        body.portal-shell .sidebar .admin-tabs-panel .sidebar-tab,
        body.portal-shell .sidebar .admin-action-panel button,
        body.portal-shell .sidebar #dashboardButton,
        body.portal-shell .sidebar #concernsButton {
          position: relative !important;
          left: auto !important;
          right: auto !important;
          transform: none !important;
          width: 100% !important;
          max-width: 100% !important;
          min-width: 0 !important;
          margin-left: 0 !important;
          margin-right: 0 !important;
          box-sizing: border-box !important;
          overflow: hidden !important;
          border-radius: 999px !important;
        }

        body.portal-shell .sidebar .admin-tabs-panel + .sidebar-section,
        body.portal-shell .sidebar .admin-action-panel + .admin-tabs-panel {
          margin-top: 12px !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectStyle);
  else injectStyle();
})();
