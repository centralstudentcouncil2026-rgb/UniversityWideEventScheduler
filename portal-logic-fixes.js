const PLF_SESSION_KEY = 'core_supabase_auth_session';
const PLF_TAB_MODAL_IDS = new Set(['eventRequestsModal', 'announcementsModal', 'usersModal']);

function plfHex(length) {
  const bytes = new Uint8Array(Math.ceil(length / 2));
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, length);
}

function plfValidUuid() {
  return `${plfHex(8)}-${plfHex(4)}-4${plfHex(3)}-${['8', '9', 'a', 'b'][Math.floor(Math.random() * 4)]}${plfHex(3)}-${plfHex(12)}`;
}

try {
  Object.defineProperty(window.crypto, 'randomUUID', { value: plfValidUuid, configurable: true });
} catch {}

function plfSession() {
  try { return JSON.parse(sessionStorage.getItem(PLF_SESSION_KEY) || 'null'); }
  catch { return null; }
}

function plfCurrentUserId() {
  return window.CONNECT_STATE?.store?.currentUserId || plfSession()?.user?.id || '';
}

function plfHeaders() {
  const key = window.SUPABASE_CONFIG?.publishableKey || '';
  return {
    apikey: key,
    Authorization: `Bearer ${plfSession()?.access_token || key}`,
    'Content-Type': 'application/json'
  };
}

async function plfPatchCalendarItem(id, payload) {
  if (!id || !window.SUPABASE_CONFIG?.url) return;
  const response = await fetch(`${window.SUPABASE_CONFIG.url}/rest/v1/calendar_items?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { ...plfHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || err.error || `Calendar item patch failed (${response.status})`);
  }
}

function plfCleanSchedulePayload(row, status, recommendation) {
  const now = new Date().toISOString();
  return {
    approval_status: status,
    admin_recommendation: recommendation || row.admin_recommendation || null,
    approval_date: row.approval_date || now,
    approved_by: status === 'approved' ? plfCurrentUserId() : null,
    reviewed_by: plfCurrentUserId() || row.reviewed_by || null,
    revision_status: row.revision_of ? status : (row.revision_status || null),
    event_status: row.event_status || 'planned',
    notification_status: 'unread',
    updated_at: row.updated_at || now
  };
}

function plfFullSchedulePayload(row) {
  return {
    category_id: row.category_id || null,
    title: row.title || null,
    venue: row.venue || null,
    schedule_type: row.schedule_type || null,
    start_time: row.start_time || null,
    end_time: row.end_time || null,
    occurrences: Array.isArray(row.occurrences) ? row.occurrences : [],
    expected_attendees: row.expected_attendees || null,
    privacy_level: row.privacy_level || 'basic',
    contact_person: row.contact_person || null,
    contact_info: row.contact_info || null,
    public_description: row.public_description || null,
    purpose: row.purpose || null,
    approval_status: row.approval_status || 'approved',
    admin_recommendation: row.admin_recommendation || null,
    approval_date: row.approval_date || new Date().toISOString(),
    approved_by: row.approved_by || plfCurrentUserId() || null,
    reviewed_by: row.reviewed_by || plfCurrentUserId() || null,
    revision_of: row.revision_of || null,
    original_schedule_id: row.original_schedule_id || null,
    revision_status: row.revision_status || null,
    revision_history: Array.isArray(row.revision_history) ? row.revision_history : [],
    event_status: row.event_status || 'planned',
    notification_status: 'unread',
    updated_at: row.updated_at || new Date().toISOString()
  };
}

function plfEventById(id) {
  return (window.CONNECT_STATE?.store?.events || []).find((item) => item.id === id);
}

function plfBindApprovalPersistence() {
  document.addEventListener('submit', (event) => {
    if (event.target?.id !== 'eventReviewForm') return;
    const id = document.getElementById('eventReviewId')?.value || '';
    const status = document.getElementById('eventReviewStatus')?.value || '';
    const recommendation = document.getElementById('eventReviewRecommendation')?.value || '';
    window.setTimeout(async () => {
      const row = plfEventById(id);
      if (!row || !['approved', 'rejected'].includes(status)) return;
      try {
        await plfPatchCalendarItem(row.id, plfCleanSchedulePayload(row, status, recommendation));
        if (status === 'approved' && row.revision_of) {
          const original = plfEventById(row.revision_of);
          if (original) await plfPatchCalendarItem(original.id, plfFullSchedulePayload(original));
        }
      } catch (error) {
        console.warn('Direct approval status save failed:', error.message);
      }
    }, 500);
  }, true);
}

function plfInjectTabStyles() {
  if (document.getElementById('portal-tab-view-style')) return;
  const style = document.createElement('style');
  style.id = 'portal-tab-view-style';
  style.textContent = `
    dialog.portal-tab-view{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;max-width:none!important;max-height:none!important;margin:0!important;padding:0!important;border:0!important;background:#f8fafc!important;overflow:auto!important;z-index:2147483600!important}
    dialog.portal-tab-view::backdrop{background:transparent!important;backdrop-filter:none!important}
    dialog.portal-tab-view .modal-card{width:min(1180px,calc(100vw - 32px))!important;max-width:none!important;min-height:calc(100vh - 32px)!important;margin:16px auto!important;border-radius:24px!important;box-shadow:none!important}
    dialog.portal-tab-view .modal-header{position:sticky!important;top:0!important;background:rgba(248,250,252,.96)!important;z-index:3!important;padding-top:12px!important;border-bottom:1px solid rgba(148,163,184,.24)!important}
    .portal-tab-back{margin-right:12px!important;white-space:nowrap!important}
    body.portal-tab-open .calendar-panel{visibility:hidden!important}
  `;
  document.head.appendChild(style);
}

function plfMakeTabDialog(dialog) {
  if (!dialog || !PLF_TAB_MODAL_IDS.has(dialog.id)) return;
  dialog.classList.add('portal-tab-view');
  const header = dialog.querySelector('.modal-header');
  if (!header || header.querySelector('.portal-tab-back')) return;
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'secondary-button portal-tab-back';
  back.textContent = '← Back to Calendar View';
  back.addEventListener('click', () => {
    dialog.close();
    document.body.classList.remove('portal-tab-open');
    window.CONNECT_STATE?.calendar?.updateSize?.();
  });
  header.prepend(back);
}

function plfWatchTabDialogs() {
  PLF_TAB_MODAL_IDS.forEach((id) => plfMakeTabDialog(document.getElementById(id)));
  const observer = new MutationObserver(() => {
    let anyOpen = false;
    PLF_TAB_MODAL_IDS.forEach((id) => {
      const dialog = document.getElementById(id);
      plfMakeTabDialog(dialog);
      if (dialog?.open) anyOpen = true;
    });
    document.body.classList.toggle('portal-tab-open', anyOpen);
  });
  PLF_TAB_MODAL_IDS.forEach((id) => {
    const dialog = document.getElementById(id);
    if (dialog) observer.observe(dialog, { attributes: true, attributeFilter: ['open'] });
  });
}

function plfInit() {
  plfInjectTabStyles();
  plfBindApprovalPersistence();
  plfWatchTabDialogs();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', plfInit);
else queueMicrotask(plfInit);
