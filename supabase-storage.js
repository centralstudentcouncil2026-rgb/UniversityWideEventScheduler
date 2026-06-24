import { emptyPublicStore, normalizeStore, storeForPersistence } from './app-data.js?v=20260624-calendar-dedupe-v1';
import { currentUser, ensureAllowedAdminStore, isAllowedAdminEmail, isSuperAdmin } from './app-rules.js?v=20260622-whole-day-realtime-v1';

const { url, publishableKey } = window.SUPABASE_CONFIG;
const SESSION_KEY = 'core_supabase_auth_session';
const STORE_SYNC_SIGNAL_KEY = 'csc-sync-store-version';
const STORE_SYNC_CHANNEL = 'csc-sync-store';
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
    const store = await loadRelationalStore(Boolean(session()?.access_token));
    if (session()?.access_token) {
      await mergeAuthenticatedProfiles(store);
      await mergeBlockedTimes(store, true);
      enforceAuthenticatedIdentity(store);
    }
    rememberEventIds(store);
    return { store, notice: 'Connected to the authenticated Supabase backend.', noticeType: 'success' };
  } catch (error) {
    lastEventIds = new Set();
    return { store: emptyPublicStore(), notice: `Supabase is unavailable. ${error.message}`, noticeType: 'error' };
  }
}

export async function loadPublicStore() {
  try {
    const store = await loadRelationalStore();
    await mergeBlockedTimes(store);
    return { store, notice: 'Connected to the public Supabase calendar.', noticeType: 'success' };
  } catch (error) {
    return { store: emptyPublicStore(), notice: `Supabase is unavailable. ${error.message}`, noticeType: 'error' };
  }
}

async function mergePublicSchedules(store) {
  try {
    const [rows, organizations, occurrences] = await Promise.all([
      request('/rest/v1/schedules?select=id,organization_id,category_id,title,venue,schedule_type,start_time,end_time,expected_attendees,privacy_level,contact_person,contact_info,public_description,purpose,approval_status,admin_recommendation,approval_date,event_status,created_at,updated_at,revision_of&approval_status=eq.approved&privacy_level=eq.basic&revision_of=is.null'),
      request('/rest/v1/schedule_organizations?select=id,organization_name,organization_type'),
      request('/rest/v1/schedule_occurrences?select=id,schedule_id,date,start_time,end_time&order=start_time.asc')
    ]);
    if (!Array.isArray(rows)) return;
    const organizationsById = new Map((Array.isArray(organizations) ? organizations : []).map((organization) => [organization.id, organization]));
    const occurrencesBySchedule = new Map();
    (Array.isArray(occurrences) ? occurrences : []).forEach((occurrence) => {
      const scheduleOccurrences = occurrencesBySchedule.get(occurrence.schedule_id) || [];
      scheduleOccurrences.push(occurrence);
      occurrencesBySchedule.set(occurrence.schedule_id, scheduleOccurrences);
    });
    const storedById = new Map((store.events || []).map((event) => [event.id, event]));
    store.events = rows
      .filter((row) => row.id && !['cancelled', 'disabled', 'draft'].includes(row.event_status || 'planned'))
      .map((row) => {
        const existing = storedById.get(row.id) || {};
        const organization = organizationsById.get(row.organization_id);
        return {
          ...existing,
          ...row,
          record_type: 'schedule',
          organization_name: organization?.organization_name || existing.organization_name || '',
          occurrences: occurrencesBySchedule.get(row.id)?.length
            ? occurrencesBySchedule.get(row.id)
            : [{ id: `${row.id}-public`, date: String(row.start_time || '').slice(0, 10), start_time: row.start_time, end_time: row.end_time }]
        };
      });
  } catch (error) {
    store.events = [];
    console.warn('CONNECT public relational schedule sync unavailable:', error);
  }
}

async function mergeBlockedTimes(store, authenticated = false) {
  try {
    const rows = await request('/rest/v1/blocked_times?select=*&order=start_time.asc', {}, authenticated);
    if (!Array.isArray(rows)) return;
    const byId = new Map((store.blockedTimes || []).map((block) => [block.id, block]));
    rows.filter((row) => row.id).forEach((row) => {
      byId.set(row.id, {
        ...(byId.get(row.id) || {}),
        ...row,
        record_type: 'blocked_time',
        block_source: 'admin',
        created_by_role: 'admin',
        requires_approval: false
      });
    });
    store.blockedTimes = [...byId.values()];
  } catch (error) {
    console.warn('CONNECT blocked-time sync unavailable:', error);
  }
}

