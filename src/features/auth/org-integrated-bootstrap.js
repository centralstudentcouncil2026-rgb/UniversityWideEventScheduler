// Feature copy of virtual module: org-integrated-bootstrap.js
// Keep behavior identical until modular migration is verified.


import { authenticate, clearSession, loadAuthenticatedStore, requestAccount } from './supabase-storage.js?v=20260625-concerns-sync-v1';
import { ADMIN_ACCESS_EMAILS, currentUser, isAllowedAdminEmail, isAllowedAdminAccount, isManager, userPermission } from './app-rules.js?v=20260625-status-sync-v1';

const dashboardMode = 'organization';
const loginForm = document.getElementById('integratedLoginForm');
const signupForm = document.getElementById('integratedSignupForm');
const loginMessage = document.getElementById('integratedLoginMessage');
const signupMessage = document.getElementById('integratedSignupMessage');
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_PATTERN = /^[a-z0-9_.-]{3,32}$/;
let dashboardStarted = false;

wireIntegratedAuth();
selectInitialAuthTab();
await restoreExistingSession();

function cleanLogin(value) {
  return String(value || '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

function setMessage(element, text, type = 'error') {
  if (!element) return;
  element.textContent = text;
  element.className = 'login-message ' + type;
}

function isAupEmail(value) {
  return EMAIL_PATTERN.test(value) && value.endsWith('@aup.edu.ph');
}

function usernameFromAupEmail(email) {
  return String(email || '').split('@')[0].toLowerCase().replace(/[^a-z0-9_.-]+/g, '.').replace(/^[.-]+|[.-]+$/g, '').slice(0, 32);
}

function roleAllowed(store) {
  const user = currentUser(store);
  if (dashboardMode === 'admin') return isAllowedAdminAccount(user);
  return userPermission(user, 'enabled') && isManager(store);
}

function roleError(store) {
  if (dashboardMode === 'admin') return 'This login is restricted to ' + ADMIN_ACCESS_EMAILS.join(', ') + '.';
  if (!userPermission(currentUser(store), 'enabled')) return 'This account is pending or disabled. Wait for admin approval before logging in.';
  return 'This login is for approved student organization accounts only.';
}

function loginFormatAllowed(email) {
  return dashboardMode === 'admin' ? isAllowedAdminEmail(email) : isAupEmail(email);
}

function wireIntegratedAuth() {
  document.querySelectorAll('[data-integrated-auth-tab]').forEach((button) => {
    button.addEventListener('click', () => selectIntegratedAuthTab(button.dataset.integratedAuthTab));
  });

  loginForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = cleanLogin(document.getElementById('integratedLoginEmail')?.value);
    const password = document.getElementById('integratedLoginPassword')?.value || '';
    const button = loginForm.querySelector('button[type="submit"]');
    if (!loginFormatAllowed(email) || !password) {
      setMessage(loginMessage, dashboardMode === 'admin' ? 'Enter an allowed admin email and password.' : 'Enter your AUP email and password.');
      return;
    }
    button.disabled = true;
    setMessage(loginMessage, 'Checking your account...', 'success');
    let store;
    try {
      await authenticate(email, password);
      store = await loadAuthenticatedStore();
    } catch (error) {
      console.error('Organization login failed:', {
        message: error?.message,
        status: error?.status,
        code: error?.code,
        details: error?.details
      });
      clearSession();
      setMessage(loginMessage, loginErrorMessage(error));
      button.disabled = false;
      return;
    }
    if (!roleAllowed(store)) {
      clearSession();
      setMessage(loginMessage, roleError(store));
      button.disabled = false;
      return;
    }
    try {
      await startDashboard(store);
    } catch (error) {
      console.error('Organization dashboard startup failed:', error);
      setMessage(loginMessage, dashboardStartErrorMessage(error));
      button.disabled = false;
    }
  });

  signupForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const fullName = String(document.getElementById('integratedSignupName')?.value || '').trim().replace(/\s+/g, ' ');
    const password = document.getElementById('integratedSignupPassword')?.value || '';
    const aupEmail = cleanLogin(document.getElementById('integratedSignupEmail')?.value);
    const username = usernameFromAupEmail(aupEmail);
    const phoneNumber = String(document.getElementById('integratedSignupPhone')?.value || '').replace(/\D/g, '');
    const organizationName = String(document.getElementById('integratedSignupOrganization')?.value || '').trim().replace(/\s+/g, ' ');
    const button = signupForm.querySelector('button[type="submit"]');
    if (!fullName) return setMessage(signupMessage, 'Name is required.');
    if (!isAupEmail(aupEmail)) return setMessage(signupMessage, 'Use an AUP email ending in @aup.edu.ph.');
    if (!USERNAME_PATTERN.test(username)) return setMessage(signupMessage, 'Use a valid login name before @aup.edu.ph.');
    if (!/^\d{11}$/.test(phoneNumber)) return setMessage(signupMessage, 'Phone number must contain exactly 11 digits.');
    if (!organizationName) return setMessage(signupMessage, 'Organization name is required.');
    if (password.length < 10 || password.length > 128) return setMessage(signupMessage, 'Password must be 10 to 128 characters.');
    button.disabled = true;
    setMessage(signupMessage, 'Submitting account request...', 'success');
    try {
      await requestAccount({ username, password, fullName, organizationName, email: aupEmail, phoneNumber, organizationCode: username });
      signupForm.reset();
      setMessage(signupMessage, 'Account request submitted. Wait for admin approval before logging in.', 'success');
      selectIntegratedAuthTab('login');
    } catch (error) {
      setMessage(signupMessage, error.message || 'Account request failed. Please try again.');
    } finally {
      button.disabled = false;
    }
  });
}

