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

export function createId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function emptyPublicStore() {
  return Object.fromEntries([
    ['version', 3],
    ...EMPTY_COLLECTIONS.map((name) => [name, []]),
    ['currentUserId', 'public']
  ]);
}

export function normalizeStore(store = {}) {
  const normalized = { ...emptyPublicStore(), ...store };
  normalized.users = normalized.users.map(({ password_hash: _passwordHash, ...user }) => user);
  normalized.events = normalized.events.map(normalizeEvent);
  return normalized;
}

function normalizeEvent(event) {
  const occurrences = event.occurrences?.length
    ? event.occurrences.map((item) => occurrenceFromRange(item.start_time, item.end_time, item.id))
    : [occurrenceFromRange(event.start_time, event.end_time)];
  occurrences.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
  return {
    ...event,
    schedule_type: occurrences.length > 1 ? 'multi_day' : 'single_day',
    occurrences,
    start_time: occurrences[0]?.start_time || event.start_time,
    end_time: occurrences.at(-1)?.end_time || event.end_time
  };
}

function occurrenceFromRange(start_time, end_time, id = createId()) {
  return { id, date: String(start_time || '').slice(0, 10), start_time, end_time };
}