export async function loadAuthenticatedStore() {
  if (!session()?.access_token) throw new Error('Your session expired. Please log in again.');
  const store = await loadRelationalStore(true);
  await mergeAuthenticatedProfiles(store);
  await mergeBlockedTimes(store, true);
  enforceAuthenticatedIdentity(store);
  rememberEventIds(store);
  return store;
}

async function loadRelationalStore(authenticated = false) {
  const [profiles, organizations, categories, schedules, occurrences, blocks, announcements] = await Promise.all([
    authenticated ? request('/rest/v1/profiles?select=*', {}, true) : Promise.resolve([]),
    request('/rest/v1/organizations?select=*'),
    request('/rest/v1/schedule_categories?select=*'),
    request('/rest/v1/schedules?select=*', {}, authenticated),
    request('/rest/v1/schedule_occurrences?select=*', {}, authenticated),
    request('/rest/v1/blocked_times?select=*', {}, authenticated),
    request('/rest/v1/announcements?select=*', {}, authenticated)
  ]);
  const occurrencesBySchedule = new Map();
  (occurrences || []).forEach((item) => {
    const values = occurrencesBySchedule.get(item.schedule_id) || [];
    values.push(item); occurrencesBySchedule.set(item.schedule_id, values);
  });
  const organizationNames = new Map((organizations || []).map((item) => [item.id, item.organization_name]));
  const store = normalizeStore({
    version: 4,
    currentUserId: authenticatedUserId() || 'public',
    users: (profiles || []).map((profile) => ({
      ...profile,
      username: profile.email,
      permissions: { ...(profile.permissions || {}), enabled: Boolean(profile.is_enabled) }
    })),
    organizations: organizations || [], categories: categories || [], announcements: announcements || [],
    blockedTimes: (blocks || []).map((block) => ({ ...block, record_type: 'blocked_time', block_source: 'admin', created_by_role: 'admin', requires_approval: false })),
    events: (schedules || []).map((schedule) => ({ ...schedule, record_type: 'schedule', organization_name: organizationNames.get(schedule.organization_id) || '', occurrences: occurrencesBySchedule.get(schedule.id) || [] }))
  });
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
  if (!Array.isArray(store.users)) store.users = [];
  const existing = store.accountRequests.find((item) => (item.id || item.request_id) === accountRequest.id);
  const organizationName = accountRequest.organization_name || accountRequest.organizationName || existing?.organization_name || existing?.organizationName || '';
  const contactNumber = accountRequest.contact_number || accountRequest.phone_number || existing?.contact_number || existing?.phone_number || '';
  const next = {
    ...existing,
    ...accountRequest,
    id: accountRequest.id,
    request_id: accountRequest.id,
    organization_name: organizationName,
    organizationName,
    aup_email: accountRequest.aup_email || accountRequest.email || existing?.aup_email || '',
    phone_number: accountRequest.phone_number || accountRequest.contact_number || existing?.phone_number || '',
    contact_number: contactNumber
  };
  if (existing) Object.assign(existing, next);
  else store.accountRequests.push(next);

  const requestEmail = String(next.aup_email || '').toLowerCase();
  const requestUsername = String(accountRequest.username || '').toLowerCase();
  const profile = store.users.find((user) =>
    user.id === accountRequest.user_id
    || (requestEmail && String(user.email || '').toLowerCase() === requestEmail)
    || (requestUsername && String(user.username || '').toLowerCase() === requestUsername)
  );
  if (!profile) return;

  if (organizationName) {
    profile.organization_name = organizationName;
    profile.organizationName = organizationName;
    profile.organization_id = profile.organization_id || accountRequest.organization_id || organizationKey(organizationName);
    const organization = (store.organizations || []).find((item) => item.id === profile.organization_id);
    if (!organization) {
      if (!Array.isArray(store.organizations)) store.organizations = [];
      store.organizations.push({
        id: profile.organization_id,
        organization_name: organizationName,
        organization_type: 'Student Organization',
        created_at: accountRequest.created_at || new Date().toISOString(),
        updated_at: accountRequest.updated_at || new Date().toISOString()
      });
    }
  }
  if (contactNumber) {
    profile.contact_number = contactNumber;
    profile.phone_number = contactNumber;
  }
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
  const userId = authenticatedUserId();
  if (!email) return store;
  if (isAllowedAdminEmail(email)) return ensureAllowedAdminStore(store, email, userId);

  const user = store.users.find((item) => item.id === userId);
  if (user) store.currentUserId = user.id;
  return store;
}