function selectIntegratedAuthTab(name) {
  document.querySelectorAll('[data-integrated-auth-tab]').forEach((button) => {
    const active = button.dataset.integratedAuthTab === name;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  document.querySelectorAll('[data-integrated-auth-panel]').forEach((panel) => {
    const active = panel.dataset.integratedAuthPanel === name;
    panel.classList.toggle('active', active);
    panel.hidden = !active;
  });
  document.getElementById(name === 'signup' ? 'integratedSignupEmail' : 'integratedLoginEmail')?.focus();
}

function selectInitialAuthTab() {
  const params = new URLSearchParams(window.location.search);
  const requestedTab = String(params.get('auth') || params.get('tab') || window.location.hash.replace('#', '') || '').trim().toLowerCase();
  if (requestedTab === 'signup' || requestedTab === 'sign-up') selectIntegratedAuthTab('signup');
}

async function restoreExistingSession() {
  try {
    const store = await loadAuthenticatedStore();
    if (roleAllowed(store)) await startDashboard(store);
    else clearSession();
  } catch {
    clearSession();
    document.body.classList.add('dashboard-login-required');
  }
}

async function startDashboard(store) {
  if (dashboardStarted) return;
  dashboardStarted = true;
  window.CONNECT_AUTHENTICATED_USER = currentUser(store);
  window.CONNECT_BOOTSTRAP_STORE = store;
  document.body.classList.add('portal-authenticated', 'dashboard-login-ready', 'org-dashboard-shell');
  document.body.classList.remove('dashboard-login-required', 'auth-active', 'is-public', 'public-shell');
  await import('./calendar-logic-guard.js?v=20260625-start-end-dates-v6');await import('./portal-logic-fixes.js?v=20260625-org-announcements-v1');await waitForFullCalendar();await import('./script.js?v=20260625-org-announcements-v1');await import('./portal-wiring.js?v=20260625-concerns-sync-v1');await importOptionalDashboardModule('./activity-status-bridge.js?v=20260625-profile-status-v3');await importOptionalDashboardModule('./ui-light-cards.js?v=20260625-org-announcements-v1');await importOptionalDashboardModule('./portal-ui-polish.js?v=20260625-org-announcements-v1');await importOptionalDashboardModule('./conference-room-booking.js?v=20260812-conference-room-db-v4')
}

async function importOptionalDashboardModule(specifier) {
  try {
    await import(specifier);
  } catch (error) {
    console.warn(`Optional dashboard module failed to load: ${specifier}`, error);
  }
}

function waitForFullCalendar() {
  if (window.FullCalendar) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (window.FullCalendar) {
        clearInterval(timer);
        resolve();
      } else if (attempts > 80) {
        clearInterval(timer);
        reject(new Error('FullCalendar failed to load.'));
      }
    }, 50);
  });
}

function loginErrorMessage(error) {
  const text = errorDiagnosticText(error);
  if (/email not confirmed|confirm.*email|not confirmed/i.test(text)) return 'Your AUP email is not confirmed yet. Open the Supabase confirmation email, then log in again.';
  if (/profile|permission denied|row-level security|violates row-level security/i.test(text)) return 'Your login exists, but the organization profile is missing or not approved yet. Ask an admin to approve the account.';
  if (/invalid login credentials|invalid_credentials/i.test(text)) return 'Login failed. Please check your email and password.';
  if (/jwt expired|session expired/i.test(text)) return 'Your session expired. Please log in again.';
  if (/failed to fetch|network|supabase is unavailable/i.test(text)) return 'Could not reach Supabase. Check your connection and try again.';
  return text ? `Login failed. ${shortErrorText(text)}` : 'Login failed. Please try again.';
}

function dashboardStartErrorMessage(error) {
  const text = errorDiagnosticText(error);
  if (/FullCalendar failed to load/i.test(text)) return 'Your account was verified, but the calendar engine did not load. Hard refresh the page and try again.';
  return text ? `Your account was verified, but the dashboard could not finish loading. ${shortErrorText(text)}` : 'Your account was verified, but the dashboard could not finish loading. Hard refresh the page and try again.';
}

function errorDiagnosticText(error) {
  const parts = [
    error?.message,
    error?.code && `code ${error.code}`,
    error?.status && `status ${error.status}`
  ];
  if (error?.details) {
    try {
      parts.push(JSON.stringify(error.details));
    } catch {
      parts.push(String(error.details));
    }
  }
  return parts.filter(Boolean).map(String).join(' ');
}

function shortErrorText(text) {
  const cleaned = String(text).replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'Please try again.';
  return cleaned.length > 180 ? `${cleaned.slice(0, 177)}...` : cleaned;
}
