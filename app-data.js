const EMPTY_COLLECTIONS = [
  'users',
  'organizations',
  'categories',
  'events',
  'activityStatuses',
  'blockedTimes',
  'announcements',
  'concerns',
  'activityLogs',
  'accountRequests'
];
const INTERNAL_PRIVACY_MARKER = '[[privacy:internal]]';
export const SCHEDULE_CATEGORIES = [
  ['worship', 'Worship', '#2563EB'],
  ['gathering', 'Gathering', '#16A34A'],
  ['outreach', 'Outreach', '#DC2626'],
  ['socialization', 'Socialization', '#D97706'],
  ['meeting', 'Meeting', '#7C3AED'],
  ['others', 'Others', '#64748B']
];
export const ACCOUNT_TYPES = ['CSC', 'OIC'];
export const ACTIVITY_STATUS_OPTIONS = [
  'Available in Office',
  'Not Available',
  'On Break',
  'In a Meeting',
  'Out for University Activity',
  'Available After an Hour',
  'Online Consultation Only'
];
const ACCOUNT_PERMISSION_DEFAULTS = {
  enabled: true,
  manageAccounts: false,
  approveEvents: false,
  editAllEvents: false,
  deleteAllEvents: false,
  manageBlockedTimes: false,
  manageAnnouncements: false,
  updatePresidentStatus: false,
  updateOfficeStatus: false,
  manageCategories: false
};

function preset(label, role, permissions = {}) {
  return { label, role, permissions: { ...ACCOUNT_PERMISSION_DEFAULTS, ...permissions } };
}

export function createId() {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') return cryptoApi.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function emptyPublicStore() {
  const store = { version: 3, currentUserId: 'public' };
  EMPTY_COLLECTIONS.forEach((name) => {
    store[name] = [];
  });
  return store;
}

export function normalizeStore(store = {}) {
  const normalized = { ...emptyPublicStore(), ...store };
  EMPTY_COLLECTIONS.forEach((name) => {
    if (!Array.isArray(normalized[name])) normalized[name] = [];
  });
  normalized.users = normalized.users.map(normalizeUser);
  normalized.categories = normalizeCategories(normalized.categories);
  normalized.events = normalized.events.map(normalizeEvent);
  normalized.blockedTimes = normalized.blockedTimes.map(normalizeBlockedTime);
  normalized.activityStatuses = normalized.activityStatuses.map(normalizeActivityStatus).filter(Boolean);
  return normalized;
}

export const ACCOUNT_PRESETS = {
  manager: preset('Manager', 'super_admin', {
    manageAccounts: true,
    approveEvents: true,
    editAllEvents: true,
    deleteAllEvents: true,
    manageBlockedTimes: true,
    manageAnnouncements: true,
    updatePresidentStatus: true,
    updateOfficeStatus: true,
    manageCategories: true
  }),
  csc_president: preset('CSC President', 'super_admin', {
    approveEvents: true,
    editAllEvents: true,
    manageAnnouncements: true,
    updatePresidentStatus: true
  }),
  head_events: preset('Head of Events', 'super_admin', {
    approveEvents: true,
    editAllEvents: true,
    manageBlockedTimes: true,
    manageAnnouncements: true,
    updateOfficeStatus: true
  }),
  organization: preset('Organization', 'organization_manager')
};

function normalizeUser(user = {}) {
  const { password_hash: _passwordHash, ...safeUser } = user;
  const preset = safeUser.account_preset || presetForRole(safeUser.role);
  const presetConfig = ACCOUNT_PRESETS[preset] || ACCOUNT_PRESETS.organization;
  return {
    ...safeUser,
    role: safeUser.role || presetConfig.role,
    account_preset: preset,
    account_type: ACCOUNT_TYPES.includes(safeUser.account_type) ? safeUser.account_type : defaultAccountType(preset),
    permissions: { ...presetConfig.permissions, ...(safeUser.permissions || {}) }
  };
}

function defaultAccountType(preset) {
  return preset === 'head_events' || preset === 'organization' ? 'OIC' : 'CSC';
}

function presetForRole(role) {
  return role === 'super_admin' ? 'manager' : 'organization';
}

function normalizeCategories(categories = []) {
  return SCHEDULE_CATEGORIES.map(([id, name, color]) => {
    const existing = categories.find((item) => item.id === id || String(item.name || '').toLowerCase() === name.toLowerCase());
    return {
      ...existing,
      id,
      name,
      color: existing?.color || color,
      active: true
    };
  });
}

export function storeForPersistence(store) {
  validateSchedulesForPersistence(store);
  validateBlockedTimesForPersistence(store);
  validateActivityStatusesForPersistence(store);
  return {
    ...store,
    events: store.events.map((event) => ({
      ...event,
      private_notes: event.privacy_level === 'internal'
        ? [INTERNAL_PRIVACY_MARKER, event.private_notes].filter(Boolean).join('\n')
        : event.private_notes
    }))
  };
}

