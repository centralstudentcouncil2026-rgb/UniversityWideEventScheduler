const CIN_SYNC_MS = 1200;

function cinState() { return window.CONNECT_STATE || null; }
function cinStore() { return cinState()?.store || null; }
function cinUser() { const store = cinStore(); return (store?.users || []).find((user) => user.id === store.currentUserId) || {}; }
function cinIsAdmin() { const user = cinUser(); return user.role === 'super_admin' && user.permissions?.enabled !== false; }
function cinIsManager() { return cinUser().role === 'organization_manager'; }
function cinNotifications() { const store = cinStore(); if (!store) return []; if (!Array.isArray(store.notifications)) store.notifications = []; return store.notifications; }
function cinHasPendingAction(event = {}) { return ['edit', 'remove'].includes(event.pending_action) && event.revision_status === 'pending'; }
function cinIsCancellationRequest(event = {}) { return event.pending_action === 'remove' || event.revision_status === 'cancel_pending' || event.event_status === 'cancellation_requested'; }
function cinRead(event = {}) { return event.notification_status === 'read'; }
function cinIsSchedule(event) { return event?.record_type === 'schedule'; }
function cinIsPendingRequest(event) { return cinIsSchedule(event) && !cinRead(event) && event.created_by && event.created_by !== cinUser().id && ((event.approval_status === 'pending' && !event.pending_action) || cinHasPendingAction(event)); }
function cinIsCreatorResult(event) { return cinIsSchedule(event) && event.created_by === cinUser().id && !cinRead(event) && (['approved', 'rejected'].includes(event.approval_status) || ['approved', 'rejected'].includes(event.revision_status)); }

function cinUpsertNotification(notice) {
  if (!notice?.user_id || !notice?.reference_id) return;
  const list = cinNotifications();
  const existing = list.find((item) => item.notification_id === notice.notification_id);
  if (existing) Object.assign(existing, { title: notice.title, message: notice.message, notification_type: notice.notification_type, reference_id: notice.reference_id, created_at: notice.created_at || existing.created_at, is_read: existing.is_read === true ? true : Boolean(notice.is_read) });
  else list.push({ is_read: false, created_at: new Date().toISOString(), ...notice });
}
function cinPendingTitle(event) {
  if (event.pending_action === 'edit') return 'Schedule Edit Request';
  if (event.pending_action === 'remove') return 'Schedule Removal Requested';
  if (!event.revision_of) return 'New Schedule Request';
  return cinIsCancellationRequest(event) ? 'Schedule Removal Requested' : 'Schedule Edit Request';
}
function cinPendingMessage(event) {
  const org = event.organization_name || 'An organization';
  if (event.pending_action === 'edit') return `${org} edited "${event.title}". Approval is required before the approved schedule changes.`;
  if (event.pending_action === 'remove') return `${org} requested removal of "${event.title}". Approval is required before it is cancelled.`;
  if (!event.revision_of) return `${org} submitted "${event.title}" for approval.`;
  if (cinIsCancellationRequest(event)) return `${org} requested removal of "${event.title}". Approval is required before it is cancelled.`;
  return `${org} submitted an edit/revision for "${event.title}". Approval is required before the approved schedule changes.`;
}
function cinCreatorTitle(event, approved) {
  if (event.pending_action === 'remove' || cinIsCancellationRequest(event)) return `${approved ? 'Approved' : 'Rejected'} Schedule Removal Request`;
  if (event.pending_action === 'edit' || event.revision_of) return `${approved ? 'Approved' : 'Rejected'} Schedule Edit Request`;
  return `${approved ? 'Approved' : 'Rejected'} Schedule Request`;
}
function cinCreatorMessage(event) {
  const status = event.revision_status && ['approved', 'rejected'].includes(event.revision_status) ? event.revision_status : event.approval_status;
  if (event.pending_action === 'remove' || cinIsCancellationRequest(event)) return `Your removal request for "${event.title}" was ${status}.`;
  if (event.pending_action === 'edit' || event.revision_of) return `Your edit request for "${event.title}" was ${status}.`;
  return `Your schedule "${event.title}" was ${status}.`;
}

