try {
  await import('./portal-guard.js?v=20260619-admin-auth-v1');
} catch (error) {
  console.error('CONNECT portal guard failed:', error);
  window.location.replace('index.html');
}

if (window.CONNECT_AUTHENTICATED_USER) {
  await waitForFullCalendar();
  await import('./script.js?v=20260619-admin-auth-v1');
  await import('./portal-wiring.js?v=20260619-admin-auth-v1');
} else {
  window.location.replace('index.html');
}

function waitForFullCalendar() {
  if (window.FullCalendar) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      if (window.FullCalendar) {
        window.clearInterval(timer);
        resolve();
      } else if (attempts > 80) {
        window.clearInterval(timer);
        reject(new Error('FullCalendar failed to load.'));
      }
    }, 50);
  });
}
