const PLF_SESSION_KEY = 'core_supabase_auth_session';
const PLF_TAB_MODAL_IDS = new Set(['eventRequestsModal', 'announcementsModal', 'usersModal']);
let plfOrgSnapshot = null;

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

function plfStore() { return window.CONNECT_STATE?.store || null; }
function plfPortalUser() {
  const store = plfStore();
  return (store?.users || []).find((user) => user.id === store.currentUserId) || {};
}
function plfIsOrgUser() { return plfPortalUser().role === 'organization_manager'; }
function plfCurrentUserId() { return window.CONNECT_STATE?.store?.currentUserId || plfSession()?.user?.id || ''; }
function plfUuid(value) {
  const text = String(value || '');
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : null;
}

function plfHeaders() {
  const key = window.SUPABASE_CONFIG?.publishableKey || '';
  return { apikey: key, Authorization: `Bearer ${plfSession()?.access_token || key}`, 'Content-Type': 'application/json' };
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

async function plfPostCalendarItem(payload) {
  const response = await fetch(`${window.SUPABASE_CONFIG.url}/rest/v1/calendar_items?on_conflict=id`, {
    method: 'POST',
    headers: { ...plfHeaders(), Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || err.error || `Calendar item save failed (${response.status})`);
  }
}

function plfCleanSchedulePayload(row, status, recommendation) {
  const now = new Date().toISOString();
  return { approval_status: status, admin_recommendation: recommendation || row.admin_recommendation || null, approval_date: row.approval_date || now, approved_by: status === 'approved' ? plfCurrentUserId() : null, reviewed_by: plfCurrentUserId() || row.reviewed_by || null, revision_status: row.revision_of ? status : (row.revision_status || null), event_status: row.event_status || 'planned', notification_status: 'unread', updated_at: row.updated_at || now };
}

function plfFullSchedulePayload(row) {
  return { category_id: row.category_id || null, title: row.title || null, venue: row.venue || null, schedule_type: row.schedule_type || null, start_time: row.start_time || null, end_time: row.end_time || null, occurrences: Array.isArray(row.occurrences) ? row.occurrences : [], expected_attendees: row.expected_attendees || null, privacy_level: row.privacy_level || 'basic', contact_person: row.contact_person || null, contact_info: row.contact_info || null, public_description: row.public_description || null, purpose: row.purpose || null, approval_status: row.approval_status || 'approved', admin_recommendation: row.admin_recommendation || null, approval_date: row.approval_date || new Date().toISOString(), approved_by: row.approved_by || plfCurrentUserId() || null, reviewed_by: row.reviewed_by || plfCurrentUserId() || null, revision_of: row.revision_of || null, original_schedule_id: row.original_schedule_id || null, revision_status: row.revision_status || null, revision_history: Array.isArray(row.revision_history) ? row.revision_history : [], event_status: row.event_status || 'planned', notification_status: 'unread', updated_at: row.updated_at || new Date().toISOString() };
}

function plfEventById(id) { return (window.CONNECT_STATE?.store?.events || []).find((item) => item.id === id); }

function plfLocalIso(date, time) {
  const value = new Date(`${date}T${time}:00`);
  return Number.isNaN(value.getTime()) ? '' : value.toISOString();
}
function plfDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function plfTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toTimeString().slice(0, 5);
}
function plfToast(message, type = 'info') {
  const region = document.getElementById('toastRegion');
  if (!region) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  region.appendChild(toast);
  setTimeout(() => toast.remove(), 4200);
}
function plfOwnsSchedule(row = {}) {
  const user = plfPortalUser();
  const userOrgName = String(user.organization_name || user.organizationName || '').trim().toLowerCase();
  const rowOrgName = String(row.organization_name || '').trim().toLowerCase();
  return plfIsOrgUser() && row.record_type === 'schedule' && (row.created_by === user.id || (row.organization_id && user.organization_id && row.organization_id === user.organization_id) || (rowOrgName && userOrgName && rowOrgName === userOrgName));
}
function plfOrgFormSnapshot(seed = {}) {
  const get = (id) => document.getElementById(id)?.value || '';
  const user = plfPortalUser();
  const scheduleType = get('eventScheduleType') || 'single_day';
  const startDate = get('eventDate');
  const endDate = scheduleType === 'multi_day' ? get('eventEndDate') : startDate;
  const occurrence = { id: seed.occurrences?.[0]?.id || crypto.randomUUID(), date: startDate, start_time: plfLocalIso(startDate, get('eventStart')), end_time: plfLocalIso(endDate, get('eventEnd')) };
  return { ...seed, id: seed.id || get('eventId') || crypto.randomUUID(), record_type: 'schedule', category_id: get('eventCategory'), title: get('eventTitle').trim(), venue: get('eventVenue').trim(), schedule_type: scheduleType, start_time: occurrence.start_time, end_time: occurrence.end_time, occurrences: [occurrence], expected_attendees: Number.parseInt(get('eventAttendees'), 10) || 1, privacy_level: get('eventPrivacy') || 'basic', contact_person: get('eventContactPerson').trim(), contact_info: get('eventContactInfo').trim(), public_description: get('eventPublicDescription').trim(), purpose: get('eventPurpose').trim(), organization_id: seed.organization_id || user.organization_id || null, organization_name: seed.organization_name || user.organization_name || user.organizationName || '', approval_status: 'pending', event_status: seed.event_status || 'planned', notification_status: 'unread', created_by: user.id, created_at: seed.created_at || new Date().toISOString(), updated_at: new Date().toISOString(), schedule_schema_version: 2 };
}
function plfOrgDbRow(row) {
  return { id: row.id, record_type: 'schedule', organization_id: plfUuid(row.organization_id), category_id: row.category_id || null, title: row.title || null, venue: row.venue || null, schedule_type: row.schedule_type || 'single_day', start_time: row.start_time || null, end_time: row.end_time || null, occurrences: Array.isArray(row.occurrences) ? row.occurrences : [], expected_attendees: row.expected_attendees || 1, privacy_level: row.privacy_level || 'basic', contact_person: row.contact_person || null, contact_info: row.contact_info || null, public_description: row.public_description || null, purpose: row.purpose || null, approval_status: row.approval_status || 'pending', event_status: row.event_status || 'planned', notification_status: row.notification_status || 'unread', created_by: row.created_by || plfPortalUser().id, created_at: row.created_at || new Date().toISOString(), updated_at: row.updated_at || new Date().toISOString() };
}
function plfShowOrgButtons() {
  const row = window.CONNECT_STATE?.selectedDetails?.record;
  if (!plfOwnsSchedule(row)) return;
  ['detailsEditButton', 'detailsDeleteButton'].forEach((id) => {
    const button = document.getElementById(id);
    if (!button) return;
    button.hidden = false; button.disabled = false; button.classList.remove('action-hidden'); button.style.display = '';
  });
}
function plfOpenOrgEdit(row) {
  const occurrences = Array.isArray(row.occurrences) && row.occurrences.length ? row.occurrences : [{ start_time: row.start_time, end_time: row.end_time, date: plfDate(row.start_time) }];
  const first = occurrences[0]; const last = occurrences[occurrences.length - 1];
  const set = (id, value) => { const el = document.getElementById(id); if (el) el.value = value || ''; };
  set('eventId', row.id); set('eventCategory', row.category_id); set('eventTitle', row.title); set('eventVenue', row.venue); set('eventScheduleType', row.schedule_type || 'single_day'); set('eventDate', first.date || plfDate(first.start_time)); set('eventStart', plfTime(first.start_time)); set('eventEndDate', last.date || plfDate(last.end_time)); set('eventEnd', plfTime(last.end_time)); set('eventAttendees', row.expected_attendees); set('eventPrivacy', row.privacy_level || 'basic'); set('eventContactPerson', row.contact_person); set('eventContactInfo', row.contact_info); set('eventPublicDescription', row.public_description); set('eventPurpose', row.purpose);
  document.getElementById('detailsModal')?.close(); document.getElementById('eventModal')?.showModal();
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
      } catch (error) { console.warn('Direct approval status save failed:', error.message); }
    }, 500);
  }, true);
}

