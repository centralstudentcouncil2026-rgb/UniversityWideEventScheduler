// Extracted from org-dashboard.html inline script #14 id=inlined-dashboard-reload-state attrs=id="inlined-dashboard-reload-state"

(() => {
  if (window.__cscDashboardReloadState) return;
  window.__cscDashboardReloadState = true;

  const dashboard = document.body?.dataset?.dashboard || (document.body?.classList.contains('admin-dashboard-shell') ? 'admin' : 'org');
  const activeKey = `csc_active_dashboard_tab_${dashboard}`;
  const mainCalendarValue = 'mainCalendar';
  const transientClass = 'dashboard-session-restoring';
  const earlyClass = 'dashboard-session-restoring-early';
  const tabEarlyClass = 'dashboard-tab-restoring-early';
  let restoredThisLoad = false;
  const tabButtons = [
    'eventRequestsButton',
    'concernsButton',
    'usersButton',
    'conferenceRoomButton',
    'blockedTimesButton',
    'myCalendarButton',
    'personalCalendarButton',
    'createScheduleButton',
    'activityStatusButton',
    'notificationsButton'
  ];

  function hasStoredSession() {
    try {
      const session = JSON.parse(sessionStorage.getItem('core_supabase_auth_session') || 'null');
      return Boolean(session?.access_token);
    } catch {
      return false;
    }
  }

  function isReloadNavigation() {
    const entry = performance.getEntriesByType?.('navigation')?.[0];
    if (entry?.type) return entry.type === 'reload';
    return performance.navigation?.type === 1;
  }

  function shouldRestoreDashboardTab() {
    return isReloadNavigation();
  }

  function storedRestorableTabId() {
    try {
      const id = sessionStorage.getItem(activeKey) || '';
      return id && id !== mainCalendarValue ? id : '';
    } catch {
      return '';
    }
  }

  function dashboardReady() {
    const body = document.body;
    if (!body) return false;
    if (body.classList.contains('portal-authenticated') || body.classList.contains('dashboard-login-ready')) return true;
    if (body.classList.contains('dashboard-login-required')) return false;
    return Boolean(document.querySelector('.app-shell') || document.getElementById('calendarGrid') || document.getElementById('calendar'));
  }

  function markRestoring() {
    if (!shouldRestoreDashboardTab()) return;
    if (!hasStoredSession()) return;
    const tabId = storedRestorableTabId();
    document.documentElement.classList.add(earlyClass);
    if (tabId) document.documentElement.classList.add(tabEarlyClass);
    document.documentElement.classList.add(transientClass);
    document.body?.classList.add(transientClass);
  }

  function clearRestoring() {
    document.documentElement.classList.remove(earlyClass);
    document.documentElement.classList.remove(tabEarlyClass);
    document.documentElement.classList.remove(transientClass);
    document.body?.classList.remove(transientClass);
  }

  function injectStyle() {
    if (document.getElementById('dashboard-reload-state-style')) return;
    const style = document.createElement('style');
    style.id = 'dashboard-reload-state-style';
    style.textContent = `
      body.${transientClass}.dashboard-login-required #dashboardLoginScreen {
        display: none !important;
      }
      html.${earlyClass} #dashboardLoginScreen {
        display: none !important;
      }
      html.${tabEarlyClass} body.org-dashboard-shell .app-shell {
        visibility: hidden !important;
      }
      html.${tabEarlyClass} body.org-dashboard-shell::before {
        content: "Restoring dashboard...";
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        display: grid;
        place-items: center;
        background: #f8fafc;
        color: #0f172a;
        font: 800 18px/1.2 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      body.${transientClass}.dashboard-login-required::before {
        content: "Restoring dashboard...";
        position: fixed;
        inset: 0;
        z-index: 99999;
        display: grid;
        place-items: center;
        background: #f8fafc;
        color: #0f172a;
        font: 800 18px/1.2 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      html.${earlyClass} body:not(.dashboard-login-ready):not(.portal-authenticated)::before {
        content: "Restoring dashboard...";
        position: fixed;
        inset: 0;
        z-index: 99999;
        display: grid;
        place-items: center;
        background: #f8fafc;
        color: #0f172a;
        font: 800 18px/1.2 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      body.${transientClass}.dashboard-login-ready::before,
      body.${transientClass}.portal-authenticated::before {
        content: "Restoring dashboard...";
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        display: grid;
        place-items: center;
        background: #f8fafc;
        color: #0f172a;
        font: 800 18px/1.2 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
    `;
    document.head.appendChild(style);
  }

  function remember(id) {
    if (!id || id === 'notificationsButton') return;
    try { sessionStorage.setItem(activeKey, id); } catch {}
  }

  function rememberMainCalendar() {
    try { sessionStorage.setItem(activeKey, mainCalendarValue); } catch {}
  }

  function restoredTargetId(buttonId) {
    if (buttonId === 'eventRequestsButton') return 'eventRequestsModal';
    if (buttonId === 'concernsButton') return 'concernsModal';
    if (buttonId === 'usersButton') return 'usersModal';
    if (buttonId === 'conferenceRoomButton') return 'conferenceRoomModal';
    return '';
  }

  function clearRestoringWhenReady(buttonId) {
    const targetId = restoredTargetId(buttonId);
    if (!targetId) {
      clearRestoring();
      return;
    }
    const deadline = Date.now() + 1800;
    const wait = () => {
      const target = document.getElementById(targetId);
      if (target?.classList.contains('is-active') || target?.open || Date.now() > deadline) {
        clearRestoring();
        return;
      }
      requestAnimationFrame(wait);
    };
    requestAnimationFrame(wait);
  }

  function restore(attempt = 0) {
    if (!shouldRestoreDashboardTab()) return false;
    if (restoredThisLoad) return false;
    const id = storedRestorableTabId();
    if (!id) return false;
    const button = document.getElementById(id);
    if (!button) {
      if (attempt < 80) window.setTimeout(() => restore(attempt + 1), 125);
      return attempt < 80;
    }
    if (button.disabled || button.hidden) {
      if (attempt < 80) window.setTimeout(() => restore(attempt + 1), 125);
      return attempt < 80;
    }
    restoredThisLoad = true;
    window.setTimeout(() => {
      button.click();
      clearRestoringWhenReady(id);
    }, 180);
    return true;
  }

  function handleReadyState() {
    if (!dashboardReady()) return false;
    if (!restore()) clearRestoring();
    return true;
  }

  function bind() {
    document.addEventListener('click', (event) => {
      const button = event.target.closest('button[id]');
      if (!button || !tabButtons.includes(button.id)) return;
      remember(button.id);
    }, true);

    document.addEventListener('click', (event) => {
      if (event.target.closest('[data-close], .modal-close, .back-button, .portal-tab-back, [aria-label="Back"], [aria-label="Close"]')) {
        if (event.target.closest('#concernsModal') || event.target.closest('[data-close="concernsModal"]')) rememberMainCalendar();
        window.setTimeout(() => {
          const activePage = document.querySelector('.admin-tab-page.is-active, .conference-room-page.is-active, dialog[open]');
          if (!activePage) rememberMainCalendar();
        }, 0);
      }
    }, true);

    const observer = new MutationObserver(() => {
      if (handleReadyState()) {
        observer.disconnect();
      }
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });

    window.addEventListener('pageshow', () => {
      handleReadyState();
    });

    window.setTimeout(() => {
      if (dashboardReady() || !storedRestorableTabId()) clearRestoring();
    }, 1200);

    window.setTimeout(() => {
      clearRestoring();
    }, 4000);
  }

  function init() {
    injectStyle();
    markRestoring();
    bind();
    handleReadyState();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
