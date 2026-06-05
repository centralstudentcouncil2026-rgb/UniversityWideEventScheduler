import { loadStore } from './supabase-storage.js?v=20260605-delete-persist-v2';
import { currentUser, isPublic } from './app-rules.js?v=20260601-public-month-v2';

const { store } = await loadStore();
const user = currentUser(store);

if (isPublic(store)) {
  window.location.replace('index.html');
} else {
  window.CONNECT_AUTHENTICATED_USER = user;
}