function plfBindOrgScheduleFallback() {
  document.addEventListener('submit', (event) => {
    if (event.target?.id !== 'eventForm' || !plfIsOrgUser()) return;
    const id = document.getElementById('eventId')?.value || '';
    plfOrgSnapshot = plfOrgFormSnapshot(plfEventById(id) || {});
  }, true);
  document.addEventListener('click', (event) => {
    if (event.target?.id === 'agreementSubmitButton' && plfIsOrgUser()) {
      const snapshot = plfOrgSnapshot || window.CONNECT_STATE?.pendingEvent;
      if (snapshot) window.setTimeout(() => plfPostCalendarItem(plfOrgDbRow(snapshot)).then(() => plfToast('Schedule saved to database.', 'success')).catch((error) => plfToast(`Org schedule save failed: ${error.message}`, 'error')), 700);
    }
    const selected = window.CONNECT_STATE?.selectedDetails?.record;
    if (!plfOwnsSchedule(selected)) return;
    if (event.target?.id === 'detailsEditButton') { event.preventDefault(); event.stopPropagation(); plfOpenOrgEdit(selected); }
    if (event.target?.id === 'detailsDeleteButton') { event.preventDefault(); event.stopPropagation(); plfPatchCalendarItem(selected.id, { event_status: 'cancelled', updated_at: new Date().toISOString() }).then(() => { selected.event_status = 'cancelled'; document.getElementById('detailsModal')?.close(); window.CONNECT_STATE?.calendar?.refetchEvents?.(); plfToast('Schedule removed from active calendar.', 'success'); }).catch((error) => plfToast(error.message, 'error')); }
  }, true);
  window.setInterval(plfShowOrgButtons, 500);
}

