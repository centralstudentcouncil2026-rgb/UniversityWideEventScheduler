// Feature copy of virtual module: app-data.js
// Keep behavior identical until modular migration is verified.

const EMPTY_COLLECTIONS = [
  'users',
  'organizations',
  'categories',
  'events',
  'activityStatuses',
  'blockedTimes',
  'announcements',
  'concerns',
  'notifications',
  'activityLogs',
  'pendingAccounts'
];
const INTERNAL_PRIVACY_MARKER = '[[privacy:internal]]';
const APPROVAL_STATUSES = ['pending', 'approved', 'rejected'];
const EVENT_STATUSES = ['planned', 'finalized', 'cancelled', 'disabled', 'completed', 'cancellation_requested'];
const PRIVACY_LEVELS = ['basic', 'public', 'internal'];
const RECURRENCE_TYPES = ['daily', 'weekly', 'monthly', 'yearly'];
export const SCHEDULE_CATEGORIES = [
  ['worship', 'Worship', '#2563EB'],
  ['gathering', 'Gathering', '#16A34A'],
  ['outreach', 'Outreach', '#DC2626'],
  ['socialization', 'Socialization', '#D97706'],
  ['meeting', 'Meeting', '#7C3AED'],
  ['others', 'Others', '#64748B']
];
export const ACCOUNT_TYPES = ['CSC', 'OIC', 'org'];
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
  normalized.events = dedupeEvents(normalized.events.map(normalizeEvent));
  normalized.blockedTimes = normalized.blockedTimes.map(normalizeBlockedTime);
  normalized.activityStatuses = normalized.activityStatuses.map(normalizeActivityStatus).filter(Boolean);
  normalized.announcements = normalized.announcements.map(normalizeAnnouncement);
  normalized.notifications = normalized.notifications.map(normalizeNotification);
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
  const email = firstNonBlank(
    safeUser.email,
    safeUser.aup_email,
    safeUser.email_address,
    safeUser.auth_email,
    safeUser.user_email,
    safeUser.raw_user_meta_data?.email
  );
  const contactNumber = firstNonBlank(
    safeUser.contact_number,
    safeUser.phone_number,
    safeUser.mobile_number,
    safeUser.contact,
    safeUser.phone,
    safeUser.telephone,
    safeUser.raw_user_meta_data?.phone_number,
    safeUser.raw_user_meta_data?.contact_number
  );
  return {
    ...safeUser,
    role: safeUser.role || presetConfig.role,
    account_preset: preset,
    account_type: ACCOUNT_TYPES.includes(safeUser.account_type) ? safeUser.account_type : defaultAccountType(preset),
    email,
    aup_email: safeUser.aup_email || email,
    contact_number: contactNumber,
    phone_number: safeUser.phone_number || contactNumber,
    suspended_status: Boolean(safeUser.suspended_status || safeUser.suspension_status),
    suspension_status: Boolean(safeUser.suspension_status || safeUser.suspended_status),
    suspension_date: safeUser.suspension_date || '',
    created_at: safeUser.created_at || new Date().toISOString(),
    updated_at: safeUser.updated_at || safeUser.created_at || new Date().toISOString(),
    permissions: { ...presetConfig.permissions, ...(safeUser.permissions || {}) }
  };
}

function firstNonBlank(...values) {
  const value = values.find((item) => item != null && String(item).trim() !== '');
  return value == null ? '' : String(value).trim();
}

function defaultAccountType(preset) {
  if (preset === 'organization') return 'org';
  return preset === 'head_events' ? 'OIC' : 'CSC';
}

function presetForRole(role) {
  return role === 'super_admin' ? 'manager' : 'organization';
}

function normalizeCategories(categories = []) {
  const defaults = SCHEDULE_CATEGORIES.map(([id, name, color]) => {
    const existing = categories.find((item) => item.id === id || String(item.name || '').toLowerCase() === name.toLowerCase());
    return {
      ...existing,
      id,
      name,
      color: existing?.color || color,
      active: existing?.active !== false
    };
  });
  const defaultNames = new Set(defaults.map((item) => String(item.name).toLowerCase()));
  const additional = categories.filter((item) => item?.id && item?.name && !defaultNames.has(String(item.name).toLowerCase()));
  return [...defaults, ...additional];
}

