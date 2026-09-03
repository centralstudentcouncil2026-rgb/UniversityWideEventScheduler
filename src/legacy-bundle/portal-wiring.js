import { clearSession, loadAuthenticatedStore } from './supabase-storage.js?v=20260625-concerns-sync-v1';
import { currentUser } from './app-rules.js?v=20260625-status-sync-v1';

document.addEventListener('click', (event) => {
  const target = event.target.closest('button, a');
  if (!target) return;

  if (target.id === 'logoutButton') {
    event.preventDefault();
    event.stopPropagation();
    const loginHref = loginAreaHref();
    clearSession();
    window.location.href = loginHref;
  }

  if (target.id === 'modalLogoutButton') {
    event.preventDefault();
    event.stopPropagation();
    const loginHref = loginAreaHref();
    clearSession();
    window.location.href = loginHref;
  }

  if (target.id === 'profileButton') {
    event.preventDefault();
    event.stopPropagation();
  }
}, true);

function loginAreaHref() {
  if (document.body.dataset.dashboard === 'organization') return 'index.html?auth=signup';
  if (document.body.dataset.dashboard === 'admin') return 'admin-dashboard.html';
  const user = window.CONNECT_AUTHENTICATED_USER || currentUser(window.CONNECT_BOOTSTRAP_STORE || { users: [], currentUserId: 'public' });
  return user?.role === 'super_admin' ? 'admin-dashboard.html' : 'index.html?auth=signup';
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hydratePortalExtras);
else queueMicrotask(hydratePortalExtras);

async function hydratePortalExtras() {
  const store = window.CONNECT_BOOTSTRAP_STORE || await loadAuthenticatedStore();
  const user = currentUser(store);
  const office = findStatus(store, 'OIC');
  const president = findStatus(store, 'CSC');

  setText('oicStatusValue', statusLabel(office));
  setText('cscStatusValue', statusLabel(president));
  setText('notificationBadge', '0');
  const badge = document.getElementById('notificationBadge');
  if (badge) badge.hidden = true;
}

function findStatus(store, key) {
  const statuses = Array.isArray(store.activityStatuses) ? store.activityStatuses : [];
  return statuses
    .filter((item) => item.account_type === key || item.id === key || item.key === key)
    .sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0))[0];
}

function readableStatus(value) {
  if (!value) return '';
  return String(value).split('_').join(' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusLabel(status) {
  if (!status) return 'Status not posted';
  return status.activity_status || status.status_label || readableStatus(status.status) || 'Status not posted';
}

function unreadNotificationCount() { return 0; }

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}
