import { clearSession, loadStore } from './supabase-storage.js?v=20260605-delete-persist-v2';
import { currentUser } from './app-rules.js?v=20260601-public-month-v2';

document.addEventListener('click', (event) => {
  const target = event.target.closest('button, a');
  if (!target) return;

  if (target.id === 'logoutButton') {
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

document.addEventListener('DOMContentLoaded', hydratePortalExtras);

async function hydratePortalExtras() {
  const { store } = await loadStore();
  const user = currentUser(store);
  const office = findStatus(store, 'incampus_offcampus');
  const president = findStatus(store, 'csc_president');

  setText('officeStatusValue', office?.status_label || readableStatus(office?.status) || 'Status not posted');
  setText('presidentStatusValue', president?.status_label || readableStatus(president?.status) || 'Status not posted');

  const unread = Array.isArray(store.notifications)
    ? store.notifications.filter((item) => !item.read && (!item.user_id || item.user_id === user.id) && (!item.organization_id || item.organization_id === user.organization_id)).length
    : 0;
  setText('notificationBadge', String(unread));
}

function findStatus(store, key) {
  const statuses = Array.isArray(store.activityStatuses) ? store.activityStatuses : [];
  return statuses.find((item) => item.id === key || item.key === key);
}

function readableStatus(value) {
  if (!value) return '';
  return String(value).replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}
