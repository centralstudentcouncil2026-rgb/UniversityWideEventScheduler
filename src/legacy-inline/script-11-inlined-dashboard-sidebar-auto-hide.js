// Extracted from org-dashboard.html inline script #11 id=inlined-dashboard-sidebar-auto-hide attrs=id="inlined-dashboard-sidebar-auto-hide"

(() => {
  if (window.__dashboardSidebarAutoHide) return;
  window.__dashboardSidebarAutoHide = true;

  function injectStyle() {
    if (document.getElementById('dashboard-sidebar-auto-hide-style')) return;
    const style = document.createElement('style');
    style.id = 'dashboard-sidebar-auto-hide-style';
    style.textContent = `
      body.portal-shell.sidebar-auto-hide .app-shell{grid-template-columns:minmax(0,1fr)!important;}
      body.portal-shell.sidebar-auto-hide #mobileMenuButton{align-items:center!important;aspect-ratio:1/1!important;display:inline-flex!important;flex:0 0 auto!important;flex-direction:column!important;gap:3px!important;justify-content:center!important;}
      body.portal-shell.sidebar-auto-hide:not(.personal-calendar-perspective) #mobileMenuButton::before{content:none!important;}
      body.portal-shell.sidebar-auto-hide:not(.personal-calendar-perspective) #mobileMenuButton span{background:currentColor!important;border-radius:999px!important;display:block!important;height:2px!important;width:22px!important;}
      body.portal-shell.sidebar-auto-hide .calendar-panel{grid-column:1/-1!important;}
      body.portal-shell.sidebar-auto-hide .sidebar{
        border-radius:0!important;
        border-right:0!important;
        bottom:0!important;
        box-sizing:border-box!important;
        box-shadow:var(--shadow,0 22px 60px rgba(15,23,42,.18))!important;
        display:flex!important;
        flex:0 0 min(86vw,320px)!important;
        flex-direction:column!important;
        height:100dvh!important;
        left:0!important;
        max-height:100dvh!important;
        max-width:320px!important;
        min-height:0!important;
        overflow:hidden!important;
        overscroll-behavior:contain!important;
        padding:14px!important;
        padding-top:16px!important;
        position:fixed!important;
        top:0!important;
        transform:translateX(-102%)!important;
        transition:transform 180ms ease!important;
        width:min(86vw,320px)!important;
        z-index:60!important;
      }
      body.portal-shell.sidebar-auto-hide .sidebar-scroll-area{
        box-sizing:border-box!important;
        flex:1 1 auto!important;
        min-height:0!important;
        overflow-x:hidden!important;
        overflow-y:auto!important;
        scrollbar-gutter:stable!important;
        width:100%!important;
      }
      body.portal-shell.sidebar-auto-hide .account-section{
        box-sizing:border-box!important;
        flex:0 0 auto!important;
        margin-top:auto!important;
        width:100%!important;
      }
      body.portal-shell.sidebar-auto-hide .sidebar.open{transform:translateX(0)!important;}
      body.portal-shell.sidebar-auto-hide .mobile-scrim{
        background:rgba(0,33,71,.36)!important;
        bottom:0!important;
        display:block!important;
        left:0!important;
        opacity:0!important;
        pointer-events:none!important;
        position:fixed!important;
        right:0!important;
        top:0!important;
        transition:opacity 180ms ease,visibility 180ms ease!important;
        visibility:hidden!important;
        z-index:55!important;
      }
      body.portal-shell.sidebar-auto-hide .mobile-scrim.open{
        opacity:1!important;
        pointer-events:auto!important;
        visibility:visible!important;
      }
      body.portal-shell.sidebar-drawer-open{overflow:hidden!important;}
    `;
    document.head.appendChild(style);
  }

  function calendarApi() {
    return window.CONNECT_STATE?.calendar || window.calendar;
  }

  function refreshCalendar() {
    requestAnimationFrame(() => {
      calendarApi()?.updateSize?.();
    });
  }

  function setOpen(open) {
    const sidebar = document.getElementById('sidebar');
    const scrim = document.getElementById('mobileScrim');
    const button = document.getElementById('mobileMenuButton');
    if (!sidebar) return;
    const inPersonalCalendar = document.body.classList.contains('personal-calendar-perspective');
    const wasOpen = sidebar.classList.contains('open');
    sidebar.classList.toggle('open', open);
    scrim?.classList.toggle('open', open);
    document.body.classList.toggle('sidebar-drawer-open', open);
    button?.setAttribute('aria-expanded', String(open));
    if (inPersonalCalendar) {
      button?.setAttribute('aria-label', 'Back to main dashboard calendar');
      button?.setAttribute('title', 'Back to main dashboard calendar');
    } else {
      button?.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      if (!open) button?.removeAttribute('title');
    }
    if (wasOpen !== open) refreshCalendar();
  }

  function closeSidebar() {
    setOpen(false);
  }

  window.CSC_CLOSE_SIDEBAR = closeSidebar;

  function toggleSidebar(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (document.body.classList.contains('personal-calendar-perspective')) {
      closeSidebar();
      window.CSC_CLOSE_PERSONAL_CALENDAR?.();
      return;
    }
    const sidebar = document.getElementById('sidebar');
    setOpen(!sidebar?.classList.contains('open'));
  }

  function bind() {
    const button = document.getElementById('mobileMenuButton');
    const scrim = document.getElementById('mobileScrim');
    if (!button || button.dataset.sidebarAutoHideBound === '1') return;
    button.dataset.sidebarAutoHideBound = '1';
    button.setAttribute('aria-controls', 'sidebar');
    button.setAttribute('aria-expanded', 'false');
    button.addEventListener('click', toggleSidebar, true);
    scrim?.addEventListener('click', closeSidebar);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeSidebar();
    });
    document.getElementById('sidebar')?.addEventListener('click', (event) => {
      if (event.target.closest('button,a,[role="tab"],.sidebar-tab')) {
        window.setTimeout(closeSidebar, 80);
      }
    });
    window.addEventListener('resize', closeSidebar, { passive: true });
    closeSidebar();
  }

  function init() {
    document.body.classList.add('sidebar-auto-hide');
    injectStyle();
    bind();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
