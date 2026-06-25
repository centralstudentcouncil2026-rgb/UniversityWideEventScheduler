const NOTIFICATION_SYNC_MS = 2500;
let notificationSyncBusy = false;

function notificationStore() {
  return window.CONNECT_STATE?.store || null;
}

function notificationUserId() {
  return notificationStore()?.currentUserId || '';
}

function notificationHeaders() {
  return {
    apikey: window.SUPABASE_CONFIG?.publishableKey || '',
    'Content-Type': 'application/json'
  };
}

async function notificationRequest(path, options = {}) {
  const response = await fetch(`${window.SUPABASE_CONFIG.url}${path}`, {
    ...options,
    headers: { ...notificationHeaders(), ...options.headers }
  });
  const payload = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.message || payload?.error || `Notification request failed (${response.status})`);
  return payload;
}

function localNotifications() {
  const store = notificationStore();
  if (!store) return [];
  if (!Array.isArray(store.notifications)) store.notifications = [];
  return store.notifications;
}

function normalizeNotification(row = {}) {
  return {
    notification_id: String(row.notification_id || row.id || ''),
    user_id: String(row.user_id || ''),
    notification_type: String(row.notification_type || ''),
    reference_id: String(row.reference_id || ''),
    title: String(row.title || 'Schedule Notification'),
    message: String(row.message || ''),
    is_read: Boolean(row.is_read),
    created_at: row.created_at || new Date().toISOString(),
    updated_at: row.updated_at || row.created_at || new Date().toISOString()
  };
}

function mergeNotifications(rows = []) {
  const list = localNotifications();
  rows.map(normalizeNotification).filter((row) => row.notification_id).forEach((row) => {
    const existing = list.find((item) => item.notification_id === row.notification_id);
    if (existing) Object.assign(existing, row);
    else list.push(row);
  });
  updateNotificationBadgeDirect();
}

function updateNotificationBadgeDirect() {
  const badge = document.getElementById('notificationBadge');
  if (!badge) return;
  const count = localNotifications().filter((item) => item.user_id === notificationUserId() && !item.is_read).length;
  badge.textContent = String(count);
  badge.hidden = count === 0;
}

async function syncNotificationsFromDatabase() {
  const userId = notificationUserId();
  if (notificationSyncBusy || !userId || !window.SUPABASE_CONFIG?.url) return;
  notificationSyncBusy = true;
  try {
    const rows = await notificationRequest(`/rest/v1/scheduler_notifications?select=*&user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc&limit=60`);
    if (Array.isArray(rows)) mergeNotifications(rows);
  } catch (error) {
    console.warn('Notification database sync unavailable:', error.message);
  } finally {
    notificationSyncBusy = false;
  }
}

async function markDatabaseNotificationRead(notification) {
  if (!notification?.notification_id) return;
  notification.is_read = true;
  notification.updated_at = new Date().toISOString();
  updateNotificationBadgeDirect();
  try {
    await notificationRequest(`/rest/v1/scheduler_notifications?notification_id=eq.${encodeURIComponent(notification.notification_id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ is_read: true, updated_at: notification.updated_at })
    });
  } catch (error) {
    console.warn('Notification read update failed:', error.message);
  }
}

function currentPortalUser() {
  const store = notificationStore();
  return (store?.users || []).find((user) => user.id === store.currentUserId) || {};
}

function isCurrentUserAdmin() {
  const user = currentPortalUser();
  return user.role === 'super_admin' && user.permissions?.enabled !== false;
}

function routeAdminNotification(notification) {
  if (!isCurrentUserAdmin()) return false;
  if (!['schedule_update', 'schedule_revision'].includes(notification.notification_type)) return false;
  markDatabaseNotificationRead(notification);
  const modal = document.getElementById('notificationsModal');
  if (modal?.open) modal.close();
  document.getElementById('eventRequestsButton')?.click();
  window.setTimeout(() => {
    const schedule = (notificationStore()?.events || []).find((item) => item.id === notification.reference_id);
    if (!schedule) return;
    const cards = [...(document.getElementById('eventRequestsList')?.querySelectorAll('.activity-item') || [])];
    const card = cards.find((item) => item.textContent.includes(schedule.title));
    card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card?.classList.add('unread-notification');
  }, 350);
  return true;
}

function bindNotificationRouting() {
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action="notification-open"],[data-action="notification-read"]');
    if (!button) return;
    const notification = localNotifications().find((item) => item.notification_id === button.dataset.id);
    if (!notification) return;
    if (button.dataset.action === 'notification-read') {
      queueMicrotask(() => markDatabaseNotificationRead(notification));
      return;
    }
    if (routeAdminNotification(notification)) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);

  document.getElementById('markNotificationsReadButton')?.addEventListener('click', () => {
    localNotifications()
      .filter((item) => item.user_id === notificationUserId())
      .forEach((item) => { item.is_read = true; markDatabaseNotificationRead(item); });
  }, true);
}

function initNotificationReader() {
  bindNotificationRouting();
  syncNotificationsFromDatabase();
  window.setInterval(syncNotificationsFromDatabase, NOTIFICATION_SYNC_MS);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initNotificationReader);
else queueMicrotask(initNotificationReader);
