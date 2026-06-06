import { clearSession, loadAuthenticatedStore } from './supabase-storage.js?v=20260607-streamline-v1';
import { currentUser, isPublic, userPermission } from './app-rules.js?v=20260607-streamline-v1';

const store = await loadAuthenticatedStore();
const user = currentUser(store);

if (isPublic(store) || !userPermission(user, 'enabled')) {
  clearSession();
  window.location.replace('index.html');
} else {
  window.CONNECT_AUTHENTICATED_USER = user;
  window.CONNECT_BOOTSTRAP_STORE = store;
  document.body.classList.add('portal-authenticated');
}