function plfInjectTabStyles() {
  if (document.getElementById('portal-tab-view-style')) return;
  const style = document.createElement('style');
  style.id = 'portal-tab-view-style';
  style.textContent = `dialog.portal-tab-view{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;max-width:none!important;max-height:none!important;margin:0!important;padding:0!important;border:0!important;background:#f8fafc!important;overflow:auto!important;z-index:2147483600!important}dialog.portal-tab-view::backdrop{background:transparent!important;backdrop-filter:none!important}dialog.portal-tab-view .modal-card{width:min(1180px,calc(100vw - 32px))!important;max-width:none!important;min-height:calc(100vh - 32px)!important;margin:16px auto!important;border-radius:24px!important;box-shadow:none!important}dialog.portal-tab-view .modal-header{position:sticky!important;top:0!important;background:rgba(248,250,252,.96)!important;z-index:3!important;padding-top:12px!important;border-bottom:1px solid rgba(148,163,184,.24)!important}.portal-tab-back{margin-right:12px!important;white-space:nowrap!important}body.portal-tab-open .calendar-panel{visibility:hidden!important}`;
  document.head.appendChild(style);
}
function plfMakeTabDialog(dialog) {
  if (!dialog || !PLF_TAB_MODAL_IDS.has(dialog.id)) return;
  dialog.classList.add('portal-tab-view');
  const header = dialog.querySelector('.modal-header');
  if (!header || header.querySelector('.portal-tab-back')) return;
  const back = document.createElement('button');
  back.type = 'button'; back.className = 'secondary-button portal-tab-back'; back.textContent = '← Back to Calendar View';
  back.addEventListener('click', () => { dialog.close(); document.body.classList.remove('portal-tab-open'); window.CONNECT_STATE?.calendar?.updateSize?.(); });
  header.prepend(back);
}
function plfWatchTabDialogs() {
  PLF_TAB_MODAL_IDS.forEach((id) => plfMakeTabDialog(document.getElementById(id)));
  const observer = new MutationObserver(() => {
    let anyOpen = false;
    PLF_TAB_MODAL_IDS.forEach((id) => { const dialog = document.getElementById(id); plfMakeTabDialog(dialog); if (dialog?.open) anyOpen = true; });
    document.body.classList.toggle('portal-tab-open', anyOpen);
  });
  PLF_TAB_MODAL_IDS.forEach((id) => { const dialog = document.getElementById(id); if (dialog) observer.observe(dialog, { attributes: true, attributeFilter: ['open'] }); });
}
function plfInit() { plfInjectTabStyles(); plfBindApprovalPersistence(); plfBindOrgScheduleFallback(); plfWatchTabDialogs(); }
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', plfInit);
else queueMicrotask(plfInit);
