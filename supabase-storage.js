import { emptyPublicStore, normalizeStore, storeForPersistence } from './app-data.js?v=20260624-unified-calendar-v1';
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
  if (!response.ok) {
    const error = new Error(payload?.message || payload?.error_description || payload?.error || payload?.msg || `Supabase request failed (${response.status})`);
    error.status = response.status;
    error.code = payload?.error_code || payload?.code || '';
    error.details = payload;
    throw error;
  }
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

async function mergeBlockedTimes(store, authenticated = false) {
  try {
    const rows = await request('/rest/v1/calendar_items?record_type=eq.blocked_time&select=*&order=start_time.asc', {}, authenticated);
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
  const [profiles, organizations, calendarItems, announcements] = await Promise.all([
    authenticated ? request('/rest/v1/profiles?select=*', {}, true) : Promise.resolve([]),
    request('/rest/v1/organizations?select=*'),
    request('/rest/v1/calendar_items?select=*&order=created_at.asc', {}, authenticated),
    request('/rest/v1/announcements?select=*', {}, authenticated)
  ]);
  const items = Array.isArray(calendarItems) ? calendarItems : [];
  const organizationNames = new Map((organizations || []).map((item) => [item.id, item.organization_name]));
  const users = (profiles || []).map(profileToUser);
  const store = normalizeStore({
    version: 4,
    currentUserId: authenticatedUserId() || 'public',
    users,
    pendingAccounts: (profiles || []).filter(isPendingOrganizationProfile).map(profileToAccountRequest),
    organizations: organizations || [],
    categories: items.filter((item) => item.record_type === 'category').map((item) => ({
      id: item.category_id || item.id,
      name: item.category_name || 'Category',
      color: item.category_color || '#64748B',
      active: item.category_active !== false,
      created_at: item.created_at,
      updated_at: item.updated_at
    })),
    announcements: announcements || [],
    blockedTimes: items
      .filter((item) => item.record_type === 'blocked_time')
      .map((item) => ({ ...item, record_type: 'blocked_time', block_source: 'admin', created_by_role: 'admin', requires_approval: false })),
    events: items
      .filter((item) => item.record_type === 'schedule')
      .map((item) => ({
        ...item,
        record_type: 'schedule',
        organization_name: organizationNames.get(item.organization_id) || '',
        occurrences: jsonArray(item.occurrences)
      }))
  });
  return store;
}

async function mergeAuthenticatedProfiles(store) {
  try {
    const profiles = await request('/rest/v1/profiles?select=*&order=created_at.asc', {}, true);
    profiles.forEach((profile) => mergeProfileUser(store, profile));
    store.pendingAccounts = profiles.filter(isPendingOrganizationProfile).map(profileToAccountRequest);
  } catch (error) {
    console.warn('CONNECT account data merge unavailable:', error);
  }
}

function isPendingOrganizationProfile(profile) {
  return profile?.role === 'organization_manager' && profile.approval_status === 'pending';
}

function profileToAccountRequest(profile) {
  return {
    id: profile.id,
    request_id: profile.id,
    user_id: profile.id,
    username: profile.username || profile.email || '',
    full_name: profile.full_name || '',
    aup_email: profile.email || '',
    contact_number: profile.contact_number || '',
    phone_number: profile.contact_number || '',
    organization_name: profile.organization_name || '',
    organizationName: profile.organization_name || '',
    status: profile.approval_status || 'pending',
    created_at: profile.created_at,
    updated_at: profile.updated_at
  };
}

function profileToUser(profile) {
  return {
    ...profile,
    username: profile.username || profile.email,
    permissions: { ...(profile.permissions || {}), enabled: Boolean(profile.is_enabled) }
  };
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
    permissions: { ...(existing?.permissions || {}), ...jsonObject(profile.permissions), enabled: Boolean(profile.is_enabled) }
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

function jsonArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
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
  if (/calendar_items|relation.*does not exist/i.test(message)) {
    return 'The unified calendar database update is not installed. Run supabase-unified-calendar.sql in Supabase, refresh the portal, then save again.';
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
    failures.push({ table: 'organizations', error });
  }
  await syncCalendarItemsTable(store, organizationIds).catch((error) => failures.push({ table: 'calendar_items', error }));
  return failures;
}

async function syncOrganizationsTable(store) {
  const organizationIds = new Map();
  const existingRows = await request('/rest/v1/organizations?select=id,organization_name', {}, true);
  const existingOrganizations = Array.isArray(existingRows) ? existingRows : [];

  const existingById = new Map(
    existingOrganizations
      .filter((organization) => organization.id)
      .map((organization) => [String(organization.id), organization.id])
  );

  const existingByName = new Map(
    existingOrganizations
      .filter((organization) => organization.organization_name)
      .map((organization) => [
        String(organization.organization_name).trim().toLowerCase(),
        organization.id
      ])
  );

  for (const organization of store.organizations || []) {
    const sourceId = String(organization.id || '').trim();
    const organizationName = String(organization.organization_name || organization.name || '').trim();
    const resolvedId =
      existingById.get(sourceId)
      || existingByName.get(organizationName.toLowerCase())
      || uuidOrNull(sourceId);

    if (!resolvedId) continue;
    if (sourceId) organizationIds.set(`id:${sourceId}`, resolvedId);
    if (organizationName) organizationIds.set(`name:${organizationName.toLowerCase()}`, resolvedId);
  }

  // Organization accounts should not write to the shared organizations table.
  // The organization row is created by approve_organization_profile() during admin approval.
  if (!isSuperAdmin(store)) return organizationIds;

  const candidates = (store.organizations || [])
    .filter((org) => org.id && (org.organization_name || org.name))
    .map((org) => ({
      source_id: org.id,
      id: uuidOrNull(org.id),
      organization_name: String(org.organization_name || org.name).trim(),
      organization_type: org.organization_type || org.type || 'Organization',
      updated_at: org.updated_at || new Date().toISOString()
    }));

  const byName = new Map();
  candidates.forEach((organization) => {
    const key = organization.organization_name.toLowerCase();
    const existing = byName.get(key);
    if (!existing || new Date(organization.updated_at) >= new Date(existing.updated_at)) {
      byName.set(key, organization);
    }
  });

  for (const organization of byName.values()) {
    const resolvedExistingId = existingByName.get(organization.organization_name.toLowerCase()) || organization.id;
    const payload = {
      ...(resolvedExistingId ? { id: resolvedExistingId } : {}),
      organization_name: organization.organization_name,
      organization_type: organization.organization_type,
      updated_at: organization.updated_at
    };

    const saved = await request('/rest/v1/organizations?on_conflict=organization_name', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(payload)
    }, true);

    const savedRow = Array.isArray(saved) ? saved[0] : saved;
    const resolvedId = savedRow?.id || resolvedExistingId;
    if (!resolvedId) continue;
    organizationIds.set(`id:${organization.source_id}`, resolvedId);
    organizationIds.set(`name:${organization.organization_name.toLowerCase()}`, resolvedId);
  }

  return organizationIds;
}

