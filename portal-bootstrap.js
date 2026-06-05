try {
  await import('./portal-guard.js?v=20260605-portal-redirect-v1');
} catch (error) {
  console.error('CONNECT portal guard failed:', error);
  window.location.replace('index.html');
}

if (window.CONNECT_AUTHENTICATED_USER) {
  await import('./script.js?v=20260605-click-day-v1');
  await import('./portal-wiring.js?v=20260605-dialog-v1');
} else {
  window.location.replace('index.html');
}
