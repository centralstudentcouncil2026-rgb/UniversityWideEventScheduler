const CIN_SYNC_MS = 1200;

function cinState() {
  return window.CONNECT_STATE || null;
}

function cinStore() {
  return cinState()?.store || null;
}

function cinUser() {
  const store = cinStore();
  return (store?.users || []).find((user) => user.id === store.currentUserId) || {};
}

function cinIsAdmin() {
  const user = cinUser();
  return user.role === 'super_admin' && user.permissions?.enabled !== false;
}

function cinIsManager() {
  return cinUser().role === 'organization_manager';
}

function cinNotifications() {
  const store = cinStore();
  if (!store) return [];
  if (!Array.isArray(store.notifications)) store.notifications = [];
  return store.notifications;
}

function cinUpsertNotification(notice) {
  if (!notice?.user_id || !notice?.reference_id) return;
  const list = cinNotifications();
  const existing = list.find((item) => item.notification_id === notice.notification_id);
  if (existing) {
    Object.assign(existing, {
      title: notice.title,
      message: notice.message,
      notification_type: notice.notification_type,
      reference_id: notice.reference_id,
      created_at: notice.created_at || existing.created_at,
      is_read: existing.is_read === true ? true : Boolean(notice.is_read)
    });
  } else {
    list.push({ is_read: false, created_at: new Date().toISOString(), ...notice });
  }
}

function cinIsSchedule(event) {
  return event?.record_type === 'schedule';
}

function cinIsPendingRequest(event) {
  return cinIsSchedule(event)
    && event.approval_status === 'pending'
    && event.created_by
    && event.created_by !== cinUser().id;
}

function cinIsCreatorResult(event) {
  return cinIsSchedule(event)
    && event.created_by === cinUser().id
    && ['approved', 'rejected'].includes(event.approval_status)
    && event.notification_status !== 'read';
}

function cinBuildNotificationsFromCalendarItems() {
  const store = cinStore();
  const user = cinUser();
  if (!store || !user.id) return;

  if (cinIsAdmin()) {
    (store.events || []).filter(cinIsPendingRequest).forEach((event) => {
      const revision = Boolean(event.revision_of);
      cinUpsertNotification({
        notification_id: `${revision ? 'schedule-revision' : 'schedule-request'}-${event.id}-${user.id}`,
        user_id: user.id,
        notification_type: revision ? 'schedule_revision' : 'schedule_update',
        reference_id: event.id,
        title: revision ? 'Schedule Revision Submitted' : 'New Schedule Request',
        message: `${event.organization_name || 'An organization'} ${revision ? 'edited/submitted a revision for' : 'submitted'} "${event.title}" for approval.`,
        is_read: false,
        created_at: event.updated_at || event.created_at || new Date().toISOString()
      });
    });
  }

  if (cinIsManager()) {
    (store.events || []).filter(cinIsCreatorResult).forEach((event) => {
      const approved = event.approval_status === 'approved';
      cinUpsertNotification({
        notification_id: `schedule-${event.approval_status}-${event.id}-${user.id}`,
        user_id: user.id,
        notification_type: 'schedule_approval',
        reference_id: event.id,
        title: `${approved ? 'Approved' : 'Rejected'} Schedule Request`,
        message: `Your schedule "${event.title}" was ${event.approval_status}.`,
        is_read: false,
        created_at: event.approval_date || event.updated_at || new Date().toISOString()
      });
    });
  }

  cinUpdateBadge();
}

function cinUpdateBadge() {
  const badge = document.getElementById('notificationBadge');
  if (!badge) return;
  const count = cinNotifications().filter((item) => item.user_id === cinUser().id && !item.is_read).length;
  badge.textContent = String(count);
  badge.hidden = count === 0;
}

function cinOpenEventRequests(notification) {
  const eventRequestsButton = document.getElementById('eventRequestsButton');
  if (!eventRequestsButton) return false;
  eventRequestsButton.click();
  window.setTimeout(() => {
    const target = (cinStore()?.events || []).find((event) => event.id === notification.reference_id);
    if (!target) return;
    const cards = [...(document.getElementById('eventRequestsList')?.querySelectorAll('.activity-item') || [])];
    const card = cards.find((item) => item.textContent.includes(target.title));
    card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card?.classList.add('unread-notification');
  }, 250);
  return true;
}

function cinMarkRead(notification) {
  if (!notification) return;
  notification.is_read = true;
  const event = (cinStore()?.events || []).find((item) => item.id === notification.reference_id);
  if (event && notification.notification_type === 'schedule_approval') {
    event.notification_status = 'read';
  }
  cinUpdateBadge();
}

function cinBindClicks() {
  document.addEventListener('click', (clickEvent) => {
    const button = clickEvent.target.closest('[data-action="notification-open"],[data-action="notification-read"]');
    if (!button) return;
    const notification = cinNotifications().find((item) => item.notification_id === button.dataset.id);
    if (!notification) return;

    if (button.dataset.action === 'notification-read') {
      window.setTimeout(() => cinMarkRead(notification), 0);
      return;
    }

    if (cinIsAdmin() && ['schedule_update', 'schedule_revision'].includes(notification.notification_type)) {
      clickEvent.preventDefault();
      clickEvent.stopPropagation();
      cinMarkRead(notification);
      const modal = document.getElementById('notificationsModal');
      if (modal?.open) modal.close();
      cinOpenEventRequests(notification);
    }
  }, true);
}

function cinInit() {
  cinBindClicks();
  cinBuildNotificationsFromCalendarItems();
  window.setInterval(cinBuildNotificationsFromCalendarItems, CIN_SYNC_MS);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', cinInit);
else queueMicrotask(cinInit);
