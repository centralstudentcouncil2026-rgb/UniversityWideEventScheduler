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
    permissions: { ...presetConfig.permissions, ...(safeUser.permissions || {}) }
  };
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

function occurrenceFromRange(start_time, end_time, id = createId()) {
  return { id, date: String(start_time || '').slice(0, 10), start_time, end_time };
}
