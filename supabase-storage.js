import { emptyPublicStore, normalizeStore, storeForPersistence } from './app-data.js?v=20260622-org-account-type-v1';
import { ensureAllowedAdminStore } from './app-rules.js?v=20260622-org-account-type-v1';

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
    const stored = sessionStorage.getItem(SESSION_KEY);
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
    const store = enforceAuthenticatedIdentity(normalizeStore(await rpc('get_scheduler_store', {}, Boolean(session()?.access_token))));
    if (session()?.access_token) await mergeAuthenticatedProfiles(store);
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
    await mergePublicBlockedTimes(store);
    return { store, notice: 'Connected to the public Supabase calendar.', noticeType: 'success' };
  } catch (error) {
    return { store: emptyPublicStore(), notice: `Supabase is unavailable. ${error.message}`, noticeType: 'error' };
  }
}

async function mergePublicBlockedTimes(store) {
  try {
    const rows = await request('/rest/v1/blocked_times?select=*&order=start_time.asc');
    if (!Array.isArray(rows) || !rows.length) return;
    const existingIds = new Set((store.blockedTimes || []).map((block) => block.id));
    const directBlocks = rows
      .filter((row) => row.id && !existingIds.has(row.id))
      .map((row) => ({
        id: row.id,
        title: row.title || 'Blocked university period',
        block_type: row.block_type || 'single_day',
        start_time: row.start_time,
        end_time: row.end_time,
        reason: row.reason || '',
        record_type: 'blocked_time',
        block_source: 'admin',
        created_by_role: 'admin',
        requires_approval: false,
        created_by: row.created_by || '',
        created_at: row.created_at || row.start_time,
        updated_at: row.updated_at || row.created_at || row.start_time
      }));
    store.blockedTimes = [...(store.blockedTimes || []), ...directBlocks];
  } catch (error) {
    console.warn('CONNECT public blocked-time fallback unavailable:', error);
  }
}

export async function loadAuthenticatedStore() {
  if (!session()?.access_token) throw new Error('Your session expired. Please log in again.');
  const store = enforceAuthenticatedIdentity(normalizeStore(await rpc('get_scheduler_store', {}, true)));
  await mergeAuthenticatedProfiles(store);
  rememberEventIds(store);
  return store;
}

async function mergeAuthenticatedProfiles(store) {
  try {
    const [profiles, accountRequests] = await Promise.all([
      request('/rest/v1/profiles?select=*&order=created_at.asc', {}, true).catch((error) => {
        console.warn('CONNECT profile account merge unavailable:', error);
        return [];
      }),
      request('/rest/v1/account_requests?select=*&order=created_at.asc', {}, true).catch((error) => {
        console.warn('CONNECT account request merge unavailable:', error);
        return [];
      })
    ]);
    profiles.forEach((profile) => mergeProfileUser(store, profile));
    accountRequests.forEach((accountRequest) => mergeAccountRequest(store, accountRequest));
  } catch (error) {
    console.warn('CONNECT account data merge unavailable:', error);
  }
}

function mergeAccountRequest(store, accountRequest) {
  if (!accountRequest?.id) return;
  if (!Array.isArray(store.accountRequests)) store.accountRequests = [];
  const existing = store.accountRequests.find((item) => (item.id || item.request_id) === accountRequest.id);
  const next = {
    ...existing,
    ...accountRequest,
    id: accountRequest.id,
    request_id: accountRequest.id,
    organizationName: accountRequest.organization_name || existing?.organizationName || '',
    aup_email: accountRequest.aup_email || accountRequest.email || existing?.aup_email || '',
    phone_number: accountRequest.phone_number || accountRequest.contact_number || existing?.phone_number || '',
    contact_number: accountRequest.contact_number || accountRequest.phone_number || existing?.contact_number || ''
  };
  if (existing) Object.assign(existing, next);
  else store.accountRequests.push(next);
}

