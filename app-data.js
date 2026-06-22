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
  normalized.events = normalized.events.map(normalizeEvent);
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
    if (!notification.notification_id || !notification.user_id || !notification.notification_type || !notification.reference_id) throw new Error('Notification requires id, user, type, and reference.');
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
    if (event.schedule_source === 'organization' && !event.revision_of && !['pending', 'approved', 'rejected'].includes(event.approval_status)) throw new Error('Organization schedules require an approval status.');
    if (!event.title || !event.category_id || !allowedCategoryIds.has(event.category_id) || !event.venue) throw new Error('Schedule requires title, allowed category, and venue.');
    if (!Number.isInteger(Number(event.expected_attendees)) || Number(event.expected_attendees) < 1) throw new Error('Schedule expected attendees must be at least 1.');
    if (!['basic', 'internal'].includes(event.privacy_level)) throw new Error('Schedule privacy level must be Public or Admin only.');
    if (!event.contact_person || !/^\d{11}$/.test(String(event.contact_info || ''))) throw new Error('Schedule requires contact person and an 11-digit contact number.');
    if (!event.public_description || !event.purpose) throw new Error('Schedule requires public description and purpose.');
    if (!['pending', 'approved', 'rejected'].includes(event.approval_status || 'approved')) throw new Error('Schedule approval status is invalid.');
    if (event.approval_date && !['unread', 'read'].includes(event.notification_status || '')) throw new Error('Reviewed schedules require a notification status.');
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
  const occurrences = Array.isArray(event.occurrences) && event.occurrences.length
    ? event.occurrences.map((item) => occurrenceFromRange(item.start_time, item.end_time, item.id))
    : [occurrenceFromRange(event.start_time, event.end_time)];
  occurrences.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
  const firstOccurrence = occurrences[0] || {};
  const lastOccurrence = occurrences[occurrences.length - 1] || {};
  return {
    ...event,
    record_type: 'schedule',
    schedule_source: normalizeScheduleSource(event),
    created_by_role: event.created_by_role || event.createdByRole || normalizeScheduleSource(event),
    requires_approval: normalizeScheduleSource(event) !== 'admin',
    privacy_level: String(event.private_notes || '').includes(INTERNAL_PRIVACY_MARKER) ? 'internal' : event.privacy_level || 'basic',
    private_notes: String(event.private_notes || '').replace(INTERNAL_PRIVACY_MARKER, '').trim(),
    schedule_type: occurrences.length > 1 ? 'multi_day' : 'single_day',
    expected_attendees: normalizedExpectedAttendees(event.expected_attendees),
    schedule_schema_version: isCurrentScheduleRecord(event) ? 2 : 1,
    occurrences,
    start_time: firstOccurrence.start_time || event.start_time,
    end_time: lastOccurrence.end_time || event.end_time,
    admin_recommendation: event.admin_recommendation || '',
    approval_date: event.approval_date || '',
    notification_status: event.notification_status || '',
    revision_of: event.revision_of || '',
    original_schedule_id: event.original_schedule_id || event.revision_of || '',
    revision_status: event.revision_status || (event.revision_of ? event.approval_status || 'pending' : ''),
    revision_created_at: event.revision_created_at || '',
    revision_submitted_at: event.revision_submitted_at || '',
    revision_history: Array.isArray(event.revision_history) ? event.revision_history : []
  };
}

function isCurrentScheduleRecord(event = {}) {
  return Number(event.schedule_schema_version || 0) >= 2
    && Boolean(event.title && event.category_id && event.venue)
    && Number.isInteger(Number(event.expected_attendees))
    && Number(event.expected_attendees) >= 1
    && ['basic', 'internal'].includes(event.privacy_level || 'basic')
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
  return event.approval_status === 'approved' && event.approval_date ? 'admin' : 'organization';
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

function occurrenceFromRange(start_time, end_time, id = createId()) {
  return { id, date: String(start_time || '').slice(0, 10), start_time, end_time };
}
