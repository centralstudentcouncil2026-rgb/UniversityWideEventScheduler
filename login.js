import { authenticate, clearSession, loadAuthenticatedStore } from './supabase-storage.js?v=20260606-login-strict-v1';
import { currentUser, isManager, isPublic } from './app-rules.js?v=20260606-delete-permissions-v1';

const loginType = document.body.dataset.loginType;
const portalHref = document.body.dataset.portalHref || 'portal.html';
const form = document.getElementById('pageLoginForm');
const message = document.getElementById('loginMessage');

function setMessage(text, type = 'error') {
  message.textContent = text;
  message.className = `login-message ${type}`;
}

function roleAllowed(store) {
  const user = currentUser(store);
  if (loginType === 'student') return isManager(store);
  if (loginType === 'admin') return !isPublic(store) && user.role !== 'organization_manager';
  return !isPublic(store);
}

function roleError() {
  return loginType === 'student'
    ? 'This login is for student organizations only.'
    : 'This login is for administrators only.';
}

if (form) form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const username = document.getElementById('loginUsername').value.trim().toLowerCase();
  const password = document.getElementById('loginPassword').value;
  const button = form.querySelector('button[type="submit"]');

  button.disabled = true;
  setMessage('Checking your account...', 'success');

  try {
    await authenticate(username, password);
    const store = await loadAuthenticatedStore();

    if (!roleAllowed(store)) {
      clearSession();
      setMessage(roleError(), 'error');
      button.disabled = false;
      return;
    }

    setMessage('Login successful. Opening CONNECT portal...', 'success');
    window.location.href = portalHref;
  } catch (error) {
    clearSession();
    setMessage(loginErrorMessage(error), 'error');
    button.disabled = false;
  }
});

function loginErrorMessage(error) {
  const messageText = String(error?.message || '');
  if (/invalid login credentials/i.test(messageText)) return 'Login failed. Please check your username and password.';
  if (/jwt expired|session expired/i.test(messageText)) return 'Your session expired. Please log in again.';
  if (/failed to fetch|network|supabase is unavailable/i.test(messageText)) return 'Could not reach Supabase. Check your connection and try again.';
  return messageText || 'Login failed. Please try again.';
}