function mergeProfileUser(store, profile) {
  if (!profile?.id) return;
  if (!Array.isArray(store.users)) store.users = [];
  const isOrganizationAccount = profile.role === 'organization_manager' || profile.account_preset === 'organization';
  const existing = store.users.find((user) =>
    user.id === profile.id
    || String(user.email || '').toLowerCase() === String(profile.email || '').toLowerCase()
    || String(user.username || '').toLowerCase() === String(profile.username || '').toLowerCase()
  );
  const next = {
    id: profile.id,
    username: profile.username || profile.email || existing?.username || '',
    full_name: profile.full_name || existing?.full_name || profile.username || profile.email || 'Account',
    role: profile.role || existing?.role || 'organization_manager',
    account_preset: profile.account_preset || existing?.account_preset || (profile.role === 'super_admin' ? 'manager' : 'organization'),
    account_type: profile.account_type || existing?.account_type || (isOrganizationAccount ? 'org' : 'CSC'),
    organization_id: profile.organization_id || existing?.organization_id || '',
    organization_name: profile.organization_name || existing?.organization_name || existing?.organizationName || '',
    organizationName: profile.organization_name || existing?.organizationName || existing?.organization_name || '',
    email: profile.email || existing?.email || '',
    aup_email: profile.email || existing?.aup_email || '',
    contact_number: profile.contact_number || profile.phone_number || existing?.contact_number || '',
    phone_number: profile.phone_number || profile.contact_number || existing?.phone_number || '',
    suspended_status: Boolean(profile.suspension_status || existing?.suspended_status),
    suspension_status: Boolean(profile.suspension_status || existing?.suspension_status),
    suspension_date: profile.suspension_date || existing?.suspension_date || '',
    deletion_logs: profile.deletion_logs || existing?.deletion_logs || [],
    modification_logs: profile.modification_logs || existing?.modification_logs || [],
    created_at: profile.created_at || existing?.created_at || new Date().toISOString(),
    updated_at: profile.updated_at || existing?.updated_at || profile.created_at || new Date().toISOString(),
    permissions: { ...(existing?.permissions || {}), ...jsonObject(profile.permissions) }
  };
  if (existing) Object.assign(existing, next);
  else store.users.push(next);
}

function jsonObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function enforceAuthenticatedIdentity(store) {
  const email = authenticatedEmail();
  if (!email) return store;
  return ensureAllowedAdminStore(store, email, authenticatedUserId());
}

export async function saveStore(store) {
  await rpc('save_scheduler_store', { p_store: storeForPersistence(store) }, true);
  const tableFailures = await syncRecordTables(store);
  const deleteFailures = await cleanupRemovedEvents(store);
  if (tableFailures.length) {
    console.warn('CONNECT relational table sync reported errors after store save:', tableFailures);
  }
  if (deleteFailures.length) {
    console.warn('CONNECT delete cleanup RPC reported errors after store save:', deleteFailures);
  }
  return { deleteFailures, tableFailures };
}

async function syncRecordTables(store) {
  if (!session()?.access_token) return [];
  const failures = [];
  await syncOrganizationsTable(store).catch((error) => failures.push({ table: 'schedule_organizations', error }));
  await syncSchedulesTable(store).catch((error) => failures.push({ table: 'schedules', error }));
  await syncBlockedTimesTable(store).catch((error) => failures.push({ table: 'blocked_times', error }));
  return failures;
}

async function syncOrganizationsTable(store) {
  const organizations = (store.organizations || [])
    .filter((org) => org.id && (org.organization_name || org.name))
    .map((org) => ({
      id: org.id,
      organization_name: org.organization_name || org.name,
      organization_type: org.organization_type || org.type || 'Organization',
      updated_at: org.updated_at || new Date().toISOString()
    }));
  if (!organizations.length) return;
  await request('/rest/v1/schedule_organizations?on_conflict=id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(organizations)
  }, true);
}

async function syncSchedulesTable(store) {
  const schedules = (store.events || [])
    .filter((event) => uuidOrNull(event.id) && event.record_type === 'schedule')
    .map((event) => ({
      id: event.id,
      organization_id: event.organization_id || null,
      category_id: event.category_id,
      title: event.title,
      venue: event.venue,
      schedule_type: event.schedule_type || (Array.isArray(event.occurrences) && event.occurrences.length > 1 ? 'multi_day' : 'single_day'),
      start_time: event.start_time,
      end_time: event.end_time,
      expected_attendees: Number(event.expected_attendees || 1),
      privacy_level: event.privacy_level || 'basic',
      contact_person: event.contact_person,
      contact_info: event.contact_info,
      public_description: event.public_description,
      purpose: event.purpose,
      schedule_schema_version: Number(event.schedule_schema_version || 2),
      approval_status: event.approval_status || 'pending',
      admin_recommendation: event.admin_recommendation || null,
      approval_date: event.approval_date || null,
      notification_status: event.notification_status || null,
      revision_of: event.revision_of || null,
      original_schedule_id: event.original_schedule_id || null,
      revision_status: event.revision_status || null,
      revision_created_at: event.revision_created_at || null,
      revision_submitted_at: event.revision_submitted_at || null,
      revision_history: event.revision_history || [],
      event_status: event.event_status || 'planned',
      record_type: 'schedule',
      schedule_source: event.schedule_source || 'organization',
      created_by_role: event.created_by_role || event.schedule_source || 'organization',
      requires_approval: Boolean(event.requires_approval),
      created_by: uuidOrNull(event.created_by),
      created_at: event.created_at,
      updated_at: event.updated_at
    }));
  if (schedules.length) {
    await request('/rest/v1/schedules?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(schedules)
    }, true);
  }

  for (const event of (store.events || []).filter((item) => uuidOrNull(item.id) && item.record_type === 'schedule')) {
    const occurrences = Array.isArray(event.occurrences) ? event.occurrences : [];
    await request(`/rest/v1/schedule_occurrences?schedule_id=eq.${encodeURIComponent(event.id)}`, { method: 'DELETE' }, true);
    if (!occurrences.length) continue;
    await request('/rest/v1/schedule_occurrences', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(occurrences.map((occurrence) => ({
        id: uuidOrNull(occurrence.id) || undefined,
        schedule_id: event.id,
        date: occurrence.date || String(occurrence.start_time || '').slice(0, 10),
        start_time: occurrence.start_time,
        end_time: occurrence.end_time
      })))
    }, true);
  }
}

