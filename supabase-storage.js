import { emptyPublicStore, normalizeStore } from './app-data.js?v=20260601-cleanup-v1';

const { url, publishableKey } = window.SUPABASE_CONFIG;
const SESSION_KEY = 'core_supabase_auth_session';

function session() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
}

function headers(authenticated = false) {
  const token = authenticated ? session()?.access_token : publishableKey;
  return { apikey: publishableKey, Authorization: `Bearer ${token || publishableKey}`, 'Content-Type': 'application/json' };
}

async function request(endpoint, options = {}, authenticated = false) {
  const response = await fetch(`${url}${endpoint}`, { ...options, headers: { ...headers(authenticated), ...options.headers } });
  const payload = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.message || payload?.error_description || payload?.error || `Supabase request failed (${response.status})`);
  return payload;
}

async function rpc(name, body = {}, authenticated = false) {
  return request(`/rest/v1/rpc/${name}`, { method: 'POST', body: JSON.stringify(body) }, authenticated);
}

export async function loadStore() {
  try {
    const store = normalizeStore(await rpc('get_scheduler_store', {}, Boolean(session()?.access_token)));
    return { store, notice: 'Connected to the authenticated Supabase backend.', noticeType: 'success' };
  } catch (error) {
    clearSession();
    return { store: emptyPublicStore(), notice: `Supabase is unavailable. ${error.message}`, noticeType: 'error' };
  }
}

export async function saveStore(store) {
  await rpc('save_scheduler_store', { p_store: store }, true);
}

export async function authenticate(username, password) {
  const payload = await request('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: JSON.stringify({ email: `${username.trim().toLowerCase()}@core.local`, password })
  });
  localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
  return payload;
}

export async function requestAccount({ username, password, fullName, role, organizationName }) {
  return rpc('create_scheduler_account', {
    p_username: username,
    p_password: password,
    p_full_name: fullName,
    p_requested_role: role,
    p_organization_name: organizationName
  });
}

export async function decideAccountRequest(id, decision) {
  return rpc('apply_account_request_decision', { p_request_id: id, p_decision: decision }, true);
}

export async function deleteRecord(collection, id) {
  return rpc('delete_scheduler_record', { p_collection: collection, p_id: id }, true);
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}
