import { clearSession } from './supabase-storage.js?v=20260602-jwt-refresh-v1';

document.addEventListener('click', (event) => {
  const target = event.target.closest('button, a');
  if (!target) return;

  if (target.id === 'logoutButton') {
    event.preventDefault();
    event.stopPropagation();
    clearSession();
    window.location.href = 'index.html';
  }

  if (target.id === 'profileButton') {
    event.preventDefault();
    event.stopPropagation();
  }
}, true);