function validateBlockedTimesForPersistence(store) {
  (store.blockedTimes || []).forEach((block) => {
    if (!block.title || !['single_day', 'multi_day'].includes(block.block_type)) throw new Error('Blocked period requires a title and block type.');
    if (!block.start_time || !block.end_time || new Date(block.end_time) <= new Date(block.start_time)) throw new Error('Blocked-period end date and time must be later than start date and time.');
    if (String(block.reason || '').length > 500) throw new Error('Blocked-period reason is too long.');
    if (!block.created_by || !block.created_at) throw new Error('Blocked period requires creator and created date.');
  });
}

function validateActivityStatusesForPersistence(store) {
  (store.activityStatuses || []).forEach((status) => {
    if (!status.account_id || !ACCOUNT_TYPES.includes(status.account_type)) throw new Error('Activity status requires an account and account type.');
    if (!ACTIVITY_STATUS_OPTIONS.includes(status.activity_status)) throw new Error('Choose one of the allowed activity status options.');
    if (!status.updated_at) throw new Error('Activity status requires an updated date.');
  });
}

function validateSchedulesForPersistence(store) {
  const allowedCategoryIds = new Set(SCHEDULE_CATEGORIES.map(([id]) => id));
  (store.events || []).filter((event) => Number(event.schedule_schema_version || 0) >= 2).forEach((event) => {
    if (!event.title || !event.category_id || !allowedCategoryIds.has(event.category_id) || !event.venue) throw new Error('Schedule requires title, allowed category, and venue.');
    if (!Number.isInteger(Number(event.expected_attendees)) || Number(event.expected_attendees) < 1) throw new Error('Schedule expected attendees must be at least 1.');
    if (!['basic', 'internal'].includes(event.privacy_level)) throw new Error('Schedule privacy level must be Public or Admin only.');
    if (!event.contact_person || !/^\d{11}$/.test(String(event.contact_info || ''))) throw new Error('Schedule requires contact person and an 11-digit contact number.');
    if (!event.public_description || !event.purpose) throw new Error('Schedule requires public description and purpose.');
    eventOccurrencesForValidation(event).forEach((occurrence) => {
      if (!occurrence.start_time || !occurrence.end_time || new Date(occurrence.end_time) <= new Date(occurrence.start_time)) throw new Error('Schedule end date and time must be later than start date and time.');
    });
  });
}

function eventOccurrencesForValidation(event) {
  return Array.isArray(event.occurrences) && event.occurrences.length ? event.occurrences : [{ start_time: event.start_time, end_time: event.end_time }];
}

function normalizeEvent(event) {
  const occurrences = Array.isArray(event.occurrences) && event.occurrences.length
    ? event.occurrences.map((item) => occurrenceFromRange(item.start_time, item.end_time, item.id))
    : [occurrenceFromRange(event.start_time, event.end_time)];
  occurrences.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
  const firstOccurrence = occurrences[0] || {};
  const lastOccurrence = occurrences[occurrences.length - 1] || {};
  return {
    ...event,
    privacy_level: String(event.private_notes || '').includes(INTERNAL_PRIVACY_MARKER) ? 'internal' : event.privacy_level || 'basic',
    private_notes: String(event.private_notes || '').replace(INTERNAL_PRIVACY_MARKER, '').trim(),
    schedule_type: occurrences.length > 1 ? 'multi_day' : 'single_day',
    occurrences,
    start_time: firstOccurrence.start_time || event.start_time,
    end_time: lastOccurrence.end_time || event.end_time
  };
}

function normalizeBlockedTime(block = {}) {
  const start = block.start_time || '';
  const end = block.end_time || '';
  const sameDay = String(start).slice(0, 10) === String(end).slice(0, 10);
  return {
    ...block,
    block_type: block.block_type || (sameDay ? 'single_day' : 'multi_day'),
    reason: block.reason || '',
    created_by: block.created_by || block.createdBy || 'unknown',
    created_at: block.created_at || block.createdDate || new Date().toISOString(),
    start_time: start,
    end_time: end
  };
}

function normalizeActivityStatus(status = {}) {
  const accountType = normalizeActivityAccountType(status.account_type || status.type || status.key || status.id);
  const activityStatus = normalizeActivityStatusLabel(status.activity_status || status.status_label || status.status);
  if (!accountType && !activityStatus) return null;
  return {
    ...status,
    id: status.id || accountType?.toLowerCase() || createId(),
    account_id: status.account_id || status.updated_by_id || status.user_id || status.key || status.id || 'unknown',
    account_type: accountType || 'CSC',
    activity_status: activityStatus || ACTIVITY_STATUS_OPTIONS[0],
    updated_at: status.updated_at || status.created_at || new Date().toISOString()
  };
}

function normalizeActivityAccountType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'oic' || normalized === 'incampus_offcampus' || normalized.includes('office')) return 'OIC';
  if (normalized === 'csc' || normalized === 'csc_president' || normalized.includes('president')) return 'CSC';
  return ACCOUNT_TYPES.find((type) => type.toLowerCase() === normalized) || '';
}

function normalizeActivityStatusLabel(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ACTIVITY_STATUS_OPTIONS.find((option) => option.toLowerCase() === normalized) || '';
}

function occurrenceFromRange(start_time, end_time, id = createId()) {
  return { id, date: String(start_time || '').slice(0, 10), start_time, end_time };
}