async function syncCalendarItemsTable(store, organizationIds = new Map()) {
  const user = currentUser(store);
  const ownedSchedules = (store.events || [])
    .filter((event) => uuidOrNull(event.id) && event.record_type === 'schedule')
    .filter(isRelationalScheduleReady)
    .filter((event) => isSuperAdmin(store) || event.created_by === user.id);
  const schedules = ownedSchedules
    .map((event) => ({
      id: event.id,
      record_type: 'schedule',
      organization_id: uuidOrNull(organizationIds.get(`id:${event.organization_id}`)
        || organizationIds.get(`name:${String(event.organization_name || '').trim().toLowerCase()}`)
        || event.organization_id
        || null),
      category_id: event.category_id,
      title: event.title,
      venue: event.venue,
      schedule_type: event.schedule_type || (Array.isArray(event.occurrences) && event.occurrences.length > 1 ? 'multi_day' : 'single_day'),
      start_time: event.start_time,
      end_time: event.end_time,
      occurrences: Array.isArray(event.occurrences) ? event.occurrences : [],
      expected_attendees: normalizedAttendeeCount(event.expected_attendees),
      privacy_level: event.privacy_level || 'basic',
      contact_person: event.contact_person,
      contact_info: event.contact_info,
      public_description: event.public_description,
      purpose: event.purpose,
      approval_status: event.approval_status || 'pending',
      admin_recommendation: event.admin_recommendation || null,
      approval_date: event.approval_date || null,
      approved_by: uuidOrNull(event.approved_by),
      reviewed_by: uuidOrNull(event.reviewed_by),
      revision_of: event.revision_of || null,
      original_schedule_id: event.original_schedule_id || null,
      revision_status: event.revision_status || null,
      revision_created_at: event.revision_created_at || null,
      revision_submitted_at: event.revision_submitted_at || null,
      revision_history: event.revision_history || [],
      event_status: event.event_status || 'planned',
      created_by: uuidOrNull(event.created_by),
      created_at: event.created_at,
      updated_at: event.updated_at
    }));
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
      approval_status: 'approved',
      event_status: 'planned',
      created_by: uuidOrNull(block.created_by),
      created_at: block.created_at,
      updated_at: block.updated_at || block.created_at
    }));
  const categories = isSuperAdmin(store) ? (store.categories || []).map((category) => ({
    id: String(category.id),
    record_type: 'category',
    category_id: String(category.id),
    category_name: category.name,
    category_color: category.color || '#64748B',
    category_active: category.active !== false,
    created_by: uuidOrNull(user.id),
    created_at: category.created_at || new Date().toISOString(),
    updated_at: category.updated_at || new Date().toISOString()
  })) : [];

  await upsertCalendarItemRows(categories);
  await upsertCalendarItemRows(schedules);
  if (isSuperAdmin(store)) await upsertCalendarItemRows(blocks);
}

