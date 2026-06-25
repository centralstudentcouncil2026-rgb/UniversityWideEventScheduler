(() => {
  if (window.__publicAnnouncementPopup) return;
  window.__publicAnnouncementPopup = true;

  function isMobile() {
    return window.innerWidth <= 768 || (window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)').matches);
  }

  function announcementHtml() {
    const preview = document.getElementById('announcementPreview');
    const notices = [...(preview?.querySelectorAll('.notice') || [])];
    if (!notices.length) return '';
    return notices.map((notice) => notice.outerHTML).join('');
  }

  function ensureDialog() {
    let dialog = document.getElementById('publicAnnouncementPopup');
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.id = 'publicAnnouncementPopup';
    dialog.className = 'modal public-announcement-popup';
    dialog.innerHTML = `<article class="modal-card wide-modal"><div class="modal-header"><div><h3>Announcements</h3><p>Latest CSC S.Y.N.C. updates</p></div><button type="button" class="icon-button" data-public-announcement-close>&times;</button></div><div class="public-announcement-popup-body" id="publicAnnouncementPopupBody"></div></article>`;
    document.body.appendChild(dialog);
    dialog.querySelector('[data-public-announcement-close]')?.addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
    return dialog;
  }

  function injectStyle() {
    if (document.getElementById('public-announcement-popup-style')) return;
    const style = document.createElement('style');
    style.id = 'public-announcement-popup-style';
    style.textContent = `
      .public-announcement-popup::backdrop{background:rgba(7,28,61,.58)!important;backdrop-filter:blur(6px)!important;}
      .public-announcement-popup .modal-card{border-radius:24px!important;max-width:min(92vw,560px)!important;background:#fff!important;box-shadow:0 24px 70px rgba(7,28,61,.28)!important;}
      .public-announcement-popup .modal-header{background:linear-gradient(180deg,#ffffff,#f8fafc)!important;border-bottom:1px solid var(--aup-border,#e5e7eb)!important;}
      .public-announcement-popup-body{display:grid!important;gap:12px!important;padding:16px!important;}
      .public-announcement-popup .notice{background:#fff!important;border:1px solid #dbe4ef!important;border-radius:18px!important;padding:16px!important;box-shadow:0 12px 30px rgba(15,23,42,.08)!important;}
      .public-announcement-popup .notice strong{display:block!important;color:var(--aup-navy,#071c3d)!important;margin-bottom:8px!important;}
      .public-announcement-popup .notice p{margin:0!important;color:#475569!important;line-height:1.5!important;white-space:pre-wrap!important;overflow-wrap:anywhere!important;}
    `;
    document.head.appendChild(style);
  }

  function showOnce() {
    if (!isMobile()) return;
    if (sessionStorage.getItem('public_announcement_popup_seen')) return;
    const html = announcementHtml();
    if (!html) return;
    sessionStorage.setItem('public_announcement_popup_seen', '1');
    const dialog = ensureDialog();
    document.getElementById('publicAnnouncementPopupBody').innerHTML = html;
    setTimeout(() => { if (!document.querySelector('dialog[open]')) dialog.showModal(); }, 350);
  }

  function init() {
    injectStyle();
    const preview = document.getElementById('announcementPreview');
    if (preview) new MutationObserver(() => setTimeout(showOnce, 120)).observe(preview, { childList: true, subtree: true });
    setTimeout(showOnce, 900);
    window.addEventListener('resize', () => setTimeout(showOnce, 150), { passive: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else queueMicrotask(init);
})();
