export const PUBLIC_USER = { id: 'public', full_name: 'Public Viewer', role: 'public_viewer', organization_id: null };
export const APPROVAL_STATUSES = ['pending', 'approved', 'rejected'];
export const EVENT_STATUSES = ['planned', 'finalized', 'postponed', 'cancelled', 'disabled', 'completed'];

export function currentUser(store) {
  if (store.currentUserId === 'public') return PUBLIC_USER;
  return store.users.find((user) => user.id === store.currentUserId) || PUBLIC_USER;
}

export function isPublic(store) {
  return currentUser(store).role === 'public_viewer';
}

export function isManager(store) {
  return currentUser(store).role === 'organization_manager';
}

export function isSuperAdmin(store) {
  return currentUser(store).role === 'super_admin';
}

export function canCreateEvents(store) {
  return isManager(store) || isSuperAdmin(store);
}

export function canViewPrivateEvent(store, event) {
  return isSuperAdmin(store) || (isManager(store) && currentUser(store).organization_id === event.organization_id);
}

export function canEditEvent(store, event) {
  if (!event) return canCreateEvents(store);
  return isSuperAdmin(store) || (isManager(store) && currentUser(store).organization_id === event.organization_id);
}

export function isPublicEvent(event) {
  return event.privacy_level !== 'internal' && !['draft', 'cancelled', 'disabled'].includes(event.event_status);
}

export function normalizeVenue(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function overlaps(startA, endA, startB, endB) {
  return new Date(startA) < new Date(endB) && new Date(endA) > new Date(startB);
}

export function eventOccurrences(event) {
  return Array.isArray(event.occurrences) && event.occurrences.length
    ? event.occurrences
    : [{ id: `${event.id || 'event'}-occurrence`, date: String(event.start_time || '').slice(0, 10), start_time: event.start_time, end_time: event.end_time }];
}

export function findBlockingTime(store, start, end, excludeId = '') {
  return store.blockedTimes.find((block) => block.id !== excludeId && overlaps(start, end, block.start_time, block.end_time));
}

export function findVenueConflicts(store, candidate, approvalStatuses = ['pending', 'approved']) {
  return store.events.filter((event) =>
    event.id !== candidate.id
    && approvalStatuses.includes(event.approval_status)
    && !['cancelled', 'disabled', 'completed'].includes(event.event_status)
    && eventOccurrences(candidate).some((candidateOccurrence) =>
      eventOccurrences(event).some((eventOccurrence) =>
        overlaps(candidateOccurrence.start_time, candidateOccurrence.end_time, eventOccurrence.start_time, eventOccurrence.end_time)
      )
    )
  );
}

export function findApprovedVenueConflict(store, candidate) {
  return findVenueConflicts(store, candidate, ['approved'])[0] || null;
}

export function activeAnnouncements(store) {
  const now = new Date();
  const weight = { urgent: 0, important: 1, normal: 2 };
  return store.announcements
    .filter((item) => !item.expires_at || new Date(item.expires_at) >= now)
    .sort((a, b) => (weight[a.priority] ?? 9) - (weight[b.priority] ?? 9) || new Date(b.posted_at) - new Date(a.posted_at));
}

export function categoryById(store, id) {
  return store.categories.find((category) => category.id === id) || { name: 'Uncategorized', color: '#64748B', active: true };
}
