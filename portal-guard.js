import { authenticatedEmail, authenticatedUserId, clearSession, loadAuthenticatedStore } from './supabase-storage.js?v=20260619-admin-auth-v1';
import { currentUser, ensureAllowedAdminStore, isAllowedAdminAccount, isAllowedAdminEmail, isPublic, isSuperAdmin, userPermission } from './app-rules.js?v=20260619-admin-auth-v1';

const store = ensureAllowedAdminStore(await loadAuthenticatedStore(), authenticatedEmail(), authenticatedUserId());
const user = currentUser(store);

if (isPublic(store) || (!isAllowedAdminEmail(authenticatedEmail()) && !userPermission(user, 'enabled')) || (isSuperAdmin(store) && !isAllowedAdminAccount(user))) {
  clearSession();
  window.location.replace('index.html');
} else {
  window.CONNECT_AUTHENTICATED_USER = user;
  window.CONNECT_BOOTSTRAP_STORE = store;
  document.body.classList.add('portal-authenticated');
}