export function storeForPersistence(store) {
  validateAccountsForPersistence(store);
  validateSchedulesForPersistence(store);
  validateBlockedTimesForPersistence(store);
  validateActivityStatusesForPersistence(store);
  validateAnnouncementsForPersistence(store);
  validateNotificationsForPersistence(store);
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

function validateNotificationsForPersistence(store) {
  (store.notifications || []).forEach((notification) => {
    const hasDuplexShape = notification.id && notification.recipient_type && notification.type;
    const hasLegacyShape = notification.notification_id && notification.user_id && notification.notification_type;
    if (!hasDuplexShape && !hasLegacyShape) throw new Error('Notification requires id, recipient, and type.');
    if (!notification.reference_id && !notification.reference_table) throw new Error('Notification requires a reference.');
    if (!notification.title || !notification.message || !notification.created_at) throw new Error('Notification requires title, message, and created date.');
  });
}

function validateAnnouncementsForPersistence(store) {
  (store.announcements || []).forEach((announcement) => {
    if (!announcement.title || !announcement.content) throw new Error('Announcement requires title and content.');
    if (!['show', 'hidden'].includes(announcement.visibility_status)) throw new Error('Announcement visibility must be show or hidden.');
    if (!announcement.created_by || !announcement.created_at || !announcement.updated_at) throw new Error('Announcement requires creator and timestamps.');
  });
}

function validateBlockedTimesForPersistence(store) {
  (store.blockedTimes || []).forEach((block) => {
    if (block.record_type !== 'blocked_time') throw new Error('Blocked period requires a blocked-time record identifier.');
    if (!block.title || !['single_day', 'whole_day', 'multi_day'].includes(block.block_type)) throw new Error('Blocked period requires a title and block type.');
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
    if (event.record_type !== 'schedule') throw new Error('Schedule requires a schedule record identifier.');
    if (!['admin', 'organization'].includes(event.schedule_source)) throw new Error('Schedule source must be admin or organization.');
    if (typeof event.requires_approval !== 'boolean') throw new Error('Schedule requires an approval identifier.');
    if (event.schedule_source === 'admin' && (event.requires_approval || event.approval_status !== 'approved')) throw new Error('Admin-created schedules must be approved automatically.');
    if (event.schedule_source === 'organization' && !event.requires_approval) throw new Error('Organization schedules must require approval.');
    if (event.schedule_source === 'organization' && !event.revision_of && !APPROVAL_STATUSES.includes(event.approval_status)) throw new Error('Organization schedules require an approval status.');
    if (!event.title || !event.category_id || !allowedCategoryIds.has(event.category_id) || !event.venue) throw new Error('Schedule requires title, allowed category, and venue.');
    if (!Number.isInteger(Number(event.expected_attendees)) || Number(event.expected_attendees) < 1) throw new Error('Schedule expected attendees must be at least 1.');
    if (!PRIVACY_LEVELS.includes(event.privacy_level)) throw new Error('Schedule privacy level must be basic, public, or internal.');
    if (!EVENT_STATUSES.includes(event.event_status || 'planned')) throw new Error('Schedule event status is invalid.');
    if (!event.contact_person || !/^\d{11}$/.test(String(event.contact_info || ''))) throw new Error('Schedule requires contact person and an 11-digit contact number.');
    if (!event.public_description || !event.purpose) throw new Error('Schedule requires public description and purpose.');
    if (!APPROVAL_STATUSES.includes(event.approval_status || 'approved')) throw new Error('Schedule approval status is invalid.');
    if (event.schedule_source !== 'admin' && event.approval_date && !['unread', 'read'].includes(event.notification_status || '')) throw new Error('Reviewed schedules require a notification status.');
    if (String(event.admin_recommendation || '').length > 1000) throw new Error('Admin recommendation is too long.');
    if (event.revision_of && !['pending', 'approved', 'rejected'].includes(event.revision_status || event.approval_status || 'pending')) throw new Error('Schedule revision status is invalid.');
    if (event.revision_of && !event.revision_submitted_at) throw new Error('Schedule revision requires a submitted timestamp.');
    eventOccurrencesForValidation(event).forEach((occurrence) => {
      if (!occurrence.start_time || !occurrence.end_time || new Date(occurrence.end_time) <= new Date(occurrence.start_time)) throw new Error('Schedule end date and time must be later than start date and time.');
    });
  });
}

function eventOccurrencesForValidation(event) {
  return Array.isArray(event.occurrences) && event.occurrences.length ? event.occurrences : [{ start_time: event.start_time, end_time: event.end_time }];
}

function normalizeEvent(event) {
  const occurrenceRows = Array.isArray(event.occurrences) && event.occurrences.length
    ? event.occurrences.map((item) => occurrenceFromRange(item.start_time, item.end_time, item.id))
    : [occurrenceFromRange(event.start_time, event.end_time)];
  const expandedOccurrenceRows = expandRecurringOccurrences(event, occurrenceRows);
  const occurrenceKeys = new Set();
  const occurrences = expandedOccurrenceRows.filter((item) => {
    const key = `${item.date}|${item.start_time}|${item.end_time}`;
    if (occurrenceKeys.has(key)) return false;
    occurrenceKeys.add(key);
    return true;
  });
  occurrences.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
  const firstOccurrence = occurrences[0] || {};
  const lastOccurrence = occurrences[occurrences.length - 1] || {};
  const scheduleSource = normalizeScheduleSource(event);
  const approvalStatus = normalizeApprovalStatus(event.approval_status, scheduleSource);
  const now = new Date().toISOString();
  return {
    ...event,
    record_type: 'schedule',
    schedule_source: scheduleSource,
    created_by_role: scheduleSource,
    requires_approval: scheduleSource !== 'admin',
    approval_status: approvalStatus,
    event_status: normalizeEventStatus(event.event_status),
    privacy_level: normalizePrivacyLevel(event.privacy_level, event.private_notes),
    private_notes: String(event.private_notes || '').replace(INTERNAL_PRIVACY_MARKER, '').trim(),
    schedule_type: normalizedScheduleType(event, occurrences),
    expected_attendees: normalizedExpectedAttendees(event.expected_attendees),
    schedule_schema_version: isCurrentScheduleRecord({ ...event, privacy_level: normalizePrivacyLevel(event.privacy_level, event.private_notes) }) ? 2 : 1,
    occurrences,
    start_time: firstOccurrence.start_time || event.start_time || '',
    end_time: lastOccurrence.end_time || event.end_time || '',
    organization_id: event.organization_id || '',
    organization_name: event.organization_name || event.organizationName || '',
    title: event.title || '',
    venue: event.venue || '',
    created_by: event.created_by || event.createdBy || '',
    created_at: event.created_at || event.createdDate || now,
    updated_at: event.updated_at || event.updatedDate || event.created_at || now,
    admin_recommendation: event.admin_recommendation || '',
    approval_date: scheduleSource === 'admin' ? (event.approval_date || event.created_at || now) : (event.approval_date || ''),
    approved_by: event.approved_by || '',
    reviewed_by: event.reviewed_by || '',
    notification_status: event.notification_status || '',
    notification_read_by: event.notification_read_by && typeof event.notification_read_by === 'object' ? event.notification_read_by : {},
    revision_of: event.revision_of || '',
    original_schedule_id: event.original_schedule_id || event.revision_of || '',
    revision_status: event.revision_status || (event.revision_of ? approvalStatus : ''),
    revision_created_at: event.revision_created_at || '',
    revision_submitted_at: event.revision_submitted_at || '',
    revision_history: Array.isArray(event.revision_history) ? event.revision_history : [],
    request_type: event.request_type || '',
    request_reason: event.request_reason || '',
    requester_id: event.requester_id || ''
  };
}

function normalizedScheduleType(event = {}, occurrences = []) {
  const storedType = String(event.schedule_type || '').trim();
  const repeatType = normalizeRecurrenceType(event.recurrence_type || event.repeat_rule || event.repeat);
  const spansDates = occurrences.some((occurrence) => {
    const startDate = String(occurrence.start_time || occurrence.date || '').slice(0, 10);
    const endDate = String(occurrence.end_time || occurrence.start_time || occurrence.date || '').slice(0, 10);
    return startDate && endDate && startDate !== endDate;
  });
  if (repeatType !== 'none' && !spansDates) return 'single_day';
  if (storedType) return storedType;
  return spansDates ? 'multi_day' : 'single_day';
}

function dedupeEvents(events) {
  const byId = new Map();
  const byScheduleKey = new Map();
  events.forEach((event) => {
    if (!event?.id) return;
    const existing = byId.get(event.id);
    if (!existing || new Date(event.updated_at || event.created_at || 0) >= new Date(existing.updated_at || existing.created_at || 0)) {
      byId.set(event.id, event);
    }
  });
  [...byId.values()].forEach((event) => {
    if (event.record_type !== 'schedule' || event.revision_of || isConferenceRoomScheduleRecord(event)) {
      byScheduleKey.set(`id:${event.id}`, event);
      return;
    }
    const occurrence = Array.isArray(event.occurrences) && event.occurrences.length ? event.occurrences[0] : {};
    const key = [
      String(event.title || '').trim().toLowerCase(),
      String(occurrence.start_time || event.start_time || ''),
      String(occurrence.end_time || event.end_time || '')
    ].join('|');
    if (!key.replace(/\|/g, '')) {
      byScheduleKey.set(`id:${event.id}`, event);
      return;
    }
    const existing = byScheduleKey.get(key);
    if (!existing || scheduleDedupePreference(event) > scheduleDedupePreference(existing)) byScheduleKey.set(key, event);
  });
  return [...byScheduleKey.values()];
}

function scheduleDedupePreference(event = {}) {
  let score = 0;
  if (event.created_by) score += 8;
  if (event.organization_id) score += 4;
  if (event.schedule_source === 'organization' || event.created_by_role === 'organization') score += 2;
  if (event.approval_status === 'approved') score += 1;
  score += Math.min(1, Math.max(0, new Date(event.updated_at || event.created_at || 0).getTime() / 8640000000000000));
  return score;
}

function isConferenceRoomScheduleRecord(event = {}) {
  const scheduleType = String(event.schedule_type || '').trim().toLowerCase();
  const venue = String(event.venue || '').trim().toLowerCase();
  const title = String(event.title || '').trim().toLowerCase();
  const eventType = String(event.event_type || event.booking_type || event.type || '').trim().toLowerCase();
  const category = String(event.category_id || event.category || '').trim().toLowerCase();
  return scheduleType === 'conference_room_booking'
    || venue === 'conference room'
    || title === 'conference room booking'
    || eventType === 'conference room booking'
    || eventType === 'conference_room_booking'
    || category === 'conference_room'
    || category === 'conference room';
}

function isCurrentScheduleRecord(event = {}) {
  return Number(event.schedule_schema_version || 0) >= 2
    && Boolean(event.title && event.category_id && event.venue)
    && Number.isInteger(Number(event.expected_attendees))
    && Number(event.expected_attendees) >= 1
    && PRIVACY_LEVELS.includes(event.privacy_level || 'basic')
    && Boolean(event.contact_person)
    && /^\d{11}$/.test(String(event.contact_info || ''))
    && Boolean(event.public_description && event.purpose);
}

function normalizedExpectedAttendees(value) {
  const attendees = Number.parseInt(String(value ?? '').trim(), 10);
  return Number.isInteger(attendees) && attendees >= 1 ? attendees : 1;
}

function normalizeScheduleSource(event = {}) {
  const source = String(event.schedule_source || event.source || event.created_by_role || event.createdByRole || '').trim().toLowerCase();
  if (source === 'admin' || source === 'super_admin' || source === 'csc') return 'admin';
  if (source === 'organization' || source === 'org' || source === 'organization_manager' || source === 'oic') return 'organization';
  if (event.requires_approval === false) return 'admin';
  return 'organization';
}

function normalizeApprovalStatus(value, scheduleSource) {
  if (scheduleSource === 'admin') return 'approved';
  return APPROVAL_STATUSES.includes(value) ? value : 'pending';
}

function normalizeEventStatus(value) {
  return EVENT_STATUSES.includes(value) ? value : 'planned';
}

function normalizePrivacyLevel(value, privateNotes = '') {
  if (String(privateNotes || '').includes(INTERNAL_PRIVACY_MARKER)) return 'internal';
  return PRIVACY_LEVELS.includes(value) ? value : 'basic';
}

function validateAccountsForPersistence(store) {
  (store.users || []).forEach((user) => {
    if (user.suspended_status && !user.suspension_date) throw new Error('Suspended accounts require a suspension date.');
    if (String(user.contact_number || '').length > 20) throw new Error('Account contact number is too long.');
    if (String(user.email || '').length > 160) throw new Error('Account email is too long.');
  });
}

function normalizeBlockedTime(block = {}) {
  const start = block.start_time || '';
  const end = block.end_time || '';
  const sameDay = String(start).slice(0, 10) === String(end).slice(0, 10);
  return {
    ...block,
    record_type: 'blocked_time',
    block_source: 'admin',
    created_by_role: block.created_by_role || block.createdByRole || 'admin',
    requires_approval: false,
    approval_status: 'approved',
    block_type: block.block_type || (sameDay ? 'single_day' : 'multi_day'),
    reason: block.reason || '',
    created_by: block.created_by || block.createdBy || 'unknown',
    created_at: block.created_at || block.createdDate || new Date().toISOString(),
    updated_at: block.updated_at || block.updatedDate || block.created_at || new Date().toISOString(),
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

function normalizeAnnouncement(announcement = {}) {
  const createdAt = announcement.created_at || announcement.posted_at || new Date().toISOString();
  return {
    ...announcement,
    visibility_status: announcement.visibility_status === 'hidden' ? 'hidden' : 'show',
    created_by: announcement.created_by || announcement.posted_by || 'Unknown',
    created_at: createdAt,
    updated_at: announcement.updated_at || createdAt
  };
}

function normalizeNotification(notification = {}) {
  return {
    ...notification,
    notification_id: notification.notification_id || notification.id || createId(),
    user_id: notification.user_id || '',
    notification_type: notification.notification_type || notification.type || 'general',
    reference_id: notification.reference_id || notification.referenceId || '',
    title: notification.title || 'Notification',
    message: notification.message || '',
    is_read: Boolean(notification.is_read),
    created_at: notification.created_at || new Date().toISOString()
  };
}

function normalizeRecurrenceType(value) {
  const recurrenceType = String(value || '').trim().toLowerCase();
  return RECURRENCE_TYPES.includes(recurrenceType) ? recurrenceType : 'none';
}

function safeDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateInputFromDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function timeInputFromDate(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function localIsoFromParts(date, time) {
  return `${date}T${time || '00:00'}:00`;
}

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function addRecurrenceInterval(date, rule, anchorDay) {
  const next = new Date(date);
  if (rule === 'daily') next.setDate(next.getDate() + 1);
  else if (rule === 'weekly') next.setDate(next.getDate() + 7);
  else if (rule === 'monthly') {
    const monthIndex = next.getMonth() + 1;
    const year = next.getFullYear() + Math.floor(monthIndex / 12);
    const month = monthIndex % 12;
    next.setFullYear(year, month, Math.min(anchorDay, daysInMonth(year, month)));
  } else if (rule === 'yearly') {
    const year = next.getFullYear() + 1;
    next.setFullYear(year, next.getMonth(), Math.min(anchorDay, daysInMonth(year, next.getMonth())));
  }
  return next;
}

function expandRecurringOccurrences(event = {}, occurrenceRows = []) {
  const rule = normalizeRecurrenceType(event.recurrence_type || event.repeat_rule || event.repeat);
  if (rule === 'none' || occurrenceRows.length !== 1) return occurrenceRows;
  const base = occurrenceRows[0];
  const start = safeDate(base.start_time || event.start_time);
  const end = safeDate(base.end_time || event.end_time);
  const untilDate = String(event.recurrence_until || event.repeat_until || '').slice(0, 10);
  const until = untilDate ? safeDate(localIsoFromParts(untilDate, timeInputFromDate(end || start || new Date()))) : null;
  if (!start || !end || end <= start || !until || until < start) return occurrenceRows;
  const rows = [];
  const duration = end.getTime() - start.getTime();
  const anchorDay = start.getDate();
  for (let cursor = new Date(start), index = 0; index < 730 && cursor <= until; index += 1) {
    const occurrenceEnd = new Date(cursor.getTime() + duration);
    rows.push({
      id: index === 0 ? base.id : createId(),
      date: dateInputFromDate(cursor),
      start_time: localIsoFromParts(dateInputFromDate(cursor), timeInputFromDate(cursor)),
      end_time: localIsoFromParts(dateInputFromDate(occurrenceEnd), timeInputFromDate(occurrenceEnd))
    });
    cursor = addRecurrenceInterval(cursor, rule, anchorDay);
  }
  return rows.length ? rows : occurrenceRows;
}

function occurrenceFromRange(start_time, end_time, id = createId()) {
  return { id, date: String(start_time || '').slice(0, 10), start_time, end_time };
}
