import './portal-guard.js?v=20260605-dialog-v1';

if (window.CONNECT_AUTHENTICATED_USER) {
  await import('./script.js?v=20260605-click-day-v1');
  await import('./portal-wiring.js?v=20260605-dialog-v1');
}
