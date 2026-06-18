import { authenticate, clearSession, loadAuthenticatedStore } from './supabase-storage.js?v=20260618-admin-allowlist-v1';
import { ADMIN_ACCESS_EMAILS, currentUser, isAllowedAdminAccount, isManager, isPublic, userPermission } from './app-rules.js?v=20260618-admin-allowlist-v1';

const loginType = document.body.dataset.loginType;
const portalHref = document.body.dataset.portalHref || 'portal.html';
const form = document.getElementById('pageLoginForm');
const message = document.getElementById('loginMessage');
const USERNAME_PATTERN = /^[a-z0-9_.-]{3,32}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MOBILE_ANNOUNCEMENT_LOGIN_FLAG = 'connect_show_mobile_announcements_after_login';

function cleanUsername(value) {
  return String(value || '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

function setMessage(text, type = 'error') {
  message.textContent = text;
  message.className = `login-message ${type}`;
}

function roleAllowed(store) {
  const user = currentUser(store);
  if (!userPermission(user, 'enabled')) return false;
  if (loginType === 'student') return isManager(store);
  if (loginType === 'admin') return isAllowedAdminAccount(user);
  return !isPublic(store);
}

function roleError(store) {
  if (!userPermission(currentUser(store), 'enabled')) return 'This account is disabled. Contact the CSC S.Y.N.C. manager.';
  return loginType === 'student'
    ? 'This login is for student organizations only.'
    : `This login is restricted to ${ADMIN_ACCESS_EMAILS.join(', ')}.`;
}

function loginFormatAllowed(username) {
  return loginType === 'admin' ? EMAIL_PATTERN.test(username) : USERNAME_PATTERN.test(username);
}

if (form) form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const username = cleanUsername(document.getElementById('loginUsername').value);
  const password = document.getElementById('loginPassword').value;
  const button = form.querySelector('button[type="submit"]');

  if (!loginFormatAllowed(username) || !password) {
    setMessage(loginType === 'admin' ? 'Enter an allowed admin email and password.' : 'Enter a valid username and password.', 'error');
    return;
  }

  button.disabled = true;
  setMessage('Checking your account...', 'success');

  try {
    await authenticate(username, password);
    const store = await loadAuthenticatedStore();

    if (!roleAllowed(store)) {
      clearSession();
      setMessage(roleError(store), 'error');
      button.disabled = false;
      return;
    }

    setMessage('Login successful. Opening CSC S.Y.N.C. portal...', 'success');
    sessionStorage.setItem(MOBILE_ANNOUNCEMENT_LOGIN_FLAG, '1');
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
  return 'Login failed. Please try again.';
}
