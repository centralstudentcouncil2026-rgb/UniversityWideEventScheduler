import { clearSession, loadAuthenticatedStore } from './supabase-storage.js?v=20260619-supabase-only-v1';
import { currentUser, isAllowedAdminAccount, isPublic, isSuperAdmin, userPermission } from './app-rules.js?v=20260618-admin-allowlist-v1';

const store = await loadAuthenticatedStore();
const user = currentUser(store);

if (isPublic(store) || !userPermission(user, 'enabled') || (isSuperAdmin(store) && !isAllowedAdminAccount(user))) {
  clearSession();
  window.location.replace('index.html');
} else {
  window.CONNECT_AUTHENTICATED_USER = user;
  window.CONNECT_BOOTSTRAP_STORE = store;
  document.body.classList.add('portal-authenticated');
}
