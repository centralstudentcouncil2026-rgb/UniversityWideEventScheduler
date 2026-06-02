import type { CalendarEvent, Store, User } from './types';

const url = 'https://xtagvyyopokrhvvnseom.supabase.co';
const publishableKey = 'sb_publishable_G32XGo5ldXGO4TvqImNdSw_3-6_08LE';
const SESSION_KEY = 'core_supabase_auth_session';
const INTERNAL = '[[privacy:internal]]';
export const publicUser: User = { id: 'public', full_name: 'Public Viewer', role: 'public_viewer', organization_id: null };

const session = () => { try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; } };
const headers = (authenticated = false) => ({ apikey: publishableKey, Authorization: `Bearer ${authenticated ? session()?.access_token || publishableKey : publishableKey}`, 'Content-Type': 'application/json' });
type RequestOptions = RequestInit & { skipRefresh?: boolean };
async function request(endpoint: string, options: RequestOptions = {}, authenticated = false) {
  const response = await fetch(`${url}${endpoint}`, { ...options, headers: { ...headers(authenticated), ...options.headers } });
  const payload = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (authenticated && response.status === 401 && session()?.refresh_token && !options.skipRefresh) {
    try {
      await refreshSession();
      return request(endpoint, { ...options, skipRefresh: true }, authenticated);
    } catch {
      logout();
    }
  }
  if (!response.ok) throw new Error(payload?.message || payload?.error_description || payload?.error || `Supabase request failed (${response.status})`);
  return payload;
}
const rpc = (name: string, body = {}, authenticated = false) => request(`/rest/v1/rpc/${name}`, { method: 'POST', body: JSON.stringify(body) }, authenticated);
const emptyStore = (): Store => ({ version: 3, currentUserId: 'public', users: [], organizations: [], categories: [], events: [], blockedTimes: [], announcements: [], concerns: [], activityLogs: [], accountRequests: [] });
const normalizeEvent = (event: CalendarEvent): CalendarEvent => {
  const occurrences = (event.occurrences?.length ? event.occurrences : [{ id: `${event.id}-occurrence`, date: event.start_time.slice(0, 10), start_time: event.start_time, end_time: event.end_time }])
    .map((item) => ({ ...item, date: item.start_time.slice(0, 10) })).sort((a, b) => a.start_time.localeCompare(b.start_time));
  return { ...event, privacy_level: String(event.private_notes || '').includes(INTERNAL) ? 'internal' : event.privacy_level || 'basic', private_notes: String(event.private_notes || '').replace(INTERNAL, '').trim(), schedule_type: occurrences.length > 1 ? 'multi_day' : 'single_day', occurrences, start_time: occurrences[0].start_time, end_time: occurrences.at(-1)!.end_time };
};
const normalize = (value: Partial<Store>): Store => ({ ...emptyStore(), ...value, events: (value.events || []).map(normalizeEvent) });
const persistable = (store: Store): Store => ({ ...store, events: store.events.map((event) => ({ ...event, private_notes: event.privacy_level === 'internal' ? [INTERNAL, event.private_notes].filter(Boolean).join('\n') : event.private_notes })) });

export const loadStore = async () => normalize(await rpc('get_scheduler_store', {}, Boolean(session()?.access_token)));
export const saveStore = async (store: Store) => { await rpc('save_scheduler_store', { p_store: persistable(store) }, true); };
export const login = async (username: string, password: string) => {
  const payload = await request('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email: `${username.trim().toLowerCase()}@core.local`, password }) });
  localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
};
export const logout = () => localStorage.removeItem(SESSION_KEY);
const refreshSession = async () => {
  const refreshToken = session()?.refresh_token;
  if (!refreshToken) throw new Error('Your session has expired. Please log in again.');
  const payload = await request('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: JSON.stringify({ refresh_token: refreshToken }), skipRefresh: true });
  localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
  return payload;
};
export const requestAccount = (body: { username: string; password: string; fullName: string; role: string; organizationName: string }) =>
  rpc('create_scheduler_account', { p_username: body.username, p_password: body.password, p_full_name: body.fullName, p_requested_role: body.role, p_organization_name: body.organizationName });
export const decideAccount = (id: string, decision: string) => rpc('apply_account_request_decision', { p_request_id: id, p_decision: decision }, true);
export const deleteRecord = (collection: string, id: string) => rpc('delete_scheduler_record', { p_collection: collection, p_id: id }, true);
export const deleteEvent = async (store: Store, id: string) => {
  const next = { ...store, events: store.events.filter((event) => event.id !== id) };
  await saveStore(next);
  return next;
};
