import { authenticate, clearSession, loadStore } from './supabase-storage.js?v=20260605-cleanup-v1';
import { currentUser, isManager, isPublic } from './app-rules.js?v=20260601-public-month-v2';

const loginType = document.body.dataset.loginType;
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
    const { store } = await loadStore();

    if (!roleAllowed(store)) {
      clearSession();
      setMessage(roleError(), 'error');
      button.disabled = false;
      return;
    }

    setMessage('Login successful. Opening CONNECT portal...', 'success');
    window.location.href = 'portal.html';
  } catch (error) {
    clearSession();
    setMessage(error.message || 'Login failed. Please check your username and password.', 'error');
    button.disabled = false;
  }
});