async function syncBlockedTimesTable(store) {
  const blocks = (store.blockedTimes || [])
    .filter((block) => uuidOrNull(block.id) && block.record_type === 'blocked_time')
    .map((block) => ({
      id: block.id,
      title: block.title,
      block_type: block.block_type,
      start_time: block.start_time,
      end_time: block.end_time,
      reason: block.reason || null,
      record_type: 'blocked_time',
      block_source: 'admin',
      created_by_role: 'admin',
      requires_approval: false,
      created_by: uuidOrNull(block.created_by),
      created_at: block.created_at,
      updated_at: block.updated_at || block.created_at
    }));
  if (!blocks.length) return;
  await request('/rest/v1/blocked_times?on_conflict=id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(blocks)
  }, true);
}

function uuidOrNull(value) {
  const text = String(value || '');
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : null;
}

export async function authenticate(username, password) {
  const login = username.trim().toLowerCase();
  const email = login.includes('@') ? login : `${login}@core.local`;
  let payload;
  try {
    payload = await request('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
  } catch (error) {
    const fallbackUsername = login.endsWith('@aup.edu.ph') ? login.split('@')[0].toLowerCase().replace(/[^a-z0-9_.-]+/g, '.').replace(/^[.-]+|[.-]+$/g, '').slice(0, 32) : '';
    if (!fallbackUsername) throw error;
    payload = await request('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: JSON.stringify({ email: `${fallbackUsername}@core.local`, password })
    });
  }
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(payload));
  return payload;
}

export function authenticatedEmail() {
  return String(session()?.user?.email || '').trim().toLowerCase();
}

export function authenticatedUserId() {
  return session()?.user?.id || '';
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
  return payload;
}

export async function requestAccount({ username, password, fullName, organizationName, email = '', phoneNumber = '' }) {
  const payload = {
    p_username: username,
    p_password: password,
    p_full_name: fullName,
    p_requested_role: 'organization_manager',
    p_organization_name: organizationName
  };
  try {
    return await rpc('create_scheduler_account', {
      ...payload,
      p_aup_email: email,
      p_email: email,
      p_phone_number: phoneNumber,
      p_contact_number: phoneNumber
    });
  } catch (error) {
    if (/parameter|function|schema cache|PGRST202|PGRST203/i.test(error.message || '')) {
      throw new Error('Organization sign-up needs the latest Supabase SQL update before AUP email and phone can be saved.');
    }
    throw error;
  }
}

export async function decideAccountRequest(id, decision) {
  return rpc('apply_account_request_decision', { p_request_id: id, p_decision: decision }, true);
}

export async function updateAccountRequestStatus(id, decision, accountRequest = null) {
  const response = await request(`/rest/v1/account_requests?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ status: decision, updated_at: new Date().toISOString() })
  }, true);
  const requestRow = accountRequest || (Array.isArray(response) ? response[0] : null);
  if (requestRow) await upsertProfileFromAccountRequest({ ...requestRow, id }, decision);
  return response;
}

async function upsertProfileFromAccountRequest(accountRequest, decision) {
  const userId = accountRequest.user_id;
  if (!userId) return;
  const enabled = decision === 'approved';
  const email = accountRequest.aup_email || accountRequest.email || '';
  const phone = accountRequest.phone_number || accountRequest.contact_number || '';
  const profile = {
    id: userId,
    username: accountRequest.username || email,
    full_name: accountRequest.full_name || accountRequest.name || accountRequest.username || email || 'Organization Account',
    role: 'organization_manager',
    permissions: { enabled },
    account_preset: 'organization',
    account_type: 'org',
    organization_id: accountRequest.organization_id || organizationKey(accountRequest.organization_name),
    organization_name: accountRequest.organization_name || '',
    email,
    contact_number: phone,
    phone_number: phone,
    updated_at: new Date().toISOString()
  };
  if (enabled) profile.created_at = accountRequest.created_at || new Date().toISOString();
  await request('/rest/v1/profiles?on_conflict=id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(profile)
  }, true);
}

function organizationKey(name) {
  return String(name || 'organization')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'organization';
}

const DELETE_COLLECTION_ALIASES = {
  events: ['events', 'schedules', 'reservations', 'scheduler_events', 'calendar_events'],
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
}
