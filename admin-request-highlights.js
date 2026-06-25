const ARH_INTERVAL_MS = 1200;
let arhFocusId = '';

function arhStore() { return window.CONNECT_STATE?.store || null; }
function arhUser() {
  const store = arhStore();
  return (store?.users || []).find((user) => user.id === store.currentUserId) || {};
}
function arhIsAdmin() { const user = arhUser(); return user.role === 'super_admin' && user.permissions?.enabled !== false; }
function arhIsRemoval(event = {}) { return event.revision_status === 'cancel_pending' || event.event_status === 'cancellation_requested'; }
function arhFormatDate(value) {
  if (!value) return 'Not set';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not set' : date.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}
function arhSchedule(event = {}) {
  const occurrence = Array.isArray(event.occurrences) && event.occurrences.length ? event.occurrences[0] : event;
  return `${arhFormatDate(occurrence.start_time)} to ${arhFormatDate(occurrence.end_time)}`;
}
function arhValue(value) { return value == null || value === '' ? '—' : String(value); }
function arhCardFor(id) {
  const buttons = [...(document.getElementById('eventRequestsList')?.querySelectorAll('[data-id]') || [])];
  return buttons.find((button) => button.dataset.id === id)?.closest('.activity-item') || null;
}
function arhChanges(request, original) {
  if (arhIsRemoval(request)) return ['Request: cancel/remove this approved schedule after admin approval.'];
  if (!original) return ['Original schedule could not be loaded. Review carefully before approval.'];
  return [
    ['Title', original.title, request.title],
    ['Venue', original.venue, request.venue],
    ['Schedule', arhSchedule(original), arhSchedule(request)],
    ['Attendees', original.expected_attendees, request.expected_attendees],
    ['Privacy', original.privacy_level, request.privacy_level],
    ['Contact Person', original.contact_person, request.contact_person],
    ['Contact Info', original.contact_info, request.contact_info],
    ['Description', original.public_description, request.public_description],
    ['Purpose', original.purpose, request.purpose]
  ].filter(([, before, after]) => arhValue(before) !== arhValue(after)).map(([label, before, after]) => `${label}: ${arhValue(before)} → ${arhValue(after)}`);
}
function arhStyle() {
  if (document.getElementById('admin-request-highlight-style')) return;
  const style = document.createElement('style');
  style.id = 'admin-request-highlight-style';
  style.textContent = '.admin-request-highlight{border:2px solid #f59e0b!important;background:#fffbeb!important;box-shadow:0 16px 36px rgba(245,158,11,.2)!important}.admin-edit-summary{margin:.75rem 0;padding:.75rem .9rem;border-radius:14px;background:#fff7ed;border:1px solid #fed7aa;color:#7c2d12}.admin-edit-summary strong{display:block;margin-bottom:.35rem;color:#9a3412}.admin-edit-summary p{margin:.25rem 0;font-size:.92rem}.admin-focus-pulse{animation:adminPulse 1.2s ease-in-out 2}@keyframes adminPulse{50%{outline:8px solid rgba(245,158,11,.28)}}';
  document.head.appendChild(style);
}
function arhDecorate(scroll = false) {
  if (!arhIsAdmin()) return;
  arhStyle();
  const store = arhStore();
  (store?.events || []).filter((event) => event.approval_status === 'pending' && event.revision_of).forEach((request) => {
    const card = arhCardFor(request.id);
    if (!card) return;
    card.classList.add('admin-request-highlight');
    if (!card.querySelector('.admin-edit-summary')) {
      const original = store.events.find((item) => item.id === request.revision_of);
      const box = document.createElement('div');
      box.className = 'admin-edit-summary';
      const title = document.createElement('strong');
      title.textContent = arhIsRemoval(request) ? 'Removal request needing approval' : 'Applied edit needing approval';
      box.appendChild(title);
      const rows = arhChanges(request, original);
      (rows.length ? rows : ['No visible field difference detected.']).forEach((line) => { const p = document.createElement('p'); p.textContent = line; box.appendChild(p); });
      card.appendChild(box);
    }
    if (scroll && request.id === arhFocusId) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card.classList.add('admin-focus-pulse');
      setTimeout(() => card.classList.remove('admin-focus-pulse'), 3000);
    }
  });
}
function arhBindNotificationFocus() {
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action="notification-open"]');
    if (!button || !arhIsAdmin()) return;
    const notice = (arhStore()?.notifications || []).find((item) => item.notification_id === button.dataset.id);
    if (!notice || !['schedule_revision', 'schedule_update'].includes(notice.notification_type)) return;
    arhFocusId = notice.reference_id;
    setTimeout(() => arhDecorate(true), 500);
    setTimeout(() => arhDecorate(true), 1000);
  }, true);
}
function arhInit() {
  arhStyle();
  arhBindNotificationFocus();
  setInterval(() => arhDecorate(false), ARH_INTERVAL_MS);
  const list = document.getElementById('eventRequestsList');
  if (list) new MutationObserver(() => arhDecorate(false)).observe(list, { childList: true, subtree: true });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arhInit);
else queueMicrotask(arhInit);
