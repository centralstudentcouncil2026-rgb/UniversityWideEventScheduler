import './portal-guard.js?v=20260605-delete-persist-v2';

if (window.CONNECT_AUTHENTICATED_USER) {
  await import('./script.js?v=20260605-delete-persist-v2');
  await import('./portal-wiring.js?v=20260605-delete-persist-v2');
}
