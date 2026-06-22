import { authenticatedEmail, clearSession, loadAuthenticatedStore } from './supabase-storage.js?v=20260622-attendee-normalization-v1';
import { currentUser, isAllowedAdminAccount, isAllowedAdminEmail, isPublic, isSuperAdmin, userPermission } from './app-rules.js?v=20260622-attendee-normalization-v1';

const store = await loadAuthenticatedStore();
const user = currentUser(store);

if (isPublic(store) || (!isAllowedAdminEmail(authenticatedEmail()) && !userPermission(user, 'enabled')) || (isSuperAdmin(store) && !isAllowedAdminAccount(user))) {
  clearSession();
  window.location.replace('index.html');
} else {
  window.CONNECT_AUTHENTICATED_USER = user;
  window.CONNECT_BOOTSTRAP_STORE = store;
  document.body.classList.add('portal-authenticated');
}
