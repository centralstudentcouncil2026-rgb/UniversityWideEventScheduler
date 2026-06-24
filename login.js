import { authenticate, clearSession, loadAuthenticatedStore, requestAccount } from './supabase-storage.js?v=20260624-schedule-delete-v1';
import { ADMIN_ACCESS_EMAILS, currentUser, isAllowedAdminEmail, isAllowedAdminAccount, isManager, isPublic, userPermission } from './app-rules.js?v=20260619-detail-actions-v1';

const loginType = document.body.dataset.loginType;
const portalHref = document.body.dataset.portalHref || 'portal.html';
const form = document.getElementById('pageLoginForm');
const signupForm = document.getElementById('organizationSignupForm');
const message = document.getElementById('loginMessage');
const signupMessage = document.getElementById('signupMessage');
const USERNAME_PATTERN = /^[a-z0-9_.-]{3,32}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MOBILE_ANNOUNCEMENT_LOGIN_FLAG = 'connect_show_mobile_announcements_after_login';

document.querySelectorAll('[data-auth-tab]').forEach((button) => {
  button.addEventListener('click', () => selectAuthTab(button.dataset.authTab));
});

function cleanUsername(value) {
  return String(value || '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

function setMessage(text, type = 'error') {
  message.textContent = text;
  message.className = `login-message ${type}`;
}

function setSignupMessage(text, type = 'error') {
  if (!signupMessage) return;
  signupMessage.textContent = text;
  signupMessage.className = `login-message ${type}`;
}

function selectAuthTab(name) {
  document.querySelectorAll('[data-auth-tab]').forEach((button) => {
    const active = button.dataset.authTab === name;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  document.querySelectorAll('[data-auth-panel]').forEach((panel) => {
    const active = panel.dataset.authPanel === name;
    panel.classList.toggle('active', active);
    panel.hidden = !active;
  });
  const focusTarget = name === 'signup' ? document.getElementById('signupAupEmail') : document.getElementById('loginUsername');
  focusTarget?.focus();
}

function roleAllowed(store) {
  const user = currentUser(store);
  if (loginType === 'admin') return isAllowedAdminAccount(user);
  if (!userPermission(user, 'enabled')) return false;
  if (loginType === 'student') return isManager(store);
  return !isPublic(store);
}

function roleError(store) {
  if (loginType === 'admin') return `This login is restricted to ${ADMIN_ACCESS_EMAILS.join(', ')}.`;
  if (!userPermission(currentUser(store), 'enabled')) return 'This account is disabled. Contact the CSC S.Y.N.C. manager.';
  return loginType === 'student'
    ? 'This login is for student organizations only.'
    : 'This login is restricted.';
}

function loginFormatAllowed(username) {
  return loginType === 'admin' ? isAllowedAdminEmail(username) : isAupEmail(username);
}

function isAupEmail(value) {
  return EMAIL_PATTERN.test(value) && value.endsWith('@aup.edu.ph');
}

function usernameFromAupEmail(email) {
  const localPart = String(email || '').split('@')[0] || '';
  const username = localPart.toLowerCase().replace(/[^a-z0-9_.-]+/g, '.').replace(/^[.-]+|[.-]+$/g, '').slice(0, 32);
  return username.length >= 3 ? username : `${username}org`.slice(0, 32);
}

if (form) form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const username = cleanUsername(document.getElementById('loginUsername').value);
  const password = document.getElementById('loginPassword').value;
  const button = form.querySelector('button[type="submit"]');

  if (!loginFormatAllowed(username) || !password) {
    setMessage(loginType === 'admin' ? 'Enter an allowed admin email and password.' : 'Enter your AUP email and password.', 'error');
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

if (signupForm) signupForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const fullName = String(document.getElementById('signupUsername').value || '').trim().replace(/\s+/g, ' ');
  const password = document.getElementById('signupPassword').value;
  const aupEmail = cleanUsername(document.getElementById('signupAupEmail').value);
  const username = usernameFromAupEmail(aupEmail);
  const phoneNumber = String(document.getElementById('signupPhone').value || '').replace(/\D/g, '');
  const organizationName = String(document.getElementById('signupOrganization').value || '').trim().replace(/\s+/g, ' ');
  const button = signupForm.querySelector('button[type="submit"]');

  if (!fullName) return setSignupMessage('Name is required.');
  if (!isAupEmail(aupEmail)) return setSignupMessage('Use a valid AUP email address.');
  if (!USERNAME_PATTERN.test(username)) return setSignupMessage('Use an AUP email with a valid name before @aup.edu.ph.');
  if (!/^\d{11}$/.test(phoneNumber)) return setSignupMessage('Phone number must contain exactly 11 digits.');
  if (!organizationName) return setSignupMessage('Organization name is required.');
  if (password.length < 10 || password.length > 128) return setSignupMessage('Password must be 10 to 128 characters.');

  button.disabled = true;
  setSignupMessage('Submitting account request...', 'success');
  try {
    await requestAccount({ username, password, fullName, organizationName, email: aupEmail, phoneNumber });
    signupForm.reset();
    setSignupMessage('Account request submitted. Wait for admin approval before logging in.', 'success');
  } catch (error) {
    setSignupMessage(error.message || 'Account request failed. Please try again.', 'error');
  } finally {
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
