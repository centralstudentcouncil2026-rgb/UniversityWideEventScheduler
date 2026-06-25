(() => {
  if (window.__adminTabsFullPage) return;
  window.__adminTabsFullPage = true;

  const TAB_IDS = ['eventRequestsModal', 'announcementsModal', 'usersModal'];

  function injectStyle() {
    if (document.getElementById('admin-tabs-fullpage-style')) return;
    const style = document.createElement('style');
    style.id = 'admin-tabs-fullpage-style';
    style.textContent = `
      dialog.admin-tab-fullpage,
      dialog.portal-tab-view.admin-tab-fullpage{
        position:fixed!important;
        inset:0!important;
        width:100vw!important;
        height:100dvh!important;
        max-width:none!important;
        max-height:none!important;
        margin:0!important;
        padding:0!important;
        border:0!important;
        border-radius:0!important;
        background:#f8fafc!important;
        overflow:hidden!important;
        z-index:2147483600!important;
      }
      dialog.admin-tab-fullpage::backdrop,
      dialog.portal-tab-view.admin-tab-fullpage::backdrop{
        background:#f8fafc!important;
        backdrop-filter:none!important;
      }
      dialog.admin-tab-fullpage .modal-card,
      dialog.portal-tab-view.admin-tab-fullpage .modal-card,
      body.ui-light-cards-enabled dialog.admin-tab-fullpage .modal-card,
      body.ui-light-cards-enabled dialog.portal-tab-view.admin-tab-fullpage .modal-card{
        width:100vw!important;
        max-width:none!important;
        min-height:100dvh!important;
        height:100dvh!important;
        margin:0!important;
        padding:0!important;
        border:0!important;
        border-radius:0!important;
        box-shadow:none!important;
        background:#f8fafc!important;
        display:grid!important;
        grid-template-rows:auto 1fr!important;
        overflow:hidden!important;
      }
      dialog.admin-tab-fullpage .modal-header,
      dialog.portal-tab-view.admin-tab-fullpage .modal-header{
        position:sticky!important;
        top:0!important;
        z-index:20!important;
        display:flex!important;
        align-items:center!important;
        justify-content:space-between!important;
        gap:16px!important;
        width:100%!important;
        min-height:74px!important;
        padding:14px clamp(16px,3vw,36px)!important;
        background:rgba(255,255,255,.96)!important;
        border-bottom:1px solid #e2e8f0!important;
        box-shadow:0 10px 30px rgba(15,23,42,.07)!important;
        backdrop-filter:blur(14px)!important;
      }
      dialog.admin-tab-fullpage .modal-header h2,
      dialog.admin-tab-fullpage .modal-header h3,
      dialog.portal-tab-view.admin-tab-fullpage .modal-header h2,
      dialog.portal-tab-view.admin-tab-fullpage .modal-header h3{
        margin:0!important;
        font-size:clamp(1.25rem,2vw,1.75rem)!important;
        color:#0f172a!important;
        letter-spacing:-.035em!important;
      }
      dialog.admin-tab-fullpage .modal-header p,
      dialog.portal-tab-view.admin-tab-fullpage .modal-header p{
        margin:.2rem 0 0!important;
        color:#64748b!important;
      }
      dialog.admin-tab-fullpage .portal-tab-back,
      dialog.portal-tab-view.admin-tab-fullpage .portal-tab-back{
        border-radius:999px!important;
        min-height:42px!important;
        padding:0 16px!important;
        background:#fff!important;
        border:1px solid #cbd5e1!important;
      }
      dialog.admin-tab-fullpage .icon-button,
      dialog.portal-tab-view.admin-tab-fullpage .icon-button{
        flex:0 0 auto!important;
      }
      dialog.admin-tab-fullpage .modal-card > :not(.modal-header),
      dialog.portal-tab-view.admin-tab-fullpage .modal-card > :not(.modal-header){
        min-height:0!important;
        overflow:auto!important;
        padding:clamp(14px,2.4vw,32px)!important;
      }
      dialog.admin-tab-fullpage .modal-actions,
      dialog.portal-tab-view.admin-tab-fullpage .modal-actions{
        margin:0!important;
      }
      dialog.admin-tab-fullpage .form-grid,
      dialog.portal-tab-view.admin-tab-fullpage .form-grid,
      body.ui-light-cards-enabled dialog.admin-tab-fullpage .form-grid,
      body.ui-light-cards-enabled dialog.portal-tab-view.admin-tab-fullpage .form-grid{
        margin:clamp(14px,2vw,24px)!important;
        padding:18px!important;
        border:1px solid #e2e8f0!important;
        border-radius:22px!important;
        background:#fff!important;
        box-shadow:0 12px 34px rgba(15,23,42,.07)!important;
      }
      dialog.admin-tab-fullpage #eventRequestsList,
      dialog.portal-tab-view.admin-tab-fullpage #eventRequestsList,
      dialog.admin-tab-fullpage #announcementsList,
      dialog.portal-tab-view.admin-tab-fullpage #announcementsList,
      dialog.admin-tab-fullpage #usersList,
      dialog.portal-tab-view.admin-tab-fullpage #usersList,
      dialog.admin-tab-fullpage #accountRequestsList,
      dialog.portal-tab-view.admin-tab-fullpage #accountRequestsList{
        width:100%!important;
      }
      dialog.admin-tab-fullpage #eventRequestFilters,
      dialog.portal-tab-view.admin-tab-fullpage #eventRequestFilters{
        margin:0 0 18px!important;
      }
      body.portal-tab-open .topbar,
      body.portal-tab-open .sidebar,
      body.portal-tab-open .calendar-panel{
        visibility:hidden!important;
      }
      @media(max-width:760px){
        dialog.admin-tab-fullpage .modal-header,
        dialog.portal-tab-view.admin-tab-fullpage .modal-header{
          min-height:66px!important;
          padding:12px 14px!important;
        }
        dialog.admin-tab-fullpage .portal-tab-back,
        dialog.portal-tab-view.admin-tab-fullpage .portal-tab-back{
          padding:0 12px!important;
          font-size:.9rem!important;
        }
        dialog.admin-tab-fullpage .modal-card > :not(.modal-header),
        dialog.portal-tab-view.admin-tab-fullpage .modal-card > :not(.modal-header){
          padding:12px!important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function apply() {
    TAB_IDS.forEach((id) => {
      const dialog = document.getElementById(id);
      if (!dialog) return;
      dialog.classList.add('admin-tab-fullpage', 'portal-tab-view');
      const card = dialog.querySelector('.modal-card');
      if (!card) return;
      card.classList.add('admin-tab-page-shell');
      const header = dialog.querySelector('.modal-header');
      if (header && !header.querySelector('.portal-tab-back')) {
        const back = document.createElement('button');
        back.type = 'button';
        back.className = 'secondary-button portal-tab-back';
        back.textContent = '← Back to Calendar';
        back.addEventListener('click', () => {
          dialog.close();
          document.body.classList.remove('portal-tab-open');
          window.CONNECT_STATE?.calendar?.updateSize?.();
        });
        header.prepend(back);
      }
    });
    document.body.classList.toggle('portal-tab-open', TAB_IDS.some((id) => document.getElementById(id)?.open));
  }

  function init() {
    injectStyle();
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open', 'class'] });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else queueMicrotask(init);
})();