export async function saveStore(store, { skipRecordSync = false } = {}) {
  const tableFailures = skipRecordSync ? [] : await syncRecordTables(store);
  if (tableFailures.length) {
    console.warn('CONNECT relational table sync reported errors after store save:', tableFailures);
    const details = tableFailures
      .map((failure) => `${failure.table}: ${recordSyncFailureMessage(failure.error)}`)
      .join(' ');
    throw new Error(`Database record sync failed. ${details}`);
  }
  storeForPersistence(store);
  const deleteFailures = await cleanupRemovedEvents(store);
  if (deleteFailures.length) {
    console.warn('CONNECT delete cleanup RPC reported errors after store save:', deleteFailures);
  }
  broadcastStoreSync();
  return { deleteFailures, tableFailures };
}

function recordSyncFailureMessage(error) {
  const message = String(error?.message || 'Unknown error');
  if (/schedules_category_id_fkey|foreign key.*category_id|category_id.*foreign key/i.test(message)) {
    return 'Schedule categories are not aligned with the app. Run supabase-category-fix.sql in Supabase, refresh the portal, then save again.';
  }
  return message;
}

function broadcastStoreSync() {
  try {
    localStorage.setItem(STORE_SYNC_SIGNAL_KEY, String(Date.now()));
  } catch {}
  try {
    const channel = new BroadcastChannel(STORE_SYNC_CHANNEL);
    channel.postMessage({ updated_at: Date.now() });
    channel.close();
  } catch {}
}

async function syncRecordTables(store) {
  if (!session()?.access_token) return [];
  const failures = [];
  let organizationIds = new Map();
  try {
    organizationIds = await syncOrganizationsTable(store);
  } catch (error) {
    failures.push({ table: 'schedule_organizations', error });
  }
  await syncSchedulesTable(store, organizationIds).catch((error) => failures.push({ table: 'schedules', error }));
  if (isSuperAdmin(store)) {
    await syncBlockedTimesTable(store).catch((error) => failures.push({ table: 'blocked_times', error }));
  }
  return failures;
}

async function syncOrganizationsTable(store) {
  const user = currentUser(store);
  const candidates = (store.organizations || [])
    .filter((org) => org.id && (org.organization_name || org.name))
    .filter((org) => isSuperAdmin(store) || org.id === user.organization_id)
    .map((org) => ({
      id: org.id,
      organization_name: String(org.organization_name || org.name).trim(),
      organization_type: org.organization_type || org.type || 'Organization',
      updated_at: org.updated_at || new Date().toISOString()
    }));
  const existingRows = await request('/rest/v1/schedule_organizations?select=id,organization_name', {}, true);
  const existingByName = new Map((Array.isArray(existingRows) ? existingRows : []).map((organization) => [String(organization.organization_name || '').trim().toLowerCase(), organization.id]));
  const organizationIds = new Map();
  candidates.forEach((organization) => {
    const existingId = existingByName.get(organization.organization_name.toLowerCase());
    const resolvedId = existingId || organization.id;
    organizationIds.set(`id:${organization.id}`, resolvedId);
    organizationIds.set(`name:${organization.organization_name.toLowerCase()}`, resolvedId);
    organization.id = resolvedId;
  });
  const byName = new Map();
  candidates.forEach((organization) => {
    const key = organization.organization_name.toLowerCase();
    const existing = byName.get(key);
    if (!existing || new Date(organization.updated_at) >= new Date(existing.updated_at)) byName.set(key, organization);
  });
  const byId = new Map();
  [...byName.values()].forEach((organization) => {
    const existing = byId.get(organization.id);
    if (!existing || new Date(organization.updated_at) >= new Date(existing.updated_at)) byId.set(organization.id, organization);
  });
  const organizations = [...byId.values()];
  if (!organizations.length) return organizationIds;
  await request('/rest/v1/schedule_organizations?on_conflict=organization_name', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(organizations)
  }, true);
  return organizationIds;
}

