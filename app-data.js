const EMPTY_COLLECTIONS = [
  'users',
  'organizations',
  'categories',
  'events',
  'blockedTimes',
  'announcements',
  'concerns',
  'activityLogs',
  'accountRequests'
];
const INTERNAL_PRIVACY_MARKER = '[[privacy:internal]]';

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
  normalized.users = normalized.users.map(({ password_hash: _passwordHash, ...user }) => user);
  normalized.events = normalized.events.map(normalizeEvent);
  return normalized;
}

export function storeForPersistence(store) {
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
