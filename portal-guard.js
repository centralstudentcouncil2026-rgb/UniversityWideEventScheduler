import { loadAuthenticatedStore } from './supabase-storage.js?v=20260606-login-strict-v1';
import { currentUser, isPublic } from './app-rules.js?v=20260606-delete-permissions-v1';

const store = await loadAuthenticatedStore();
const user = currentUser(store);

if (isPublic(store)) {
  window.location.replace('index.html');
} else {
  window.CONNECT_AUTHENTICATED_USER = user;
  window.CONNECT_BOOTSTRAP_STORE = store;
  document.body.classList.add('portal-authenticated');
}