function cinBuildNotificationsFromCalendarItems() {
  const store = cinStore();
  const user = cinUser();
  if (!store || !user.id) return;
  if (cinIsAdmin()) {
    (store.events || []).filter(cinIsPendingRequest).forEach((event) => {
      const revision = Boolean(event.revision_of || event.pending_action);
      const removal = cinIsCancellationRequest(event);
      cinUpsertNotification({ notification_id: `${removal ? 'schedule-removal' : revision ? 'schedule-edit' : 'schedule-request'}-${event.id}-${user.id}`, user_id: user.id, notification_type: revision ? 'schedule_revision' : 'schedule_update', reference_id: event.id, title: cinPendingTitle(event), message: cinPendingMessage(event), is_read: false, created_at: event.updated_at || event.created_at || new Date().toISOString() });
    });
  }
  if (cinIsManager()) {
    (store.events || []).filter(cinIsCreatorResult).forEach((event) => {
      const status = event.revision_status && ['approved', 'rejected'].includes(event.revision_status) ? event.revision_status : event.approval_status;
      const approved = status === 'approved';
      cinUpsertNotification({ notification_id: `schedule-${status}-${event.id}-${user.id}`, user_id: user.id, notification_type: 'schedule_approval', reference_id: event.id, title: cinCreatorTitle(event, approved), message: cinCreatorMessage(event), is_read: false, created_at: event.approval_date || event.updated_at || new Date().toISOString() });
    });
  }
  cinNotifications().forEach((notice) => { const event = (store.events || []).find((item) => item.id === notice.reference_id); if (event && cinRead(event)) notice.is_read = true; });
  cinUpdateBadge();
}
function cinUpdateBadge() { const badge = document.getElementById('notificationBadge'); if (!badge) return; const count = cinNotifications().filter((item) => item.user_id === cinUser().id && !item.is_read).length; badge.textContent = String(count); badge.hidden = count === 0; }
function cinOpenEventRequests(notification) {
  const eventRequestsButton = document.getElementById('eventRequestsButton'); if (!eventRequestsButton) return false; eventRequestsButton.click();
  window.setTimeout(() => { const target = (cinStore()?.events || []).find((event) => event.id === notification.reference_id); if (!target) return; const cards = [...(document.getElementById('eventRequestsList')?.querySelectorAll('.activity-item') || [])]; const card = cards.find((item) => item.textContent.includes(target.title)); card?.scrollIntoView({ behavior: 'smooth', block: 'center' }); card?.classList.add('unread-notification'); }, 250);
  return true;
}
async function cinPersistRead(event) {
  if (!event?.id || !window.SUPABASE_CONFIG?.url) return;
  event.notification_status = 'read';
  try { await fetch(`${window.SUPABASE_CONFIG.url}/rest/v1/calendar_items?id=eq.${encodeURIComponent(event.id)}`, { method: 'PATCH', headers: { apikey: window.SUPABASE_CONFIG.publishableKey, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ notification_status: 'read' }) }); } catch (error) { console.warn('Notification read save skipped:', error); }
}
function cinMarkRead(notification) { if (!notification) return; notification.is_read = true; const event = (cinStore()?.events || []).find((item) => item.id === notification.reference_id); if (event) void cinPersistRead(event); cinUpdateBadge(); }
function cinBindClicks() {
  document.addEventListener('click', (clickEvent) => {
    const button = clickEvent.target.closest('[data-action="notification-open"],[data-action="notification-read"]'); if (!button) return;
    const notification = cinNotifications().find((item) => item.notification_id === button.dataset.id); if (!notification) return;
    if (button.dataset.action === 'notification-read') { window.setTimeout(() => cinMarkRead(notification), 0); return; }
    if (cinIsAdmin() && ['schedule_update', 'schedule_revision'].includes(notification.notification_type)) { clickEvent.preventDefault(); clickEvent.stopPropagation(); cinMarkRead(notification); const modal = document.getElementById('notificationsModal'); if (modal?.open) modal.close(); cinOpenEventRequests(notification); }
  }, true);
}
function cinInit() { cinBindClicks(); cinBuildNotificationsFromCalendarItems(); window.setInterval(cinBuildNotificationsFromCalendarItems, CIN_SYNC_MS); }
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', cinInit); else queueMicrotask(cinInit);