async function upsertCalendarItemRows(rows) {
  if (!rows.length) return;
  await request('/rest/v1/calendar_items?on_conflict=id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows)
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

export async function requestAccount({ username, password, fullName, organizationName, email = '', phoneNumber = '', organizationCode = '' }) {
  const normalizedEmail = String(email).trim().toLowerCase();
  let signup;
  try {
    signup = await request('/auth/v1/signup', {
      method: 'POST',
      body: JSON.stringify({ email: normalizedEmail, password, data: { full_name: fullName, username, organization_name: organizationName, organization_code: organizationCode || username, contact_number: phoneNumber, account_type: 'organization', email_category: 'aup' } })
    });
  } catch (error) {
    const isDuplicateAccount = /user_already_exists|already registered|user already exists/i.test(`${error?.code || ''} ${error?.message || ''}`);
    const message = isDuplicateAccount
      ? 'This AUP email is already registered. Wait for admin approval, or ask an admin to review the existing request.'
      : (error?.message || 'Organization signup failed.');
    console.error('Organization signup error:', { message, status: error?.status, code: error?.code, details: error?.details });
    if (typeof alert === 'function') alert(message);
    if (isDuplicateAccount) throw new Error(message);
    throw error;
  }
  const userId = signup?.user?.id;
  if (!userId) throw new Error('Supabase could not create the organization account.');
  const signupHeaders = signup?.access_token ? { Authorization: `Bearer ${signup.access_token}` } : {};
  await request('/rest/v1/profiles', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal', ...signupHeaders },
    body: JSON.stringify({ id: userId, username, full_name: fullName, email: normalizedEmail, role: 'organization_manager', account_type: 'org', organization_name: organizationName, contact_number: phoneNumber, approval_status: 'pending', is_enabled: false })
  });
  return signup;
}

export async function decideAccountRequest(id, decision) {
  return rpc('approve_organization_profile', { p_profile_id: id, p_decision: decision }, true);
}

const DELETE_COLLECTION_ALIASES = {
  activityLogs: ['activity_logs', 'activityLogs']
};

export async function deleteRecord(collection, id) {
  if (['events', 'blockedTimes', 'categories'].includes(collection)) {
    await request(`/rest/v1/calendar_items?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' }, true);
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
export function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}