async function syncSchedulesTable(store, organizationIds = new Map()) {
  const user = currentUser(store);
  const ownedSchedules = (store.events || [])
    .filter((event) => uuidOrNull(event.id) && event.record_type === 'schedule')
    .filter(isRelationalScheduleReady)
    .filter((event) => isSuperAdmin(store) || event.created_by === user.id);
  const schedules = ownedSchedules
    .map((event) => ({
      id: event.id,
      organization_id: organizationIds.get(`id:${event.organization_id}`)
        || organizationIds.get(`name:${String(event.organization_name || '').trim().toLowerCase()}`)
        || event.organization_id
        || null,
      category_id: event.category_id,
      title: event.title,
      venue: event.venue,
      schedule_type: event.schedule_type || (Array.isArray(event.occurrences) && event.occurrences.length > 1 ? 'multi_day' : 'single_day'),
      start_time: event.start_time,
      end_time: event.end_time,
      expected_attendees: normalizedAttendeeCount(event.expected_attendees),
      privacy_level: event.privacy_level || 'basic',
      contact_person: event.contact_person,
      contact_info: event.contact_info,
      public_description: event.public_description,
      purpose: event.purpose,
      schedule_schema_version: Number(event.schedule_schema_version || 2),
      approval_status: event.approval_status || 'pending',
      admin_recommendation: event.admin_recommendation || null,
      approval_date: event.approval_date || null,
      approved_by: uuidOrNull(event.approved_by),
      reviewed_by: uuidOrNull(event.reviewed_by),
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
  const upsertSchedules = async (items) => {
    if (!items.length) return;
    await request('/rest/v1/schedules?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(items)
    }, true);
  };
  // A revision references its original schedule, so save originals before
  // revision rows instead of relying on database row ordering in one batch.
  await upsertSchedules(schedules.filter((schedule) => !schedule.revision_of));
  await upsertSchedules(schedules.filter((schedule) => schedule.revision_of));

  for (const event of ownedSchedules) {
    const occurrences = Array.isArray(event.occurrences) ? event.occurrences : [];
    await request(`/rest/v1/schedule_occurrences?schedule_id=eq.${encodeURIComponent(event.id)}`, { method: 'DELETE' }, true);
    if (!occurrences.length) continue;
    await request('/rest/v1/schedule_occurrences', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(occurrences.map((occurrence) => ({
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

function normalizedAttendeeCount(value) {
  const count = Number.parseInt(String(value ?? '').trim(), 10);
  return Number.isInteger(count) && count >= 1 ? count : 1;
}

function isRelationalScheduleReady(event = {}) {
  return Number(event.schedule_schema_version || 0) >= 2
    && Boolean(event.title && event.category_id && event.venue)
    && normalizedAttendeeCount(event.expected_attendees) >= 1
    && ['basic', 'internal'].includes(event.privacy_level || 'basic')
    && Boolean(event.contact_person)
    && /^\d{11}$/.test(String(event.contact_info || ''))
    && Boolean(event.public_description && event.purpose)
    && Boolean(event.start_time && event.end_time)
    && new Date(event.end_time) > new Date(event.start_time);
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
  const normalizedEmail = String(email).trim().toLowerCase();
  let signup;
  try {
    signup = await request('/auth/v1/signup', {
      method: 'POST',
      body: JSON.stringify({ email: normalizedEmail, password, data: { full_name: fullName, username, organization_name: organizationName, contact_number: phoneNumber, account_type: 'org' } })
    });
  } catch (error) {
    if (/already registered|user already exists/i.test(String(error.message || ''))) {
      throw new Error('This AUP email is already registered. Wait for approval, or ask an admin to review the existing request.');
    }
    throw error;
  }
  const userId = signup?.user?.id;
  if (!userId) throw new Error('Supabase could not create the organization account.');
  await request('/rest/v1/profiles', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id: userId, full_name: fullName, email: normalizedEmail, role: 'organization_manager', account_type: 'org', contact_number: phoneNumber, approval_status: 'pending', is_enabled: false })
  });
  await request('/rest/v1/account_requests', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ user_id: userId, full_name: fullName, aup_email: normalizedEmail, contact_number: phoneNumber, organization_name: organizationName, status: 'pending' })
  });
  return signup;
}

export async function decideAccountRequest(id, decision) {
  return rpc('approve_organization_account', { p_request_id: id, p_decision: decision }, true);
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
  if (collection === 'events') {
    await deleteScheduleRows(id);
    return;
  }
  if (collection === 'blockedTimes') {
    const blockId = uuidOrNull(id);
    if (blockId) await request(`/rest/v1/blocked_times?id=eq.${encodeURIComponent(blockId)}`, { method: 'DELETE' }, true);
    return;
  }
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

async function deleteScheduleRows(id) {
  const scheduleId = uuidOrNull(id);
  if (!scheduleId) return;
  const encodedId = encodeURIComponent(scheduleId);
  await request(`/rest/v1/schedule_occurrences?schedule_id=eq.${encodedId}`, { method: 'DELETE' }, true);
  await request(`/rest/v1/schedules?id=eq.${encodedId}`, { method: 'DELETE' }, true);
}

export function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}
