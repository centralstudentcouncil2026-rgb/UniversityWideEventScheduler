import { emptyPublicStore, normalizeStore, storeForPersistence } from './app-data.js?v=20260607-security-v1';

const { url, publishableKey } = window.SUPABASE_CONFIG;
const SESSION_KEY = 'core_supabase_auth_session';
let lastEventIds = new Set();

function currentEventIds(store) {
  const events = store && Array.isArray(store.events) ? store.events : [];
  return new Set(events.map((event) => event.id).filter(Boolean));
}

function rememberEventIds(store) {
  lastEventIds = currentEventIds(store);
}

function removedEventIds(store) {
  const nextEventIds = currentEventIds(store);
  return [...lastEventIds].filter((id) => !nextEventIds.has(id));
}

async function cleanupRemovedEvents(store) {
  const failures = [];
  for (const id of removedEventIds(store)) {
    try {
      await deleteRecord('events', id);
    } catch (error) {
      failures.push({ id, error });
    }
  }
  rememberEventIds(store);
  return failures;
}

function session() {
  try {
    const stored = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
    if (stored && localStorage.getItem(SESSION_KEY)) {
      sessionStorage.setItem(SESSION_KEY, stored);
      localStorage.removeItem(SESSION_KEY);
    }
    return JSON.parse(stored || 'null');
  } catch {
    return null;
  }
}

function headers(authenticated = false) {
  const token = authenticated ? session()?.access_token : publishableKey;
  return { apikey: publishableKey, Authorization: `Bearer ${token || publishableKey}`, 'Content-Type': 'application/json' };
}

async function request(endpoint, options = {}, authenticated = false) {
  const response = await fetch(`${url}${endpoint}`, { ...options, headers: { ...headers(authenticated), ...options.headers } });
  const payload = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (authenticated && response.status === 401 && session()?.refresh_token && !options.skipRefresh) {
    try {
      await refreshSession();
      return request(endpoint, { ...options, skipRefresh: true }, authenticated);
    } catch {
      clearSession();
    }
  }
  if (!response.ok) throw new Error(payload?.message || payload?.error_description || payload?.error || `Supabase request failed (${response.status})`);
  return payload;
}

async function rpc(name, body = {}, authenticated = false) {
  return request(`/rest/v1/rpc/${name}`, { method: 'POST', body: JSON.stringify(body) }, authenticated);
}

export async function loadStore() {
  try {
    const store = normalizeStore(await rpc('get_scheduler_store', {}, Boolean(session()?.access_token)));
    rememberEventIds(store);
    return { store, notice: 'Connected to the authenticated Supabase backend.', noticeType: 'success' };
  } catch (error) {
    clearSession();
    lastEventIds = new Set();
    return { store: emptyPublicStore(), notice: `Supabase is unavailable. ${error.message}`, noticeType: 'error' };
  }
}

export async function loadPublicStore() {
  try {
    const store = normalizeStore(await rpc('get_scheduler_store'));
    return { store, notice: 'Connected to the public Supabase calendar.', noticeType: 'success' };
  } catch (error) {
    return { store: emptyPublicStore(), notice: `Supabase is unavailable. ${error.message}`, noticeType: 'error' };
  }
}

export async function loadAuthenticatedStore() {
  if (!session()?.access_token) throw new Error('Your session expired. Please log in again.');
  const store = normalizeStore(await rpc('get_scheduler_store', {}, true));
  rememberEventIds(store);
  return store;
}

export async function saveStore(store) {
  await rpc('save_scheduler_store', { p_store: storeForPersistence(store) }, true);
  const deleteFailures = await cleanupRemovedEvents(store);
  if (deleteFailures.length) {
    console.warn('CONNECT delete cleanup RPC reported errors after store save:', deleteFailures);
  }
  return { deleteFailures };
}

export async function authenticate(username, password) {
  const payload = await request('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: JSON.stringify({ email: `${username.trim().toLowerCase()}@core.local`, password })
  });
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(payload));
  localStorage.removeItem(SESSION_KEY);
  return payload;
}

async function refreshSession() {
  const refreshToken = session()?.refresh_token;
  if (!refreshToken) throw new Error('Your session has expired. Please log in again.');
  const payload = await request('/auth/v1/token?grant_type=refresh_token', {
    method: 'POST',
    body: JSON.stringify({ refresh_token: refreshToken }),
    skipRefresh: true
  });
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(payload));
  localStorage.removeItem(SESSION_KEY);
  return payload;
}

export async function requestAccount({ username, password, fullName, organizationName }) {
  return rpc('create_scheduler_account', {
    p_username: username,
    p_password: password,
    p_full_name: fullName,
    p_requested_role: 'organization_manager',
    p_organization_name: organizationName
  });
}

export async function decideAccountRequest(id, decision) {
  return rpc('apply_account_request_decision', { p_request_id: id, p_decision: decision }, true);
}

const DELETE_COLLECTION_ALIASES = {
  events: ['events', 'reservations', 'scheduler_events', 'calendar_events'],
  blockedTimes: ['blocked_times', 'blockedTimes'],
  activityLogs: ['activity_logs', 'activityLogs'],
  accountRequests: ['account_requests', 'accountRequests']
};

export async function deleteRecord(collection, id) {
  const candidateCollections = DELETE_COLLECTION_ALIASES[collection] || [collection];
  const errors = [];

  for (const candidate of candidateCollections) {
    try {
      return await rpc('delete_scheduler_record', { p_collection: candidate, p_id: id }, true);
    } catch (error) {
      errors.push(`${candidate}: ${error.message}`);
    }
  }

  throw new Error(`Supabase rejected delete for ${collection} ${id}: ${errors.join('; ')}`);
}

export function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(SESSION_KEY);
}
