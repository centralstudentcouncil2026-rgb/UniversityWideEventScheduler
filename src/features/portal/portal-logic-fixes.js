// Feature copy of virtual module: portal-logic-fixes.js
// Keep behavior identical until modular migration is verified.

const PLF_SESSION_KEY = 'core_supabase_auth_session';
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
  const key = window.SUPABASE_CONFIG?.publishableKey || window.SUPABASE_CONFIG?.anonKey || window.SUPABASE_CONFIG?.apiKey || window.SUPABASE_CONFIG?.apikey || '';
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

function plfIsCancellationRequest(row = {}) {
  return row.revision_status === 'cancel_pending' || row.event_status === 'cancellation_requested';
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
    updated_at: now
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
    approval_status: 'approved',
    admin_recommendation: row.admin_recommendation || null,
    approval_date: row.approval_date || new Date().toISOString(),
    approved_by: plfCurrentUserId() || null,
    reviewed_by: plfCurrentUserId() || null,
    revision_of: null,
    original_schedule_id: null,
    revision_status: 'approved',
    revision_history: Array.isArray(row.revision_history) ? row.revision_history : [],
    event_status: row.event_status === 'cancellation_requested' ? 'planned' : (row.event_status || 'planned'),
    notification_status: 'unread',
    updated_at: new Date().toISOString()
  };
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
  return plfIsOrgUser() && row.record_type === 'schedule' && row.created_by && row.created_by === user.id;
}
function plfApprovedOriginal(row = {}) {
  return row.approval_status === 'approved' && !row.revision_of && !plfIsCancellationRequest(row);
}
function plfOrgFormSnapshot(seed = {}) {
  const get = (id) => document.getElementById(id)?.value || '';
  const user = plfPortalUser();
  const scheduleType = get('eventScheduleType') || 'single_day';
  const startDate = get('eventDate');
  const endDate = scheduleType === 'multi_day' ? get('eventEndDate') : startDate;
  const approvedOriginal = plfApprovedOriginal(seed);
  const now = new Date().toISOString();
  const repeatRule = plfRepeatRule(get('eventRepeat') || get('eventRecurrenceType') || seed.repeat_rule || seed.recurrence_type || 'none');
  const repeatUntil = repeatRule === 'none' ? '' : (get('eventRepeatUntil') || get('eventRecurrenceUntil') || seed.repeat_until || seed.recurrence_until || '');
  const occurrence = { id: approvedOriginal ? crypto.randomUUID() : (seed.occurrences?.[0]?.id || crypto.randomUUID()), date: startDate, start_time: plfLocalIso(startDate, get('eventStart')), end_time: plfLocalIso(endDate, get('eventEnd')) };
  const occurrences = plfBuildRepeatedOccurrences(seed, occurrence, repeatRule, repeatUntil);
  const firstOccurrence = occurrences[0] || occurrence;
  const lastOccurrence = occurrences[occurrences.length - 1] || occurrence;
  return {
    ...(approvedOriginal ? {} : seed),
    id: approvedOriginal ? crypto.randomUUID() : (seed.id || get('eventId') || crypto.randomUUID()),
    record_type: 'schedule',
    category_id: get('eventCategory'),
    title: get('eventTitle').trim(),
    venue: get('eventVenue').trim(),
    schedule_type: occurrences.length > 1 && plfDate(firstOccurrence.start_time) === plfDate(firstOccurrence.end_time) ? 'single_day' : scheduleType,
    start_time: firstOccurrence.start_time,
    end_time: lastOccurrence.end_time,
    occurrences,
    expected_attendees: Number.parseInt(get('eventAttendees'), 10) || 1,
    privacy_level: get('eventPrivacy') || 'basic',
    contact_person: get('eventContactPerson').trim(),
    contact_info: get('eventContactInfo').trim(),
    public_description: get('eventPublicDescription').trim(),
    purpose: get('eventPurpose').trim(),
    organization_id: seed.organization_id || user.organization_id || null,
    organization_name: seed.organization_name || user.organization_name || user.organizationName || '',
    approval_status: 'pending',
    revision_of: approvedOriginal ? seed.id : (seed.revision_of || null),
    original_schedule_id: approvedOriginal ? seed.id : (seed.original_schedule_id || seed.revision_of || null),
    revision_status: approvedOriginal ? 'pending' : (seed.revision_status || null),
    request_type: approvedOriginal ? 'edit' : (seed.request_type || null),
    request_reason: seed.request_reason || null,
    requester_id: approvedOriginal ? user.id : (seed.requester_id || user.id),
    revision_created_at: approvedOriginal ? now : (seed.revision_created_at || null),
    revision_submitted_at: approvedOriginal ? now : (seed.revision_submitted_at || null),
    revision_history: approvedOriginal ? [...(seed.revision_history || []), { revision_id: crypto.randomUUID(), submitted_at: now, submitted_by: user.id, request_type: 'edit', status: 'pending' }] : (seed.revision_history || []),
    event_status: seed.event_status === 'cancelled' ? 'planned' : (seed.event_status || 'planned'),
    notification_status: 'unread',
    created_by: user.id,
    created_at: approvedOriginal ? now : (seed.created_at || now),
    updated_at: now,
    schedule_schema_version: 2
  };
}
function plfRepeatRule(value) {
  const rule = String(value || '').trim().toLowerCase();
  return ['daily', 'weekly', 'monthly', 'yearly'].includes(rule) ? rule : 'none';
}
function plfDaysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}
function plfAddRepeatInterval(date, rule, anchorDay = date.getDate()) {
  const next = new Date(date);
  if (rule === 'daily') next.setDate(next.getDate() + 1);
  else if (rule === 'weekly') next.setDate(next.getDate() + 7);
  else if (rule === 'monthly') {
    const monthIndex = next.getMonth() + 1;
    const year = next.getFullYear() + Math.floor(monthIndex / 12);
    const month = monthIndex % 12;
    next.setFullYear(year, month, Math.min(anchorDay, plfDaysInMonth(year, month)));
  } else if (rule === 'yearly') {
    const year = next.getFullYear() + 1;
    next.setFullYear(year, next.getMonth(), Math.min(anchorDay, plfDaysInMonth(year, next.getMonth())));
  }
  return next;
}
function plfBuildRepeatedOccurrences(seed, occurrence, repeatRule, repeatUntil) {
  if (repeatRule === 'none') return [occurrence];
  const start = new Date(occurrence.start_time);
  const end = new Date(occurrence.end_time);
  const until = repeatUntil ? new Date(plfLocalIso(String(repeatUntil).slice(0, 10), plfTime(occurrence.end_time))) : null;
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start || !until || Number.isNaN(until.getTime()) || until < start) return [occurrence];
  const duration = end.getTime() - start.getTime();
  const previous = Array.isArray(seed.occurrences) ? seed.occurrences : [];
  const rows = [];
  for (let cursor = new Date(start), index = 0; index < 730 && cursor <= until; index += 1) {
    const itemEnd = new Date(cursor.getTime() + duration);
    const date = plfDate(cursor);
    rows.push({
      id: previous[index]?.id || crypto.randomUUID(),
      date,
      start_time: plfLocalIso(date, plfTime(cursor)),
      end_time: plfLocalIso(plfDate(itemEnd), plfTime(itemEnd))
    });
    cursor = plfAddRepeatInterval(cursor, repeatRule, start.getDate());
  }
  return rows.length ? rows : [occurrence];
}
function plfOrgDbRow(row) {
  return {
    id: row.id,
    record_type: 'schedule',
    schedule_source: row.schedule_source || 'organization',
    created_by_role: row.created_by_role || 'organization',
    requires_approval: row.requires_approval !== false,
    organization_id: plfUuid(row.organization_id),
    organization_name: row.organization_name || plfPortalUser().organization_name || plfPortalUser().organizationName || null,
    category_id: row.category_id || null,
    title: row.title || null,
    venue: row.venue || null,
    schedule_type: row.schedule_type || 'single_day',
    start_time: row.start_time || null,
    end_time: row.end_time || null,
    occurrences: Array.isArray(row.occurrences) ? row.occurrences : [],
    expected_attendees: row.expected_attendees || 1,
    privacy_level: row.privacy_level || 'basic',
    contact_person: row.contact_person || null,
    contact_info: row.contact_info || null,
    public_description: row.public_description || null,
    purpose: row.purpose || null,
    approval_status: row.approval_status || 'pending',
    admin_recommendation: row.admin_recommendation || null,
    approval_date: row.approval_date || null,
    reviewed_by: plfUuid(row.reviewed_by),
    approved_by: plfUuid(row.approved_by),
    revision_of: row.revision_of || null,
    original_schedule_id: row.original_schedule_id || null,
    revision_status: row.revision_status || null,
    request_type: row.request_type || null,
    request_reason: row.request_reason || null,
    requester_id: plfUuid(row.requester_id),
    revision_created_at: row.revision_created_at || null,
    revision_submitted_at: row.revision_submitted_at || null,
    revision_history: Array.isArray(row.revision_history) ? row.revision_history : [],
    event_status: row.event_status || 'planned',
    notification_status: row.notification_status || 'unread',
    created_by: row.created_by || plfPortalUser().id,
    created_at: row.created_at || new Date().toISOString(),
    updated_at: row.updated_at || new Date().toISOString()
  };
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
          if (original && plfIsCancellationRequest(row)) {
            await plfPatchCalendarItem(original.id, { event_status: 'cancelled', notification_status: 'unread', updated_at: new Date().toISOString() });
          } else if (original) {
            await plfPatchCalendarItem(original.id, { event_status: 'disabled', notification_status: 'read', updated_at: new Date().toISOString() });
            await plfPatchCalendarItem(row.id, { ...plfFullSchedulePayload(row), created_by: row.created_by || original.created_by, created_at: row.created_at || new Date().toISOString(), event_status: row.event_status === 'cancellation_requested' ? 'planned' : (row.event_status || 'planned'), revision_of: null, original_schedule_id: null, revision_status: null });
          }
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
}

function plfInit() { plfBindApprovalPersistence(); plfBindOrgScheduleFallback(); }
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', plfInit);
else queueMicrotask(plfInit);
