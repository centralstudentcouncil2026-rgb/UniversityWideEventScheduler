import { clearSession, loadStore } from './supabase-storage.js?v=20260622-public-center-blocks-v1';
import { currentUser } from './app-rules.js?v=20260622-public-center-blocks-v1';

document.addEventListener('click', (event) => {
  const target = event.target.closest('button, a');
  if (!target) return;

  if (target.id === 'logoutButton') {
    event.preventDefault();
    event.stopPropagation();
    clearSession();
    window.location.href = 'index.html';
  }

  if (target.id === 'modalLogoutButton') {
    event.preventDefault();
    event.stopPropagation();
    clearSession();
    window.location.href = 'index.html';
  }

  if (target.id === 'profileButton') {
    event.preventDefault();
    event.stopPropagation();
  }
}, true);

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hydratePortalExtras);
else queueMicrotask(hydratePortalExtras);

async function hydratePortalExtras() {
  const store = window.CONNECT_BOOTSTRAP_STORE || (await loadStore()).store;
  const user = currentUser(store);
  const office = findStatus(store, 'incampus_offcampus');
  const president = findStatus(store, 'csc_president');

  setText('officeStatusValue', statusLabel(office));
  setText('presidentStatusValue', statusLabel(president));
  setText('notificationBadge', String(unreadNotificationCount(store, user)));
}

function findStatus(store, key) {
  const statuses = Array.isArray(store.activityStatuses) ? store.activityStatuses : [];
  return statuses.find((item) => item.id === key || item.key === key);
}

function readableStatus(value) {
  if (!value) return '';
  return String(value).split('_').join(' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusLabel(status) {
  if (!status) return 'Status not posted';
  return status.status_label || readableStatus(status.status) || 'Status not posted';
}

function unreadNotificationCount(store, user) {
  const notifications = Array.isArray(store.notifications) ? store.notifications : [];
  return notifications.filter((item) => {
    const matchesUser = !item.user_id || item.user_id === user.id;
    const matchesOrganization = !item.organization_id || item.organization_id === user.organization_id;
    return !item.read && matchesUser && matchesOrganization;
  }).length;
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}
