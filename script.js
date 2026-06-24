import { ACCOUNT_PRESETS, ACCOUNT_TYPES, ACTIVITY_STATUS_OPTIONS, createId } from './app-data.js?v=20260624-calendar-dedupe-v1';
import { authenticate, clearSession, decideAccountRequest, deleteRecord, loadStore, requestAccount, saveStore, updateAccountRequestStatus } from './supabase-storage.js?v=20260624-schedule-delete-v1';
import {
  APPROVAL_STATUSES, EVENT_STATUSES, activeAnnouncements, canApproveEvents, canCreateEvents,
  canDeleteEvent, canEditEvent, canManageAccounts, canManageAnnouncements, canManageBlockedTimes,
  canManageCategories, canUpdateOfficeStatus, canUpdatePresidentStatus, canViewPrivateEvent,
  categoryById, currentUser, findApprovedVenueConflict, eventOccurrences, findBlockingTime,
  findVenueConflicts, isManager, isPublic, isPublicEvent, isSuperAdmin, overlaps
} from './app-rules.js?v=20260622-whole-day-realtime-v1';

const MOBILE_BREAKPOINT = 768;
const MOBILE_VIEWS = new Set(['timeGridWeek', 'timeGridDay', 'dayGridMonth', 'multiMonthYear', 'listWeek']);
const WEEK_SLOT_START_MINUTES = 7 * 60;
const WEEK_SLOT_END_MINUTES = 21 * 60;
const WEEK_SNAP_MINUTES = 15;
const STORE_SYNC_INTERVAL_MS = 3000;
const monthSpanLabels = new Set();
const $ = (id) => document.getElementById(id);
const FILTER_IDS = ['filterOrganization', 'filterVenue', 'filterCategory', 'filterEventType', 'filterDate', 'filterMonth', 'filterApproval', 'filterEventStatus'];
const DEFAULT_ANNOUNCEMENT = {
  title: 'CSC S.Y.N.C. is ready for scheduling',
  content: 'Student organizations may now coordinate university-wide events through CSC S.Y.N.C.'
};
const LEGACY_DEFAULT_ANNOUNCEMENT = {
  title: 'CONNECT is ready for scheduling',
  content: 'Student organizations may now coordinate university-wide events through CONNECT.'
};
const MOBILE_ANNOUNCEMENT_LOGIN_FLAG = 'connect_show_mobile_announcements_after_login';
const USERNAME_PATTERN = /^[a-z0-9_.-]{3,32}$/;
const TEXT_LIMITS = {
  username: 32,
  fullName: 120,
  organizationName: 140,
  organizationType: 80,
  categoryName: 80,
  eventTitle: 160,
  eventType: 80,
  venue: 140,
  contactPerson: 120,
  contactInfo: 160,
  publicDescription: 1000,
  purpose: 1000,
  privateNotes: 1000,
  adminNotes: 1000,
  rejectionReason: 500,
  announcementTitle: 120,
  announcementContent: 1000,
  concernTitle: 120,
  concernDescription: 1200,
  concernResponse: 1000,
  blockTitle: 120,
  blockReason: 500,
  statusLabel: 80,
  search: 120
};
const PORTAL_TOOL_VISIBILITY = {
  eventRequestsButton: canApproveEvents,
  blockedTimesButton: canManageBlockedTimes,
  categoriesButton: canManageCategories,
  usersButton: canManageAccounts,
  activityLogButton: canManageAccounts,
  chooseActivityStatusButton: (store) => canUpdateOfficeStatus(store) || canUpdatePresidentStatus(store),
  updateOfficeStatusButton: canUpdateOfficeStatus,
  updatePresidentStatusButton: canUpdatePresidentStatus
};
const state = {
  store: null,
  calendar: null,
  pendingEvent: null,
  pendingConflictContinuation: null,
  pendingCalendarDate: '',
  selectedDetails: null,
  confirmAction: null,
  weekSelection: null,
  resizeObserver: null,
  resizeTimer: 0,
  storeSyncTimer: 0,
  storeSyncing: false,
  storeSyncChannel: null,
  portalViewMode: 'today',
  filters: { organization: '', venue: '', category: '', eventType: '', date: '', month: '', approval: '', eventStatus: '' },
  selectedPublicDate: '',
  search: ''
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else queueMicrotask(init);

async function init() {
  try {
    const bootstrappedStore = window.CONNECT_BOOTSTRAP_STORE;
    const { store, notice, noticeType } = bootstrappedStore
      ? { store: bootstrappedStore, notice: 'Connected to the authenticated Supabase backend.', noticeType: 'success' }
      : await loadStore();
    if (isPublic(store) && document.body.classList.contains('portal-shell')) {
      window.location.replace('index.html');
      return;
    }
    state.store = store;
    window.CONNECT_STATE = state;
    bindEvents();
    populateStaticOptions();
    renderAll();
    initializeCalendar();
    refreshCalendar();
    scheduleMobileAnnouncementPopup();
    startStoreSync();
    if (notice) showToast(notice, noticeType);
  } catch (error) {
    console.error('CONNECT portal failed to initialize:', error);
    const calendar = $('calendar');
    if (calendar) {
      calendar.innerHTML = '<div class="activity-item"><strong>Calendar failed to load.</strong><p>Please refresh and try again.</p></div>';
    }
  }
}

function bindEvents() {
  bindClickActions({
    prevButton: () => state.calendar.prev(),
    nextButton: () => state.calendar.next(),
    searchToggle: toggleSearch,
    profileButton: () => openDialog('loginModal'),
    loginButton: () => openDialog('loginModal'),
    logoutButton: logout,
    registerButton: () => openDialog('registerModal'),
    mobileMenuButton: openSidebar,
    mobileScrim: closeSidebar,
    createEventButton: () => openEventModal(defaultRange()),
    addOccurrenceButton: () => addOccurrenceRow(),
    applySharedTimesButton: applySharedTimes,
    cancelEventButton: cancelEventFromModal,
    detailsEditButton: editSelectedEvent,
    detailsCancelButton: cancelSelectedEvent,
    detailsDeleteButton: deleteSelectedEvent,
    detailsApproveButton: () => reviewSelectedEvent('approved'),
    detailsRejectButton: () => reviewSelectedEvent('rejected'),
    deleteEventButton: deleteEventFromModal,
    agreementSubmitButton: finishAgreement,
    conflictContinueButton: continueAfterConflict,
    filtersButton: () => openDialog('filtersModal'),
    resetFiltersButton: resetFilters,
    cancelBlockEditButton: resetBlockedTimeForm,
    notificationsButton: openNotifications,
    markNotificationsReadButton: markAllNotificationsRead,
    dashboardButton: openDashboard,
    announcementsButton: openAnnouncements,
    announcementEditButton: editLatestAnnouncement,
    announcementDeleteButton: deleteCurrentAnnouncement,
    announcementHideButton: () => setCurrentAnnouncementVisibility('hidden'),
    announcementShowButton: () => setCurrentAnnouncementVisibility('show'),
    concernsButton: openConcerns,
    eventRequestsButton: openEventRequests,
    blockedTimesButton: openBlockedTimes,
    usersButton: openUsers,
    activityLogButton: openActivityLog,
    chooseActivityStatusButton: chooseActivityStatus,
    updateOfficeStatusButton: () => updateAppStatus('OIC'),
    updatePresidentStatusButton: () => updateAppStatus('CSC'),
    confirmYesButton: confirmPendingAction
  });
  bindSubmitActions({
    loginForm: login,
    registerForm: registerAccount,
    eventForm: submitEventForm,
    eventReviewForm: submitEventReviewForm,
    accountEditForm: submitAccountEditForm,
    activityStatusForm: submitActivityStatusForm,
    announcementForm: addAnnouncement,
    concernForm: addConcern,
    blockedTimeForm: addBlockedTime,
    organizationForm: addOrganization
  });
  bindDelegatedLists(['announcementsList', 'concernsList', 'eventRequestsList', 'blockedTimesList', 'organizationsList', 'usersList', 'notificationsList']);
  FILTER_IDS.forEach((id) => on(id, 'input', updateFilters));
  ['agreeRules', 'agreePrivacy'].forEach((id) => on(id, 'change', updateAgreementButton));
  on('viewSelector', 'pointerdown', (event) => {
    if (event.currentTarget.value === 'today') returnToCurrentWeek();
  });
  on('viewSelector', 'change', (event) => changeView(event.target.value));
  on('headerOrganizationFilter', 'change', (event) => {
    state.filters.organization = event.target.value;
    if ($('filterOrganization')) $('filterOrganization').value = state.filters.organization;
    refreshCalendar();
  });
  on('searchInput', 'input', debounce((event) => { state.search = cleanSingleLine(event.target.value).slice(0, TEXT_LIMITS.search).toLowerCase(); refreshCalendar(); }, 180));
  on('registerRole', 'change', updateRegistrationFields);
  on('eventScheduleType', 'change', updateScheduleType);
  on('eventDate', 'change', syncSingleDayEndDate);
  on('eventContactInfo', 'input', (event) => { event.target.value = event.target.value.replace(/\D/g, '').slice(0, 11); });
  on('announcementTitle', 'input', updateAnnouncementLivePreview);
  on('announcementContent', 'input', updateAnnouncementLivePreview);
  on('occurrenceList', 'click', handleOccurrenceListClick);
  on('blockType', 'change', updateBlockTimeFields);
  on('blockStartDate', 'change', syncSingleDayBlockEndDate);
  const closePublicDialogButton = $('closePublicDayDialog');
  if (closePublicDialogButton) closePublicDialogButton.addEventListener('click', closePublicDayDialog);
  $('calendar').addEventListener('pointerdown', startWeekRectangleSelection, true);
  document.addEventListener('pointermove', updateWeekRectangleSelection);
  document.addEventListener('pointerup', finishWeekRectangleSelection);
  document.addEventListener('pointercancel', cancelWeekRectangleSelection);
  document.addEventListener('click', (event) => {
    if (event.target instanceof HTMLDialogElement && event.target.open) {
      closeDialog(event.target.id);
      return;
    }
    const closer = event.target.closest('[data-close]');
    if (closer) closeDialog(closer.dataset.close);
  });
  document.addEventListener('pointerdown', handlePublicDialogPointerDown);
  document.addEventListener('keydown', handlePublicDialogKeyDown);
  const resizeCalendar = debounce(handleResize, 120);
  window.addEventListener('resize', resizeCalendar, { passive: true });
  window.addEventListener('orientationchange', () => { handleResize(); setTimeout(handleResize, 260); setTimeout(handleResize, 700); }, { passive: true });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', resizeCalendar, { passive: true });
}

function on(id, event, handler, options) {
  const element = $(id);
  if (element) element.addEventListener(event, handler, options);
}

function bindClickActions(actions) {
  Object.entries(actions).forEach(([id, handler]) => on(id, 'click', handler));
}

function bindSubmitActions(actions) {
  Object.entries(actions).forEach(([id, handler]) => on(id, 'submit', handler));
}

function bindDelegatedLists(ids) {
  ids.forEach((id) => on(id, 'click', handleListAction));
}

function cleanSingleLine(value) {
  return String(value || '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
}

function cleanMultiline(value) {
  return String(value || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function textLimitError(value, max, label) {
  return value.length > max ? `${label} must be ${max} characters or fewer.` : '';
}

function firstTextLimitError(items) {
  return items.map(([value, max, label]) => textLimitError(value, max, label)).find(Boolean) || '';
}

function normalizedName(value) {
  return cleanSingleLine(value).toLowerCase();
}

function toggleSearch() {
  $('searchWrap').classList.toggle('open');
  $('searchInput').focus();
}

async function persist(message = '') {
  try {
    await saveStore(state.store);
    renderAll();
    if (state.pendingCalendarDate && state.calendar) {
      state.calendar.gotoDate(state.pendingCalendarDate);
      state.pendingCalendarDate = '';
    }
    refreshCalendar();
    if (message) showToast(message, 'success');
    return true;
  } catch (error) {
    showToast(`Could not sync Supabase: ${error.message}`, 'error');
    return false;
  }
}

function log(action, description, payload = null, previousValues = null) {
  const user = currentUser(state.store);
  state.store.activityLogs.push({
    id: createId(), action, description, payload,
    previous_values: previousValues, new_values: payload,
    performed_by: user.full_name, performed_by_role: user.role,
    performed_by_id: user.id, organization_id: user.organization_id || '',
    created_at: new Date().toISOString()
  });
}

function scheduleAuditSnapshot(event = {}) {
  return {
    title: event.title || '', category_id: event.category_id || '', venue: event.venue || '',
    start_time: event.start_time || '', end_time: event.end_time || '', privacy_level: event.privacy_level || '',
    approval_status: event.approval_status || '', admin_recommendation: event.admin_recommendation || '',
    revision_of: event.revision_of || ''
  };
}

function populateStaticOptions() {
  fillSelect('filterApproval', [['', 'Any approval'], ...APPROVAL_STATUSES.map((value) => [value, cap(value)])]);
  fillSelect('filterEventStatus', [['', 'Any event status'], ...EVENT_STATUSES.map((value) => [value, cap(value)])]);
}

function renderAll() {
  renderRole();
  renderStatuses();
  renderFormOptions();
  renderFilterOptions();
  renderAnnouncementPreview();
  updateNotificationBadge();
}

function renderRole() {
  const user = currentUser(state.store);
  document.body.classList.toggle('is-manager', isManager(state.store));
  document.body.classList.toggle('is-super-admin', isSuperAdmin(state.store));
  document.body.classList.toggle('is-public', isPublic(state.store));
  if ($('profileName')) $('profileName').textContent = user.full_name;
  if ($('profileInitials')) $('profileInitials').textContent = initials(user.full_name);
  if ($('dashboardButton')) $('dashboardButton').textContent = isManager(state.store) ? 'Schedule Status' : 'Dashboard';
  Object.entries(PORTAL_TOOL_VISIBILITY).forEach(([id, allowed]) => setHidden(id, !allowed(state.store)));
  if (state.calendar && isPublic(state.store) && state.calendar.view.type !== 'dayGridMonth') state.calendar.changeView('dayGridMonth');
  if (!isPublic(state.store)) closePublicDayDialog();
}

function renderFormOptions() {
  fillSelect('eventCategory', state.store.categories.filter((item) => item.active).map((item) => [item.id, item.name]));
  fillSelect('activityStatusSelect', ACTIVITY_STATUS_OPTIONS.map((item) => [item, item]));
}

function currentUserNotifications() {
  const user = currentUser(state.store);
  return (state.store.notifications || [])
    .filter((item) => item.user_id === user.id)
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
}

function unreadNotificationCount() {
  return currentUserNotifications().filter((item) => !item.is_read).length;
}

function updateNotificationBadge() {
  const badge = $('notificationBadge');
  if (!badge) return;
  const count = unreadNotificationCount();
  badge.textContent = count;
  badge.hidden = count === 0;
}

function createNotification({ user_id, notification_type, reference_id, title, message }) {
  if (!user_id || !notification_type || !reference_id || !title || !message) return;
  if (!Array.isArray(state.store.notifications)) state.store.notifications = [];
  const existing = state.store.notifications.find((item) =>
    item.user_id === user_id
    && item.notification_type === notification_type
    && item.reference_id === reference_id
    && !item.is_read
  );
  const created_at = new Date().toISOString();
  if (existing) Object.assign(existing, { title, message, created_at, is_read: false });
  else state.store.notifications.push({ notification_id: createId(), user_id, notification_type, reference_id, title, message, is_read: false, created_at });
  updateNotificationBadge();
}

function notifyAdmins(notification) {
  state.store.users
    .filter((user) => user.role === 'super_admin' && user.permissions?.enabled !== false)
    .forEach((user) => createNotification({ ...notification, user_id: user.id }));
}

function notifyScheduleCreator(schedule, title, message) {
  if (!schedule?.created_by || schedule.created_by === currentUser(state.store).id) return;
  createNotification({
    user_id: schedule.created_by,
    notification_type: 'schedule_update',
    reference_id: schedule.id,
    title,
    message
  });
}

function renderFilterOptions() {
  const organizationOptions = [['', 'All organizations'], ...state.store.organizations.map((org) => [org.id, org.organization_name])];
  fillSelect('filterOrganization', organizationOptions, state.filters.organization);
  fillSelect('headerOrganizationFilter', organizationOptions, state.filters.organization);
  fillSelect('filterCategory', [['', 'All categories'], ...state.store.categories.filter((item) => item.active).map((item) => [item.id, item.name])], state.filters.category);
}

function renderStatuses() {
  if ($('cscStatusValue')) $('cscStatusValue').textContent = statusLabel(findStatus('CSC'));
  if ($('oicStatusValue')) $('oicStatusValue').textContent = statusLabel(findStatus('OIC'));
}

function findStatus(accountType) {
  const statuses = Array.isArray(state.store.activityStatuses) ? state.store.activityStatuses : [];
  return statuses
    .filter((item) => item.account_type === accountType)
    .sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0))[0];
}

function statusLabel(status) {
  if (!status) return 'Status not posted';
  return status.activity_status || status.status_label || cap(status.status || '') || 'Status not posted';
}

function initializeCalendar() {
  state.calendar = new FullCalendar.Calendar($('calendar'), {
    initialView: 'dayGridMonth', firstDay: 0, height: '100%', expandRows: true, nowIndicator: true,
    selectable: true, selectMirror: true, selectMinDistance: 3, longPressDelay: 220, selectLongPressDelay: 220,
    eventLongPressDelay: 300, editable: true, eventResizableFromStart: true, slotEventOverlap: true, slotMinTime: '07:00:00',
    slotMaxTime: '21:00:00', slotDuration: '00:30:00', snapDuration: '00:15:00', allDaySlot: false, dayMaxEvents: false, dayMaxEventRows: false, fixedWeekCount: false, showNonCurrentDates: false, headerToolbar: false,
    views: { multiMonthYear: { type: 'multiMonth', duration: { months: 12 }, multiMonthMaxColumns: 3 }, listWeek: { buttonText: 'Agenda' } },
    events: (info, success) => { monthSpanLabels.clear(); success(calendarEvents(isConnectedGridFetch(info), connectedGridViewType(info))); },
    datesSet: (info) => {
      cancelWeekRectangleSelection();
      $('calendarTitle').textContent = info.view.title;
      const selector = $('viewSelector');
      if (selector) selector.value = portalSelectorValue();
      updateAvailability();
    },
    selectAllow: () => state.calendar.view.type !== 'timeGridWeek' && !isPublic(state.store) && window.innerWidth > MOBILE_BREAKPOINT && state.calendar.view.type !== 'multiMonthYear',
    select: (info) => { if (!requirePermission(canCreateEvents(state.store), 'Login as an organization manager or super admin to create requests.')) return; openEventModal(selectionRange(info)); state.calendar.unselect(); },
    dateClick: (info) => {
      if (isPublic(state.store)) return openPublicDayDialog(dateInput(info.date), info.dayEl);
      if (window.innerWidth > MOBILE_BREAKPOINT || state.calendar.view.type === 'multiMonthYear' || !canCreateEvents(state.store)) return;
      openEventModal(mobileTapRange(info));
    },
    eventClick: (info) => handleCalendarEventClick(info),
    eventDidMount: mountCalendarEvent,
    eventAllow: (_dropInfo, event) => state.calendar.view.type !== 'multiMonthYear' && (event.extendedProps.type === 'block' ? canManageBlockedTimes(state.store) : canEditEvent(state.store, event.extendedProps.record)),
    eventDrop: persistMovedCalendarItem, eventResize: persistMovedCalendarItem
  });
  state.calendar.render();
  bindCalendarResizeObserver();
  scheduleCalendarResize(0);
}

function refreshCalendar() {
  state.calendar?.refetchEvents();
  updateAvailability();
  if (state.selectedPublicDate) renderPublicDayDialog();
}

function calendarEvents(monthView = isConnectedCalendarView(), viewType = state.calendar?.view.type) {
  const user = currentUser(state.store);
  const visibleEvents = state.store.events.filter((event) => {
    // Revision requests stay in Schedule Status/Event Requests until approved.
    if (event.revision_of) return false;
    if (isPublic(state.store)) return event.approval_status === 'approved' && isPublicEvent(event);
    if (isSuperAdmin(state.store)) return true;
    if (event.approval_status !== 'approved') return event.created_by === user.id;
    return event.organization_id === user.organization_id || isPublicEvent(event);
  }).filter(matchesFilters);
  const weekLineLayout = state.calendar?.view.type === 'timeGridWeek' ? buildWeekLineLayout(visibleEvents) : new Map();
  const events = visibleEvents.flatMap((event) => {
    const eventColor = organizationColor(state.store, event);
    const accentColor = eventAccentColor(state.store, event);
    return monthView
      ? connectedMonthEvents(event, eventColor, accentColor, viewType)
      : occurrenceCalendarEvents(event, eventColor, accentColor, weekLineLayout);
  });
  const blocks = state.store.blockedTimes.map((block) => {
    const wholeDay = block.block_type === 'whole_day';
    return {
    id: block.id,
    title: block.title || 'Blocked university period',
    start: wholeDay ? dateInput(block.start_time) : block.start_time,
    end: wholeDay ? dateInput(block.end_time) : block.end_time,
    allDay: wholeDay,
    backgroundColor: '#071C3D',
    borderColor: '#F4B400',
    editable: state.calendar?.view.type !== 'multiMonthYear' && canManageBlockedTimes(state.store),
    classNames: ['event-blocked', 'event-super-admin-block'],
    extendedProps: { type: 'block', record: block }
    };
  });
  return [...events, ...blocks];
}

function mountCalendarEvent(info) {
  const accentColor = info.event.extendedProps?.accentColor;
  const eventColor = info.event.extendedProps?.eventColor || info.event.backgroundColor;
  const weekLineLane = info.event.extendedProps?.weekLineLane;
  const weekLineCount = info.event.extendedProps?.weekLineCount;
  if (accentColor) info.el.style.setProperty('--event-accent-color', accentColor);
  if (eventColor) info.el.style.setProperty('--event-fill-color', eventColor);
  if (Number.isFinite(weekLineLane) && Number.isFinite(weekLineCount)) {
    const stemWidth = weekLineStemWidth(weekLineCount);
    const laneStep = stemWidth + weekLineLaneGap(weekLineCount);
    info.el.style.setProperty('--week-line-lane', weekLineLane);
    info.el.style.setProperty('--week-line-count', weekLineCount);
    info.el.style.setProperty('--week-line-stem-width', `${stemWidth}px`);
    info.el.style.setProperty('--week-line-lane-offset', `${weekLineLane * laneStep}px`);
  }
  deduplicateMonthSpanLabel(info);
}

function deduplicateMonthSpanLabel(info) {
  if (!info.el.classList.contains('event-month-span-multi')) return;
  const spanKey = info.event.extendedProps.monthSpanKey || info.event.extendedProps.record?.id || info.event.id;
  if (monthSpanLabels.has(spanKey)) info.el.classList.add('event-month-span-continuation');
  else monthSpanLabels.add(spanKey);
}

function isConnectedGridFetch(info) {
  const viewType = info.view?.type || state.calendar?.view?.type;
  if (viewType === 'dayGridMonth' || viewType === 'multiMonthYear') return true;
  return ((info.end - info.start) / 86400000) > 7;
}

function connectedGridViewType(info) {
  const days = (info.end - info.start) / 86400000;
  if (days > 45) return 'multiMonthYear';
  return info.view?.type || state.calendar?.view?.type;
}

function isConnectedCalendarView() {
  const viewType = state.calendar?.view?.type;
  return viewType === 'dayGridMonth' || viewType === 'multiMonthYear';
}

const ORGANIZATION_COLOR_FALLBACKS = ['#2563EB', '#16A34A', '#DC2626', '#9333EA', '#EA580C', '#0891B2', '#BE185D', '#4F46E5', '#0D9488', '#B45309'];
function organizationColor(store, event) {
  const organization = store.organizations.find((item) => item.id === event.organization_id || item.organization_name === event.organization_name);
  const assignedColor = organization?.color || organization?.organization_color || organization?.assigned_color || organization?.theme_color || organization?.color_hex;
  if (isCssColor(assignedColor)) return assignedColor;
  return ORGANIZATION_COLOR_FALLBACKS[Math.abs(hashText(event.organization_id || event.organization_name || event.title)) % ORGANIZATION_COLOR_FALLBACKS.length];
}
function eventAccentColor(store, event) {
  const category = categoryById(store, event.category_id);
  if (category && isCssColor(category.color)) return category.color;
  return '#FACC15';
}
function isCssColor(value) { return typeof value === 'string' && /^(#(?:[0-9a-f]{3}){1,2}|rgb\(|rgba\(|hsl\(|hsla\()/i.test(value.trim()); }
function hashText(value) { return String(value || '').split('').reduce((hash, char) => ((hash << 5) - hash) + char.charCodeAt(0), 0); }

function startWeekRectangleSelection(event) {
  if (event.button !== 0 || !canStartWeekRectangleSelection(event)) return;
  const point = weekGridPoint(event, false);
  if (!point) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  state.weekSelection = { anchorDate: point.date, anchorMinutes: point.minutes, currentDate: point.date, currentMinutes: point.minutes };
  renderWeekRectangleSelection();
}

function updateWeekRectangleSelection(event) {
  if (!state.weekSelection) return;
  const point = weekGridPoint(event);
  if (!point) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  state.weekSelection.currentDate = point.date;
  state.weekSelection.currentMinutes = point.minutes;
  renderWeekRectangleSelection();
}

function finishWeekRectangleSelection(event) {
  if (!state.weekSelection) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const range = weekRectangleRange(state.weekSelection);
  cancelWeekRectangleSelection();
  openEventModal(range);
}

function cancelWeekRectangleSelection() {
  state.weekSelection = null;
  $('calendar')?.querySelectorAll('.week-selection-preview').forEach((preview) => preview.remove());
}

function canStartWeekRectangleSelection(event) {
  return state.calendar?.view.type === 'timeGridWeek'
    && window.innerWidth > MOBILE_BREAKPOINT
    && canCreateEvents(state.store)
    && !event.target.closest('.fc-event');
}

function weekGridPoint(event, clampOutside = true) {
  const calendar = $('calendar');
  const slots = calendar.querySelector('.fc-timegrid-slots');
  const columns = [...calendar.querySelectorAll('.fc-timegrid-col[data-date]')];
  if (!slots || !columns.length) return null;
  const column = columns.find((item) => {
    const rect = item.getBoundingClientRect();
    return event.clientX >= rect.left && event.clientX <= rect.right;
  });
  if (!column) return null;
  const rect = slots.getBoundingClientRect();
  if (!clampOutside && (event.clientY < rect.top || event.clientY > rect.bottom)) return null;
  const ratio = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
  return { date: column.dataset.date, minutes: snapWeekMinutes(WEEK_SLOT_START_MINUTES + ratio * (WEEK_SLOT_END_MINUTES - WEEK_SLOT_START_MINUTES)) };
}

function renderWeekRectangleSelection() {
  const calendar = $('calendar');
  calendar.querySelectorAll('.week-selection-preview').forEach((preview) => preview.remove());
  if (!state.weekSelection) return;
  const range = weekRectangleRange(state.weekSelection);
  const duration = WEEK_SLOT_END_MINUTES - WEEK_SLOT_START_MINUTES;
  const top = (range.startMinutes - WEEK_SLOT_START_MINUTES) / duration * 100;
  const height = (range.endMinutes - range.startMinutes) / duration * 100;
  range.dates.forEach((date, index) => {
    const column = calendar.querySelector(`.fc-timegrid-col[data-date="${date}"]`);
    if (!column) return;
    const preview = document.createElement('div');
    preview.className = 'week-selection-preview';
    preview.style.top = `${top}%`;
    preview.style.height = `${height}%`;
    if (index === 0) preview.textContent = `${formatMinutes(range.startMinutes)} - ${formatMinutes(range.endMinutes)}`;
    column.appendChild(preview);
  });
}

function weekRectangleRange(selection) {
  const [startDate, endDate] = [selection.anchorDate, selection.currentDate].sort();
  const [earlierMinutes, hoveredEndMinutes] = [selection.anchorMinutes, selection.currentMinutes].sort((a, b) => a - b);
  const startMinutes = Math.min(earlierMinutes, WEEK_SLOT_END_MINUTES - WEEK_SNAP_MINUTES);
  const endMinutes = Math.min(WEEK_SLOT_END_MINUTES, Math.max(startMinutes + WEEK_SNAP_MINUTES, hoveredEndMinutes));
  const dates = dateRange(startDate, endDate);
  return { dates, startMinutes, endMinutes, occurrences: occurrenceRange(dates, minutesTime(startMinutes), minutesTime(endMinutes)) };
}

function snapWeekMinutes(value) { return Math.max(WEEK_SLOT_START_MINUTES, Math.min(WEEK_SLOT_END_MINUTES, Math.round(value / WEEK_SNAP_MINUTES) * WEEK_SNAP_MINUTES)); }
function minutesTime(value) { return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`; }
function formatMinutes(value) { return formatInputTime(minutesTime(value)); }

function occurrenceCalendarEvents(event, eventColor, accentColor, weekLineLayout = new Map()) {
  const occurrences = eventOccurrences(event);
  const weekParts = state.calendar?.view.type === 'timeGridWeek' ? weekSpanParts(occurrences) : new Map();
  return occurrences.map((occurrence, index) => {
    const weekPart = weekParts.get(occurrence.id);
    const weekLine = weekLineLayout.get(weekLineKey(event, occurrence));
    return {
      id: `${event.id}::${occurrence.id}`,
      title: `${event.title} - ${event.organization_name}${occurrences.length > 1 && !weekPart ? ` (${index + 1}/${occurrences.length})` : ''}`,
      start: occurrence.start_time,
      end: occurrence.end_time,
      backgroundColor: eventColor,
      borderColor: eventColor,
      editable: state.calendar?.view.type !== 'multiMonthYear' && canEditEvent(state.store, event),
      classNames: weekPart
        ? ['event-week-span', 'event-week-span-multi', `event-week-span-${weekPart.position}`, weekPart.customLength ? 'event-week-span-custom' : null, weekLineDensityClass(weekLine?.count || 1)].filter(Boolean)
        : [],
      extendedProps: {
        type: 'event',
        record: event,
        occurrence,
        accentColor,
        eventColor,
        weekLineLane: weekLine?.lane || 0,
        weekLineCount: weekLine?.count || 1
      }
    };
  });
}

function connectedMonthEvents(event, eventColor, accentColor, viewType = state.calendar?.view.type) {
  return groupConsecutiveOccurrences(eventOccurrences(event)).map((group, index) => ({
    id: `${event.id}::month-span-${index}`,
    title: `${event.title} - ${event.organization_name}`,
    start: group[0].date,
    end: nextDateInput(group.at(-1).date),
    allDay: true,
    backgroundColor: eventColor,
    borderColor: eventColor,
    editable: false,
    classNames: ['event-month-span', viewType === 'multiMonthYear' ? 'event-year-span' : null, group.length > 1 ? 'event-month-span-multi' : 'event-month-span-single'].filter(Boolean),
    extendedProps: { type: 'event', record: event, occurrences: group, monthSpanKey: `${event.id}::month-span-${index}`, accentColor }
  }));
}

function groupConsecutiveOccurrences(occurrences) {
  return [...occurrences].sort((a, b) => a.date.localeCompare(b.date)).reduce((groups, occurrence) => {
    const current = groups.at(-1);
    if (!current || nextDateInput(current.at(-1).date) !== occurrence.date) groups.push([occurrence]);
    else current.push(occurrence);
    return groups;
  }, []);
}

function weekSpanParts(occurrences) {
  const parts = new Map();
  groupConsecutiveOccurrences(occurrences).forEach((group) => {
    if (group.length < 2) return;
    group.forEach((occurrence, index) => {
      const sharedTimes = group.every((item) => timeInput(item.start_time) === timeInput(occurrence.start_time) && timeInput(item.end_time) === timeInput(occurrence.end_time));
      parts.set(occurrence.id, {
        position: index === 0 ? 'start' : index === group.length - 1 ? 'end' : 'middle',
        customLength: !sharedTimes
      });
    });
  });
  return parts;
}

function buildWeekLineLayout(events) {
  const entries = [];
  events.forEach((event) => {
    const occurrences = eventOccurrences(event);
    const parts = weekSpanParts(occurrences);
    groupConsecutiveOccurrences(occurrences).forEach((group, groupIndex) => {
      if (group.length < 2) return;
      group.forEach((occurrence) => {
        if (!parts.has(occurrence.id)) return;
        entries.push({
          key: weekLineKey(event, occurrence),
          spanKey: `${event.id}::week-span-${groupIndex}`,
          date: occurrence.date,
          start: new Date(occurrence.start_time).getTime(),
          end: new Date(occurrence.end_time).getTime()
        });
      });
    });
  });

  const clusters = overlappingWeekLineClusters(entries);
  const layout = new Map();

  clusters.forEach((cluster) => {
    const spanLanes = new Map();
    const lanes = [];
    cluster.sort((a, b) => a.start - b.start || a.end - b.end).forEach((entry) => {
      if (spanLanes.has(entry.spanKey)) {
        const lane = spanLanes.get(entry.spanKey);
        lanes[lane] = Math.max(lanes[lane] || 0, entry.end);
        entry.lane = lane;
        return;
      }

      let lane = lanes.findIndex((laneEnd) => laneEnd <= entry.start);
      if (lane < 0) {
        lane = lanes.length;
        lanes.push(entry.end);
      } else {
        lanes[lane] = entry.end;
      }
      spanLanes.set(entry.spanKey, lane);
      entry.lane = lane;
    });
    const count = lanes.length;
    cluster.forEach((entry) => layout.set(entry.key, { lane: entry.lane, count }));
  });

  return layout;
}

function overlappingWeekLineClusters(entries) {
  const sorted = [...entries].sort((a, b) => a.start - b.start || a.end - b.end);
  const clusters = [];
  sorted.forEach((entry) => {
    const current = clusters.at(-1);
    if (!current || entry.start >= current.maxEnd) {
      clusters.push({ maxEnd: entry.end, entries: [entry] });
      return;
    }
    current.maxEnd = Math.max(current.maxEnd, entry.end);
    current.entries.push(entry);
  });
  return clusters.map((cluster) => cluster.entries);
}

function weekLineKey(event, occurrence) {
  return `${event.id}::${occurrence.id}`;
}

function weekLineDensityClass(count) {
  if (count >= 8) return 'event-week-density-max';
  if (count >= 5) return 'event-week-density-high';
  if (count >= 3) return 'event-week-density-medium';
  return 'event-week-density-normal';
}

function weekLineStemWidth(count) {
  if (count >= 8) return 2;
  if (count >= 5) return 3;
  if (count >= 3) return 4;
  return 6;
}

function weekLineLaneGap(count) {
  if (count >= 8) return 2;
  if (count >= 5) return 3;
  return 4;
}

function matchesFilters(event) {
  const values = [event.title, event.organization_name, event.venue, event.event_type, event.public_description].map((value) => String(value || '').toLowerCase());
  if (state.search && !values.some((value) => value.includes(state.search))) return false;
  if (state.filters.organization && event.organization_id !== state.filters.organization) return false;
  if (state.filters.venue && !event.venue.toLowerCase().includes(state.filters.venue.toLowerCase())) return false;
  if (state.filters.category && event.category_id !== state.filters.category) return false;
  if (state.filters.eventType && !event.event_type.toLowerCase().includes(state.filters.eventType.toLowerCase())) return false;
  if (state.filters.date && !eventOccurrences(event).some((item) => item.date === state.filters.date)) return false;
  if (state.filters.month && !eventOccurrences(event).some((item) => item.start_time.slice(0, 7) === state.filters.month)) return false;
  if (state.filters.approval && event.approval_status !== state.filters.approval) return false;
  if (state.filters.eventStatus && event.event_status !== state.filters.eventStatus) return false;
  return true;
}

function openEventModal(range, record = null) {
  if (!requirePermission(canEditEvent(state.store, record), 'You cannot edit this event.')) return;
  renderFormOptions();
  $('eventForm').reset(); $('eventId').value = record?.id || ''; $('eventModalTitle').textContent = record ? 'Edit Schedule' : 'Create Schedule';
  $('eventCategory').value = record?.category_id || state.store.categories.find((item) => item.active)?.id || '';
  $('eventTitle').value = record?.title || ''; $('eventVenue').value = record?.venue || '';
  const occurrences = record ? eventOccurrences(record) : range.occurrences || [{ id: createId(), start_time: range.start.toISOString(), end_time: range.end.toISOString() }];
  $('eventScheduleType').value = record?.schedule_type || (occurrences.length > 1 ? 'multi_day' : 'single_day');
  $('eventDate').value = dateInput(occurrences[0].start_time);
  $('eventStart').value = timeInput(occurrences[0].start_time);
  $('eventEndDate').value = dateInput(occurrences.at(-1).end_time);
  $('eventEnd').value = timeInput(occurrences.at(-1).end_time);
  updateScheduleType();
  $('eventAttendees').value = record?.expected_attendees || '';
  $('eventPrivacy').value = record?.privacy_level || 'basic';
  $('eventContactPerson').value = record?.contact_person || '';
  $('eventContactInfo').value = record?.contact_info || '';
  $('eventPublicDescription').value = record?.public_description || ''; $('eventPurpose').value = record?.purpose || '';
  $('deleteEventButton').hidden = !canDeleteEvent(state.store, record); $('cancelEventButton').hidden = !record || record.event_status === 'cancelled';
  openDialog('eventModal');
}

function readEventForm() {
  const existing = state.store.events.find((event) => event.id === $('eventId').value);
  const user = currentUser(state.store);
  const scheduleSource = existing?.schedule_source || (isSuperAdmin(state.store) ? 'admin' : 'organization');
  const requiresApproval = scheduleSource !== 'admin';
  const org = resolveScheduleOrganization(existing, user);
  const category = state.store.categories.find((item) => item.id === $('eventCategory').value);
  const schedule_type = $('eventScheduleType').value;
  const endDate = schedule_type === 'multi_day' ? $('eventEndDate').value : $('eventDate').value;
  const occurrences = [{ id: existing?.occurrences?.[0]?.id || createId(), date: $('eventDate').value, start_time: localIso($('eventDate').value, $('eventStart').value), end_time: localIso(endDate, $('eventEnd').value) }];
  return syncEventRange({
    ...existing, id: existing?.id || createId(), record_type: 'schedule', schedule_source: scheduleSource, created_by_role: scheduleSource, requires_approval: requiresApproval, title: cleanSingleLine($('eventTitle').value), event_type: category?.name || 'Schedule',
    organization_id: org?.id || '', organization_name: org?.organization_name || '', category_id: $('eventCategory').value,
    venue: cleanSingleLine($('eventVenue').value), schedule_type, occurrences,
    expected_attendees: Number($('eventAttendees').value), public_description: cleanMultiline($('eventPublicDescription').value), purpose: cleanMultiline($('eventPurpose').value),
    contact_person: cleanSingleLine($('eventContactPerson').value), contact_info: cleanSingleLine($('eventContactInfo').value), private_notes: existing?.private_notes || '',
    admin_notes: existing?.admin_notes || '', rejection_reason: resubmitsRejectedSchedule(existing) ? '' : existing?.rejection_reason || '', admin_recommendation: resubmitsRejectedSchedule(existing) ? '' : existing?.admin_recommendation || '',
    approval_date: resubmitsRejectedSchedule(existing) ? '' : existing?.approval_date || '', approved_by: existing?.approved_by || '', reviewed_by: existing?.reviewed_by || '', notification_status: existing?.notification_status || '',
    revision_of: existing?.revision_of || '', original_schedule_id: existing?.original_schedule_id || '', revision_status: existing?.revision_status || '',
    revision_created_at: existing?.revision_created_at || '', revision_submitted_at: existing?.revision_submitted_at || '', revision_history: existing?.revision_history || [],
    event_status: existing?.event_status || 'planned', privacy_level: $('eventPrivacy').value, approval_status: approvalStatusForSave(existing), created_by: existing?.created_by || currentUser(state.store).id,
    schedule_schema_version: 2, created_at: existing?.created_at || new Date().toISOString(), updated_at: new Date().toISOString(), conflict_event_ids: []
  });
}

function resolveScheduleOrganization(existing, user) {
  if (isManager(state.store)) return resolveUserOrganization(user);
  const targetId = existing?.organization_id || state.filters.organization || user.organization_id;
  const selected = findOrganization({ id: targetId, name: existing?.organization_name || userOrganizationName(user) });
  if (selected) return selected;
  return resolveAdminOrganization(user)
    || state.store.organizations[0]
    || null;
}

function resolveUserOrganization(user) {
  const organizationName = userOrganizationName(user) || accountRequestOrganizationName(user);
  if (!organizationName) return null;
  const assignedId = user.organization_id || organizationIdentifier(organizationName);
  let organization = findOrganization({ id: assignedId });
  if (!organization) {
    const matchingName = findOrganization({ name: organizationName });
    if (matchingName) {
      matchingName.id = assignedId;
      matchingName.organization_name = organizationName;
      matchingName.updated_at = new Date().toISOString();
      organization = matchingName;
    }
  }
  if (organization) {
    user.organization_id = assignedId;
    user.organization_name = organization.organization_name || organizationName;
    user.organizationName = user.organization_name;
    return organization;
  }
  organization = {
    id: assignedId,
    organization_name: organizationName,
    organization_type: user.organization_type || user.requested_role || 'Organization',
    created_at: user.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  user.organization_id = organization.id;
  state.store.organizations.push(organization);
  return organization;
}

function organizationIdentifier(name) {
  return String(name || 'organization')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'organization';
}

function accountRequestOrganizationName(user) {
  const email = normalizedName(accountEmail(user));
  const username = normalizedName(user.username);
  const request = (state.store.accountRequests || []).find((item) =>
    (username && normalizedName(item.username) === username)
    || (email && normalizedName(accountRequestEmail(item)) === email)
    || (user.id && item.user_id === user.id)
  );
  return firstAccountValue(request?.organization_name, request?.organizationName, request?.organization);
}

function resolveAdminOrganization(user) {
  if (!isSuperAdmin(state.store)) return null;
  const existing = findOrganization({ id: user.organization_id, name: userOrganizationName(user) || 'Central Student Council' });
  if (existing) return existing;
  const organization = {
    id: user.organization_id || 'central-student-council',
    organization_name: userOrganizationName(user) || 'Central Student Council',
    organization_type: 'CSC',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  state.store.organizations.push(organization);
  return organization;
}

function findOrganization({ id = '', name = '' } = {}) {
  const normalized = normalizedName(name);
  return state.store.organizations.find((org) =>
    (id && org.id === id)
    || (normalized && normalizedName(org.organization_name || org.name) === normalized)
  );
}

function userOrganizationName(user) {
  return firstAccountValue(
    user.organization_name,
    user.organizationName,
    user.organization,
    user.org_name,
    user.orgName,
    user.raw_user_meta_data?.organization_name,
    user.raw_user_meta_data?.organizationName
  );
}

function resubmitsRejectedSchedule(existing) {
  return Boolean(existing && isManager(state.store) && existing.approval_status === 'rejected');
}

function approvalStatusForSave(existing) {
  if (isSuperAdmin(state.store)) return 'approved';
  if (resubmitsRejectedSchedule(existing)) return 'pending';
  return existing?.approval_status || 'pending';
}

function syncEventRange(event) {
  const occurrences = [...event.occurrences].sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
  return { ...event, occurrences, start_time: occurrences[0]?.start_time || '', end_time: occurrences.at(-1)?.end_time || '' };
}

function renderOccurrenceRows(occurrences) {
  $('occurrenceList').innerHTML = '';
  occurrences.forEach((item) => addOccurrenceRow({ id: item.id, date: item.date || dateInput(item.start_time), start: timeInput(item.start_time), end: timeInput(item.end_time) }));
  ensureOccurrenceRows();
}

function addOccurrenceRow(item = {}) {
  const row = document.createElement('div');
  row.className = 'occurrence-row';
  row.dataset.id = item.id || createId();
  row.innerHTML = `<label>Date<input type="date" data-occurrence-date value="${escapeHtml(item.date || '')}" required></label><div class="occurrence-summary"><span data-occurrence-summary></span><button type="button" class="text-button" data-edit-occurrence-times>Edit times</button></div><div class="occurrence-exception-fields" hidden><label>Custom Start<input type="time" data-occurrence-start value="${escapeHtml(item.start || $('eventSharedStart').value || '')}" required></label><label>Custom End<input type="time" data-occurrence-end value="${escapeHtml(item.end || $('eventSharedEnd').value || '')}" required></label><button type="button" class="text-button" data-done-occurrence-times>Done</button></div><button type="button" class="icon-button occurrence-remove" data-remove-occurrence title="Remove day">&times;</button>`;
  $('occurrenceList').appendChild(row);
  updateOccurrenceRow(row);
  ensureOccurrenceRows();
}

function ensureOccurrenceRows() {
  if (!$('occurrenceList').children.length) addOccurrenceRow({ date: $('eventDate').value, start: $('eventStart').value, end: $('eventEnd').value });
  const removable = $('occurrenceList').children.length > 1;
  $('occurrenceList').querySelectorAll('[data-remove-occurrence]').forEach((button) => { button.hidden = !removable; });
  $('occurrenceList').querySelectorAll('.occurrence-row').forEach(updateOccurrenceRow);
}

function handleOccurrenceListClick(event) {
  const row = event.target.closest('.occurrence-row');
  if (!row) return;
  if (event.target.matches('[data-remove-occurrence]')) { row.remove(); ensureOccurrenceRows(); return; }
  if (event.target.matches('[data-edit-occurrence-times]')) { row.classList.add('editing-times'); row.querySelector('.occurrence-exception-fields').hidden = false; row.querySelector('[data-occurrence-start]').focus(); }
  if (event.target.matches('[data-done-occurrence-times]')) { row.classList.remove('editing-times'); row.querySelector('.occurrence-exception-fields').hidden = true; updateOccurrenceRow(row); }
}

function updateOccurrenceRow(row) {
  const start = row.querySelector('[data-occurrence-start]').value;
  const end = row.querySelector('[data-occurrence-end]').value;
  const shared = start === $('eventSharedStart').value && end === $('eventSharedEnd').value;
  row.querySelector('[data-occurrence-summary]').textContent = `${formatInputTime(start)} to ${formatInputTime(end)}${shared ? ' · Shared schedule' : ' · Custom times'}`;
  row.classList.toggle('has-exception', !shared);
}

function readOccurrenceRows() {
  return [...$('occurrenceList').querySelectorAll('.occurrence-row')].map((row) => {
    const date = row.querySelector('[data-occurrence-date]').value;
    return { id: row.dataset.id || createId(), date, start_time: localIso(date, row.querySelector('[data-occurrence-start]').value), end_time: localIso(date, row.querySelector('[data-occurrence-end]').value) };
  });
}

function applySharedTimes() {
  const start = $('eventSharedStart').value;
  const end = $('eventSharedEnd').value;
  if (!start || !end) return showToast('Choose shared start and end times first.', 'error');
  $('occurrenceList').querySelectorAll('.occurrence-row').forEach((row) => {
    row.querySelector('[data-occurrence-start]').value = start;
    row.querySelector('[data-occurrence-end]').value = end;
    row.classList.remove('editing-times');
    row.querySelector('.occurrence-exception-fields').hidden = true;
    updateOccurrenceRow(row);
  });
}

function updateScheduleType() {
  const multiDay = $('eventScheduleType').value === 'multi_day';
  $('scheduleFields')?.classList.toggle('is-multi-day', multiDay);
  const endDateLabel = $('eventEndDateLabel');
  if (endDateLabel) endDateLabel.hidden = !multiDay;
  if ($('eventDateLabelText')) $('eventDateLabelText').textContent = multiDay ? 'Start Date' : 'Date';
  $('eventEndDate').required = multiDay;
  if (!multiDay) syncSingleDayEndDate();
  $('eventEndDate').readOnly = !multiDay;
}

function syncSingleDayEndDate() {
  if ($('eventScheduleType').value === 'single_day') $('eventEndDate').value = $('eventDate').value;
}

function findEventBlock(event) {
  return eventOccurrences(event).map((item) => findBlockingTime(state.store, item.start_time, item.end_time)).find(Boolean);
}

function scheduleSummary(event) {
  return eventOccurrences(event).map((item) => `${formatDateTime(item.start_time)} to ${formatTime(item.end_time)}`).join('\n');
}

function submitEventForm(event) {
  event.preventDefault();
  const candidate = readEventForm();
  const error = validateEvent(candidate);
  if (error) return showToast(error, 'error');
  const block = findEventBlock(candidate);
  if (block) return showConflict('Blocked Date or Time', `This period has been blocked by the admin. Please choose another date or time.${block.reason ? ` Reason: ${block.reason}` : ''}`, [block], false);
  const conflicts = findVenueConflicts(state.store, candidate);
  candidate.conflict_event_ids = conflicts.map((item) => item.id);
  state.pendingEvent = candidate;
  if (conflicts.length) log('event_conflict_warning', `"${candidate.title}" has schedule conflicts.`, { event_id: candidate.id, conflict_ids: candidate.conflict_event_ids });
  openAgreementOrPersist(candidate);
}

function validateEvent(event) {
  if (!event.title) return 'Complete event title.';
  if (!event.category_id) return 'Choose a schedule category.';
  if (!event.venue) return 'Complete the venue.';
  if (!event.organization_id || !event.organization_name) return 'This account is not assigned to an organization. Please approve or assign the organization in Accounts first.';
  const textError = firstTextLimitError([
    [event.title, TEXT_LIMITS.eventTitle, 'Event title'],
    [event.venue, TEXT_LIMITS.venue, 'Venue'],
    [event.public_description, TEXT_LIMITS.publicDescription, 'Public description'],
    [event.purpose, TEXT_LIMITS.purpose, 'Purpose'],
    [event.contact_person, TEXT_LIMITS.contactPerson, 'Contact person'],
    [event.contact_info, TEXT_LIMITS.contactInfo, 'Contact number']
  ]);
  if (textError) return textError;
  if (!event.occurrences.length) return 'Add at least one event day.';
  if (event.occurrences.some((item) => !item.date || !/^\d{4}-\d{2}-\d{2}$/.test(item.date))) return 'Start date is required.';
  if (event.occurrences.some((item) => !item.start_time || !item.end_time || new Date(item.start_time) >= new Date(item.end_time))) return 'End date and time must be later than the start date and time.';
  if (!Number.isInteger(event.expected_attendees) || event.expected_attendees < 1 || event.expected_attendees > 99999) return 'Expected attendees must be between 1 and 99999.';
  if (!event.public_description || !event.purpose || !event.contact_person || !event.contact_info) return 'Complete description, purpose, and contact details.';
  if (!/^\d{11}$/.test(event.contact_info)) return 'Contact number must contain exactly 11 digits.';
  if (isManager(state.store) && event.organization_id !== currentUser(state.store).organization_id) return 'Organization managers can only manage their assigned organization.';
  return '';
}

function openAgreementOrPersist(candidate) {
  if (isSuperAdmin(state.store)) return saveEvent(candidate);
  state.pendingEvent = candidate; $('agreeRules').checked = false; $('agreePrivacy').checked = false; updateAgreementButton(); openDialog('agreementModal');
}

function updateAgreementButton() { $('agreementSubmitButton').disabled = !$('agreeRules').checked || !$('agreePrivacy').checked; $('agreementWarning').hidden = !$('agreementSubmitButton').disabled; }
function finishAgreement() { if (!$('agreementSubmitButton').disabled && state.pendingEvent) { closeDialog('agreementModal'); void saveEvent(state.pendingEvent); } }

async function saveEvent(candidate) {
  if (!requirePermission(canEditEvent(state.store, candidate), 'You cannot save this event.')) return;
  const existingIndex = state.store.events.findIndex((event) => event.id === candidate.id);
  const existing = existingIndex >= 0 ? state.store.events[existingIndex] : null;
  if (existing && isManager(state.store) && existing.approval_status === 'approved' && !existing.revision_of) {
    const revision = createScheduleRevision(existing, candidate);
    state.store.events.push(revision);
    notifyAdmins({
      notification_type: 'schedule_revision',
      reference_id: revision.id,
      title: 'Schedule Revision Submitted',
      message: `${revision.organization_name || 'An organization'} submitted a revision for "${existing.title}".`
    });
    log('schedule_revision_submitted', `${currentUser(state.store).full_name} submitted a revision for "${existing.title}".`, revision);
    state.pendingCalendarDate = revision.occurrences[0]?.date || dateInput(revision.start_time);
    const saved = await persist('Schedule revision submitted for approval.');
    if (saved) {
      closeDialog('eventModal');
      state.pendingEvent = null;
    } else {
      await reloadStore().catch(() => {});
    }
    return;
  }
  const previousValues = existing ? scheduleAuditSnapshot(existing) : null;
  if (existingIndex >= 0) {
    state.store.events = [...state.store.events.filter((event) => event.id !== candidate.id), candidate];
  } else {
    state.store.events.push(candidate);
  }
  if (existing && isSuperAdmin(state.store) && isOrganizationSchedule(existing) && existing.created_by !== currentUser(state.store).id) {
    const nextValues = scheduleAuditSnapshot(candidate);
    const changedFields = Object.keys(nextValues)
      .filter((key) => previousValues[key] !== nextValues[key] && !['approval_status', 'admin_recommendation', 'revision_of'].includes(key))
      .map((key) => key.replace(/_/g, ' '));
    notifyScheduleCreator(candidate, 'Schedule Updated by Admin', `Admin updated your schedule "${candidate.title}".${changedFields.length ? ` Changed: ${changedFields.join(', ')}.` : ''}`);
  }
  if (candidate.approval_status === 'pending' && (existingIndex < 0 || existing?.approval_status === 'rejected')) {
    notifyAdmins({
      notification_type: 'schedule_approval',
      reference_id: candidate.id,
      title: 'New Schedule Request',
      message: `${candidate.organization_name || 'An organization'} submitted "${candidate.title}" for approval.`
    });
  }
  log(existingIndex >= 0 ? 'event_updated' : 'event_posted', `${currentUser(state.store).full_name} saved "${candidate.title}".`, scheduleAuditSnapshot(candidate), previousValues);
  state.pendingCalendarDate = candidate.occurrences[0]?.date || dateInput(candidate.start_time);
  const saved = await persist(isManager(state.store) && candidate.approval_status === 'pending' ? 'Schedule submitted for admin approval.' : 'Schedule saved.');
  if (saved) {
    closeDialog('eventModal');
    state.pendingEvent = null;
  } else {
    await reloadStore().catch(() => {});
  }
}

function createScheduleRevision(original, candidate) {
  const now = new Date().toISOString();
  const revisionId = createId();
  return {
    ...candidate,
    id: revisionId,
    record_type: 'schedule',
    schedule_source: 'organization',
    created_by_role: 'organization',
    requires_approval: true,
    revision_of: original.id,
    original_schedule_id: original.id,
    revision_status: 'pending',
    revision_created_at: now,
    revision_submitted_at: now,
    revision_history: [...(original.revision_history || []), { revision_id: revisionId, submitted_at: now, submitted_by: currentUser(state.store).id, status: 'pending' }],
    approval_status: 'pending',
    approval_date: '',
    notification_status: '',
    created_by: currentUser(state.store).id,
    created_at: now,
    updated_at: now
  };
}

function openDetails(props) {
  state.selectedDetails = props; const record = props.record;
  if (isBlockDetail(props)) {
    $('detailsTitle').textContent = record.title || 'Blocked university period'; $('detailsMeta').textContent = 'Blocked university period';
    $('detailsList').innerHTML = rows({ Date: formatDateTime(record.start_time), End: formatTime(record.end_time), Reason: record.reason || 'No reason provided.' });
    const canManageBlock = canManageBlockedTimes(state.store) && (
      state.store.blockedTimes.some((block) => block.id === record.id)
      || state.store.events.some((event) => event.id === record.id)
    );
    setDetailsActionVisibility({ delete: canManageBlock, cancel: false, edit: canManageBlock, approve: false, reject: false });
  } else {
    const category = categoryById(state.store, record.category_id); const privateView = canViewPrivateEvent(state.store, record);
    const selectedOccurrence = props.occurrence || eventOccurrences(record)[0];
    const scheduleLabel = selectedOccurrence ? `${formatDateTime(selectedOccurrence.start_time)} to ${formatTime(selectedOccurrence.end_time)}` : scheduleSummary(record);
    const data = {
      Organization: record.organization_name,
      Category: category.name,
      Venue: record.venue,
      Schedule: scheduleLabel,
      'Expected Attendees': record.expected_attendees,
      'Privacy Level': privacyLabel(record.privacy_level),
      'Short Public Description': record.public_description
    };
    if (privateView) Object.assign(data, {
      Purpose: record.purpose,
      'Contact Person': record.contact_person,
      'Contact Number': record.contact_info,
      'Private Notes': record.private_notes
    });
    if (isSuperAdmin(state.store)) Object.assign(data, {
      Approval: cap(record.approval_status),
      Status: cap(record.event_status),
      'Admin Recommendation': record.admin_recommendation,
      'Approval Date': record.approval_date ? formatDateTime(record.approval_date) : '',
      'Reviewed By': record.reviewed_by || '',
      'Admin Notes': record.admin_notes,
      'Rejection Reason': record.rejection_reason,
      Conflicts: record.conflict_event_ids?.length ? record.conflict_event_ids.length : ''
    });
    if (!isSuperAdmin(state.store) && isManager(state.store) && record.organization_id === currentUser(state.store).organization_id && record.admin_recommendation) {
      data['Admin Recommendation'] = record.admin_recommendation;
    }
    if (record.revision_of && isSuperAdmin(state.store)) {
      const original = state.store.events.find((item) => item.id === record.revision_of);
      if (original) Object.assign(data, {
        'Original Schedule': `${formatDateTime(original.start_time)} to ${formatTime(original.end_time)}`,
        'Original Venue': original.venue,
        'Original Description': original.public_description
      });
    }
    if (Array.isArray(record.revision_history) && record.revision_history.length && (isSuperAdmin(state.store) || record.organization_id === currentUser(state.store).organization_id)) {
      data['Revision History'] = record.revision_history
        .map((item) => `${cap(item.status || 'pending')} - ${formatDateTime(item.approved_at || item.submitted_at)}`)
        .join('\n');
    }
    $('detailsTitle').textContent = record.title; $('detailsMeta').textContent = `${category.name} - ${record.venue}`; $('detailsList').innerHTML = rows(data);
    setDetailsActionVisibility(detailsActionVisibility(record));
  }
  openDialog('detailsModal');
}

function isBlockDetail(details) {
  const record = details?.record || {};
  return details?.type === 'block' || record.record_type === 'blocked_time' || record.block_source === 'admin';
}

function isOrganizationSchedule(record) {
  return record?.schedule_source === 'organization'
    || record?.created_by_role === 'organization'
    || Boolean(record?.organization_id && record?.created_by && record?.requires_approval);
}

function isAdminCreatedSchedule(record) {
  return record?.schedule_source === 'admin'
    || record?.created_by_role === 'admin'
    || record?.requires_approval === false;
}

function detailsActionVisibility(record) {
  const visibility = { delete: false, cancel: false, edit: false, approve: false, reject: false };
  if (isSuperAdmin(state.store)) {
    visibility.delete = canDeleteEvent(state.store, record);
    visibility.edit = canEditEvent(state.store, record);
    if (record.approval_status === 'pending' && isOrganizationSchedule(record) && !isAdminCreatedSchedule(record) && record.created_by !== currentUser(state.store).id) {
      visibility.approve = canApproveEvents(state.store);
      visibility.reject = canApproveEvents(state.store);
    }
    return visibility;
  }
  if (isManager(state.store) && record.created_by === currentUser(state.store).id) {
    visibility.delete = canDeleteEvent(state.store, record);
    visibility.edit = canEditEvent(state.store, record);
  }
  return visibility;
}

function setDetailsActionVisibility(visibility) {
  const pairs = {
    detailsDeleteButton: Boolean(visibility.delete),
    detailsCancelButton: Boolean(visibility.cancel),
    detailsEditButton: Boolean(visibility.edit),
    detailsApproveButton: Boolean(visibility.approve),
    detailsRejectButton: Boolean(visibility.reject)
  };
  Object.entries(pairs).forEach(([id, visible]) => {
    const button = $(id);
    if (!button) return;
    button.hidden = !visible;
    button.disabled = !visible;
    button.classList.toggle('action-hidden', !visible);
  });
}

function handleCalendarEventClick(info) {
  if (isPublic(state.store)) return openPublicDayDialog(clickedEventDate(info), info.el);
  openDetails(clickedEventDetails(info));
}

function clickedEventDetails(info) {
  const props = info.event.extendedProps;
  if (props.type !== 'event') return props;
  const clickedDate = clickedEventDate(info);
  const occurrences = props.occurrences || eventOccurrences(props.record);
  const occurrence = occurrences.find((item) => item.date === clickedDate) || props.occurrence || occurrences[0];
  return { ...props, occurrence };
}

function openPublicDayDialog(date, anchorEl) {
  state.selectedPublicDate = date;
  renderPublicDayDialog();
  positionPublicDayDialog($('publicDayDialog'), anchorEl);
  $('publicDayDialog').classList.add('open');
  $('publicDayDialog').setAttribute('aria-hidden', 'false');
}

function closePublicDayDialog() {
  state.selectedPublicDate = '';
  const dialog = $('publicDayDialog');
  if (!dialog) return;
  dialog.classList.remove('open');
  dialog.setAttribute('aria-hidden', 'true');
}

function renderPublicDayDialog() {
  if (!state.selectedPublicDate) return;
  const items = state.store.events
    .filter((event) => event.approval_status === 'approved' && isPublicEvent(event))
    .flatMap((event) => eventOccurrences(event).filter((occurrence) => occurrence.date === state.selectedPublicDate).map((occurrence) => ({ event, occurrence })))
    .sort((a, b) => new Date(a.occurrence.start_time) - new Date(b.occurrence.start_time));
  $('publicDayTitle').textContent = new Date(`${state.selectedPublicDate}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  $('publicDayCount').textContent = `${items.length} public event${items.length === 1 ? '' : 's'}`;
  $('publicDayEvents').innerHTML = items.map(({ event, occurrence }) => {
    const category = categoryById(state.store, event.category_id);
    return `<article class="public-day-event" style="border-left-color:${escapeHtml(organizationColor(state.store, event))};--event-accent-color:${escapeHtml(eventAccentColor(state.store, event))}"><strong>${escapeHtml(event.title)}</strong><p>${escapeHtml(formatTime(occurrence.start_time))} to ${escapeHtml(formatTime(occurrence.end_time))}</p><p>${escapeHtml(event.organization_name)} - ${escapeHtml(event.venue)}</p><p>${escapeHtml(category.name)} - ${escapeHtml(cap(event.event_status))}</p><p>${escapeHtml(event.public_description)}</p></article>`;
  }).join('') || '<p class="empty-text">No public events scheduled for this date.</p>';
}

function positionPublicDayDialog(dialog, anchorEl) {
  if (!dialog || !anchorEl || window.innerWidth <= 640) return;
  const anchorRect = anchorEl.getBoundingClientRect();
  const width = Math.min(360, window.innerWidth - 32);
  const left = Math.min(Math.max(anchorRect.left, 16), window.innerWidth - width - 16);
  const top = Math.min(Math.max(anchorRect.bottom + 8, 16), window.innerHeight - 260);
  dialog.style.setProperty('--dialog-left', `${left}px`);
  dialog.style.setProperty('--dialog-top', `${top}px`);
}

function handlePublicDialogPointerDown(event) {
  const dialog = $('publicDayDialog');
  if (!dialog || !dialog.classList.contains('open')) return;
  if (dialog.contains(event.target) || event.target.closest('.fc-daygrid-day, .fc-event')) return;
  closePublicDayDialog();
}

function handlePublicDialogKeyDown(event) {
  if (event.key === 'Escape') closePublicDayDialog();
}

function editSelectedEvent() {
  const details = state.selectedDetails;
  const record = details?.record;
  if (!record) return;
  closeDialog('detailsModal');
  if (isBlockDetail(details)) {
    if (state.store.blockedTimes.some((block) => block.id === record.id)) {
      openBlockedTimes();
      editBlockedTime(record.id);
    } else {
      openEventModal({ start: new Date(record.start_time), end: new Date(record.end_time) }, record);
    }
    return;
  }
  openEventModal({ start: new Date(record.start_time), end: new Date(record.end_time) }, record);
}
function cancelSelectedEvent() { const event = state.selectedDetails?.record; if (event) confirmAction(`Cancel "${event.title}"?`, () => cancelEvent(event)); }
function cancelEventFromModal() { const event = state.store.events.find((item) => item.id === $('eventId').value); if (event) confirmAction(`Cancel "${event.title}"?`, () => { cancelEvent(event); closeDialog('eventModal'); }); }
function cancelEvent(event) { event.event_status = 'cancelled'; event.updated_at = new Date().toISOString(); log('event_cancelled', `${currentUser(state.store).full_name} cancelled "${event.title}".`, event); closeDialog('detailsModal'); persist('Event cancelled.'); }
function deleteSelectedEvent() {
  const details = state.selectedDetails;
  const record = details?.record;
  if (!record) return;
  if (isBlockDetail(details)) {
    const remove = state.store.blockedTimes.some((block) => block.id === record.id)
      ? () => removeBlockedTime(record.id)
      : () => deleteEvent(record);
    confirmAction(`Remove "${record.title || 'Blocked university period'}"?`, remove);
    return;
  }
  confirmDeleteEvent(record);
}
function deleteEventFromModal() { const event = state.store.events.find((item) => item.id === $('eventId').value); if (event) confirmDeleteEvent(event); }
function confirmDeleteEvent(event) { if (!requirePermission(canDeleteEvent(state.store, event), 'You cannot delete this event.')) return; confirmAction(`Permanently delete "${event.title}"?`, () => deleteEvent(event)); }
async function deleteEvent(event) {
  const index = state.store.events.findIndex((item) => item.id === event.id);
  if (index < 0) return;

  const deletedEvent = state.store.events[index];
  const logLength = state.store.activityLogs.length;
  const notificationsBefore = [...(state.store.notifications || [])];

  try {
    state.store.events.splice(index, 1);
    state.store.notifications = (state.store.notifications || []).filter((item) => item.reference_id !== deletedEvent.id);
    if (isManager(state.store) && deletedEvent.created_by === currentUser(state.store).id) {
      notifyAdmins({
        notification_type: 'schedule_removed',
        reference_id: deletedEvent.id,
        title: 'Schedule Removed by Organization',
        message: `${deletedEvent.organization_name || 'An organization'} removed "${deletedEvent.title}".`
      });
    } else if (isSuperAdmin(state.store) && isOrganizationSchedule(deletedEvent)) {
      notifyScheduleCreator(deletedEvent, 'Schedule Removed by Admin', `Admin removed your schedule "${deletedEvent.title}".`);
    }
    log(
      'event_deleted',
      `${currentUser(state.store).full_name} deleted "${deletedEvent.title}".`,
      deletedEvent
    );

    closeDialog('detailsModal');
    closeDialog('eventModal');
    renderAll();
    refreshCalendar();

    await deleteRecord('events', deletedEvent.id);
    const result = await saveStore(state.store);
    if (result?.deleteFailures?.length) {
      console.warn('CONNECT event delete cleanup warning:', result.deleteFailures);
    }
    renderAll();
    refreshCalendar();
    showToast('Event deleted.', 'success');
  } catch (error) {
    state.store.events.splice(index, 0, deletedEvent);
    state.store.notifications = notificationsBefore;
    state.store.activityLogs.length = logLength;
    await reloadStore();
    showToast(`Could not delete event: ${error.message}`, 'error');
  }
}

function reviewSelectedEvent(status) { const event = state.selectedDetails?.record; if (event) reviewEvent(event, status); }
function reviewEvent(event, status) {
  if (!requirePermission(canApproveEvents(state.store), 'This account cannot review event requests.')) return;
  if (isAdminCreatedSchedule(event) || event.created_by === currentUser(state.store).id) {
    return showToast('This schedule does not need admin approval.', 'error');
  }
  if (event.approval_status !== 'pending') return showToast('This schedule request has already been reviewed.', 'error');
  if (status === 'approved') {
    const block = findEventBlock(event);
    if (block) return showConflict('Approval Blocked', 'This request overlaps an admin-blocked period.', [block], false);
    const conflict = findApprovedVenueConflict(state.store, event);
    if (conflict) return showConflict('Approval Blocked', 'An approved event already uses this venue and time.', [conflict], false);
  }
  openEventReviewModal(event, status);
}

function openEventReviewModal(event, status) {
  $('eventReviewId').value = event.id;
  $('eventReviewStatus').value = status;
  $('eventReviewTitle').textContent = status === 'approved' ? 'Approve Event Request' : 'Reject Event Request';
  $('eventReviewSubtitle').textContent = status === 'approved'
    ? `Add a recommendation or comment for "${event.title}".`
    : `Inform the creator why "${event.title}" is rejected. The creator will be told to delete the proposed event.`;
  $('eventReviewRecommendation').value = event.admin_recommendation || event.rejection_reason || '';
  $('eventReviewSubmitButton').textContent = status === 'approved' ? 'Approve Request' : 'Reject Request';
  openDialog('eventReviewModal');
}

async function submitEventReviewForm(event) {
  event.preventDefault();
  const record = state.store.events.find((item) => item.id === $('eventReviewId').value);
  const status = $('eventReviewStatus').value;
  if (!record || !['approved', 'rejected'].includes(status)) return showToast('Event request was not found.', 'error');
  if (!requirePermission(canApproveEvents(state.store), 'This account cannot review event requests.')) return;
  const recommendation = cleanMultiline($('eventReviewRecommendation').value);
  const textError = textLimitError(recommendation, TEXT_LIMITS.adminNotes, 'Admin recommendation');
  if (textError) return showToast(textError, 'error');
  const now = new Date().toISOString();
  const previousValues = scheduleAuditSnapshot(record);
  Object.assign(record, {
    approval_status: status,
    admin_recommendation: recommendation,
    approval_date: now,
    approved_by: status === 'approved' ? currentUser(state.store).id : '',
    reviewed_by: currentUser(state.store).id,
    notification_status: 'unread',
    revision_status: record.revision_of ? status : record.revision_status,
    updated_at: now
  });
  if (record.revision_of && status === 'approved') applyApprovedRevision(record, now);
  if (record.revision_of && status === 'rejected') record.event_status = 'disabled';
  if (status === 'rejected') record.rejection_reason = recommendation || 'Rejected by admin. Proposed event should be deleted.';
  if (record.created_by) {
    const approved = status === 'approved';
    createNotification({
      user_id: record.created_by,
      notification_type: 'schedule_approval',
      reference_id: record.id,
      title: `${approved ? 'Approved' : 'Rejected'} Schedule Request`,
      message: approved
        ? `Your schedule "${record.title}" was approved.${recommendation ? ` Recommendation: ${recommendation}` : ''}`
        : `Your schedule "${record.title}" was rejected. Please delete the proposed event.${recommendation ? ` Recommendation: ${recommendation}` : ''}`
    });
  }
  log(`event_request_${status}`, `${currentUser(state.store).full_name} marked "${record.title}" as ${status}.`, scheduleAuditSnapshot(record), previousValues);
  const saved = await persist(`Event request ${status}.`);
  if (!saved) {
    await reloadStore().catch(() => {});
    return;
  }
  closeDialog('eventReviewModal');
  closeDialog('detailsModal');
  renderEventRequests();
}

function applyApprovedRevision(revision, approvedAt) {
  const original = state.store.events.find((item) => item.id === revision.revision_of);
  if (!original) return;
  const keep = {
    id: original.id,
    created_by: original.created_by,
    created_at: original.created_at,
    revision_history: [...(original.revision_history || []), {
      revision_id: revision.id,
      status: 'submitted',
      submitted_at: revision.revision_submitted_at || revision.created_at,
      submitted_by: revision.created_by
    }, {
      revision_id: revision.id,
      status: 'approved',
      approved_at: approvedAt,
      approved_by: currentUser(state.store).id,
      recommendation: revision.admin_recommendation || ''
    }]
  };
  Object.assign(original, {
    ...revision,
    ...keep,
    revision_of: '',
    original_schedule_id: '',
    revision_status: '',
    approval_status: 'approved',
    approval_date: approvedAt,
    notification_status: 'unread',
    updated_at: approvedAt
  });
  revision.event_status = 'disabled';
}

function showConflict(title, subtitle, records, canContinue) {
  $('conflictTitle').textContent = title; $('conflictSubtitle').textContent = subtitle;
  $('conflictBody').innerHTML = records.map(conflictRecordHtml).join('');
  $('conflictContinueButton').hidden = !canContinue; openDialog('conflictModal');
}

function conflictRecordHtml(record) {
  const schedule = record.occurrences ? scheduleSummary(record) : `${formatDateTime(record.start_time)} to ${formatTime(record.end_time)}`;
  const reason = record.reason ? `<br><strong>Reason:</strong> ${escapeHtml(record.reason)}` : '';
  return `<p><strong>${escapeHtml(record.title)}</strong><br>${escapeHtml(record.venue || 'University-wide')}<br>${escapeHtml(schedule)}${reason}</p>`;
}
function continueAfterConflict() { closeDialog('conflictModal'); const next = state.pendingConflictContinuation; state.pendingConflictContinuation = null; next?.(); }

function persistMovedCalendarItem(info) {
  const { type, record, occurrence } = info.event.extendedProps;
  if (type === 'block') return info.revert();
  if (!canEditEvent(state.store, record)) return info.revert();
  const movedOccurrence = { ...occurrence, date: dateInput(info.event.start), start_time: info.event.start.toISOString(), end_time: info.event.end.toISOString() };
  const candidate = syncEventRange({ ...record, occurrences: eventOccurrences(record).map((item) => item.id === occurrence.id ? movedOccurrence : item), updated_at: new Date().toISOString() });
  const block = findEventBlock(candidate);
  if (block) { showConflict('Move Blocked', 'This period is blocked by the admin.', [block], false); return info.revert(); }
  candidate.conflict_event_ids = findVenueConflicts(state.store, candidate).map((event) => event.id);
  Object.assign(record, candidate); log('event_request_moved', `${currentUser(state.store).full_name} moved "${record.title}".`, record); persist('Event schedule updated.');
}

function openAnnouncements() {
  clearAnnouncementEditor();
  renderAnnouncements();
  openDialog('announcementsModal');
}
function renderAnnouncementPreview() {
  const preview = $('announcementPreview');
  if (!preview) return;
  const first = visibleAnnouncements()[0];
  preview.innerHTML = first ? announcementPreviewHtml(first) : announcementPreviewHtml(DEFAULT_ANNOUNCEMENT);
}
function isDefaultAnnouncement(item) {
  const title = String(item?.title || '').trim().toLowerCase();
  const content = String(item?.content || '').trim().toLowerCase();
  return [DEFAULT_ANNOUNCEMENT, LEGACY_DEFAULT_ANNOUNCEMENT].some((announcement) =>
    title === announcement.title.toLowerCase() && content === announcement.content.toLowerCase()
  );
}
function visibleAnnouncements() { return activeAnnouncements(state.store).filter((item) => !isDefaultAnnouncement(item)); }
function allAnnouncements() {
  return [...(state.store.announcements || [])].filter((item) => !isDefaultAnnouncement(item)).sort((a, b) => new Date(b.updated_at || b.created_at || b.posted_at || 0) - new Date(a.updated_at || a.created_at || a.posted_at || 0));
}
function latestAnnouncement() { return allAnnouncements()[0] || null; }
function announcementPreviewHtml(item) { return `<div class="notice"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.content)}</p></div>`; }
function renderAnnouncements() {
  if (!$('announcementsList')) {
    updateAnnouncementActionButtons();
    return;
  }
  const announcements = allAnnouncements();
  $('announcementsList').innerHTML = announcements.length
    ? announcements.map(announcementAdminHtml).join('')
    : `<div class="activity-item notice"><strong>${escapeHtml(DEFAULT_ANNOUNCEMENT.title)}</strong><p>${escapeHtml(DEFAULT_ANNOUNCEMENT.content)}</p></div>`;
  updateAnnouncementActionButtons();
}

function announcementAdminHtml(item) {
  const visibility = item.visibility_status === 'hidden' ? 'Hidden' : 'Shown';
  const actions = canManageAnnouncements(state.store)
    ? `${actionButton('announcement-edit', item.id, 'Edit', 'secondary-button')}${actionButton('announcement-delete', item.id, 'Delete', 'danger-button')}${item.visibility_status === 'hidden' ? actionButton('announcement-show', item.id, 'Show', 'secondary-button') : actionButton('announcement-hide', item.id, 'Hide', 'secondary-button')}`
    : '';
  return `<div class="activity-item notice"><strong>${escapeHtml(item.title)} <span class="status-pill ${classToken(item.visibility_status || 'show')}">${escapeHtml(visibility)}</span></strong><p>${escapeHtml(item.content)}</p><p>${escapeHtml(item.created_by || item.posted_by || 'Unknown')} - ${escapeHtml(formatDateTime(item.updated_at || item.created_at || item.posted_at))}</p>${actions}</div>`;
}

function addAnnouncement(event) {
  event.preventDefault();
  if (!canManageAnnouncements(state.store)) return;
  const existing = state.store.announcements.find((item) => item.id === $('announcementId').value);
  const title = cleanSingleLine($('announcementTitle').value);
  const content = cleanMultiline($('announcementContent').value);
  if (!title || !content) return showToast('Complete announcement title and content.', 'error');
  const textError = firstTextLimitError([
    [title, TEXT_LIMITS.announcementTitle, 'Announcement title'],
    [content, TEXT_LIMITS.announcementContent, 'Announcement content']
  ]);
  if (textError) return showToast(textError, 'error');
  const now = new Date().toISOString();
  const user = currentUser(state.store);
  const item = existing || { id: createId(), visibility_status: 'show', created_by: user.full_name, created_at: now };
  Object.assign(item, { title, content, updated_at: now });
  if (!existing) state.store.announcements.push(item);
  log(existing ? 'announcement_updated' : 'announcement_posted', `${existing ? 'Updated' : 'Posted'} announcement "${item.title}".`, item);
  clearAnnouncementEditor(item);
  persist(existing ? 'Announcement updated.' : 'Announcement posted.');
  renderAnnouncements();
  renderAnnouncementPreview();
}

function updateAnnouncementLivePreview() {
  const title = cleanSingleLine($('announcementTitle')?.value) || DEFAULT_ANNOUNCEMENT.title;
  const content = cleanMultiline($('announcementContent')?.value) || DEFAULT_ANNOUNCEMENT.content;
  const preview = $('announcementLivePreview');
  if (preview) preview.innerHTML = announcementPreviewHtml({ title, content });
  updateAnnouncementActionButtons();
}

function clearAnnouncementEditor(previewAnnouncement = latestAnnouncement()) {
  if ($('announcementForm')) $('announcementForm').reset();
  if ($('announcementId')) $('announcementId').value = '';
  if ($('announcementSubmitButton')) $('announcementSubmitButton').textContent = 'Post Announcement';
  const preview = $('announcementLivePreview');
  if (preview) preview.innerHTML = announcementPreviewHtml(previewAnnouncement || DEFAULT_ANNOUNCEMENT);
  updateAnnouncementActionButtons();
}

function loadAnnouncementEditor(id) {
  const item = state.store.announcements.find((announcement) => announcement.id === id);
  if (!item) return showToast('Announcement was not found.', 'error');
  $('announcementId').value = item.id;
  $('announcementTitle').value = item.title || '';
  $('announcementContent').value = item.content || '';
  $('announcementSubmitButton').textContent = 'Update Announcement';
  updateAnnouncementLivePreview();
  $('announcementTitle').focus();
}

function currentAnnouncementForAction() {
  return state.store.announcements.find((item) => item.id === $('announcementId')?.value) || latestAnnouncement();
}

function editLatestAnnouncement() {
  const item = currentAnnouncementForAction();
  if (!item) return showToast('No announcement to edit.', 'error');
  loadAnnouncementEditor(item.id);
}

function deleteCurrentAnnouncement() {
  const item = currentAnnouncementForAction();
  if (!item) return showToast('No announcement to delete.', 'error');
  confirmAction('Delete this announcement?', () => removeById('announcements', item.id, 'announcement_deleted', 'Announcement deleted.'));
}

function setCurrentAnnouncementVisibility(visibility_status) {
  const item = currentAnnouncementForAction();
  if (!item) return showToast('No announcement to update.', 'error');
  setAnnouncementVisibility(item.id, visibility_status);
}

function setAnnouncementVisibility(id, visibility_status) {
  if (!canManageAnnouncements(state.store)) return;
  const item = state.store.announcements.find((announcement) => announcement.id === id);
  if (!item) return;
  item.visibility_status = visibility_status;
  item.updated_at = new Date().toISOString();
  log(`announcement_${visibility_status === 'hidden' ? 'hidden' : 'shown'}`, `${visibility_status === 'hidden' ? 'Hid' : 'Showed'} announcement "${item.title}".`, item);
  persist(`Announcement ${visibility_status === 'hidden' ? 'hidden' : 'shown'}.`);
  renderAnnouncements();
  renderAnnouncementPreview();
  updateAnnouncementLivePreview();
}

function updateAnnouncementActionButtons() {
  const current = currentAnnouncementForAction();
  setHidden('announcementEditButton', !current);
  setHidden('announcementDeleteButton', !current);
  setHidden('announcementHideButton', !current || current.visibility_status === 'hidden');
  setHidden('announcementShowButton', !current || current.visibility_status !== 'hidden');
}

function openNotifications() { renderNotifications(); openDialog('notificationsModal'); }
function renderNotifications() {
  const notices = currentUserNotifications();
  $('markNotificationsReadButton').hidden = !notices.some((item) => !item.is_read);
  $('notificationsList').innerHTML = notices.map(notificationHtml).join('') || empty('No notifications right now.');
  updateNotificationBadge();
}

function notificationHtml(item) {
  const scheduleNotification = /^schedule_(approval|revision|update)$/.test(item.notification_type || '');
  return `<div class="activity-item ${item.is_read ? '' : 'unread-notification'}"><strong>${escapeHtml(item.title)} <span class="status-pill ${item.is_read ? 'read' : 'pending'}">${escapeHtml(item.is_read ? 'Read' : 'Unread')}</span></strong><p>${escapeHtml(item.message)}</p><p>${escapeHtml(formatDateTime(item.created_at))}</p><div class="inline-actions">${scheduleNotification ? actionButton('notification-open', item.notification_id, 'View Schedule', 'secondary-button') : ''}${item.is_read ? '' : actionButton('notification-read', item.notification_id, 'Mark as Read', 'secondary-button')}</div></div>`;
}

function markNotificationRead(id) {
  const item = (state.store.notifications || []).find((notification) => notification.notification_id === id);
  if (!item || item.user_id !== currentUser(state.store).id) return;
  item.is_read = true;
  persist('Notification marked as read.');
  renderNotifications();
}

function markAllNotificationsRead() {
  currentUserNotifications().forEach((item) => { item.is_read = true; });
  persist('Notifications marked as read.');
  renderNotifications();
}

function chooseActivityStatus() {
  const user = currentUser(state.store);
  const accountType = ACCOUNT_TYPES.includes(user.account_type) ? user.account_type : 'CSC';
  updateAppStatus(accountType);
}

function updateAppStatus(accountType) {
  const allowed = accountType === 'CSC' ? canUpdatePresidentStatus(state.store) : canUpdateOfficeStatus(state.store);
  if (!requirePermission(allowed, `This account cannot update ${accountType} status.`)) return;
  const existing = findStatus(accountType);
  const currentLabel = existing?.activity_status || existing?.status_label || ACTIVITY_STATUS_OPTIONS[0];
  $('activityStatusAccountType').value = accountType;
  $('activityStatusTitle').textContent = `${accountType} Activity Status`;
  fillSelect('activityStatusSelect', ACTIVITY_STATUS_OPTIONS.map((item) => [item, item]), currentLabel);
  openDialog('activityStatusModal');
}

function submitActivityStatusForm(event) {
  event.preventDefault();
  const accountType = $('activityStatusAccountType').value;
  const statusLabelValue = $('activityStatusSelect').value;
  if (!ACCOUNT_TYPES.includes(accountType) || !ACTIVITY_STATUS_OPTIONS.includes(statusLabelValue)) return showToast('Choose one of the listed status options.', 'error');
  const allowed = accountType === 'CSC' ? canUpdatePresidentStatus(state.store) : canUpdateOfficeStatus(state.store);
  if (!requirePermission(allowed, `This account cannot update ${accountType} status.`)) return;
  const textError = textLimitError(statusLabelValue, TEXT_LIMITS.statusLabel, 'Status');
  if (textError) return showToast(textError, 'error');
  const user = currentUser(state.store);
  const existing = findStatus(accountType);
  if (!Array.isArray(state.store.activityStatuses)) state.store.activityStatuses = [];
  const item = existing || { id: accountType.toLowerCase(), created_at: new Date().toISOString() };
  Object.assign(item, {
    account_id: user.id,
    account_type: accountType,
    activity_status: statusLabelValue,
    updated_at: new Date().toISOString(),
    updated_by: user.full_name
  });
  if (!existing) state.store.activityStatuses.push(item);
  log('app_status_updated', `${user.full_name} updated ${accountType} status to "${statusLabelValue}".`, item);
  closeDialog('activityStatusModal');
  persist(`${accountType} status updated.`);
}

function openConcerns() { if (!requirePermission(!isPublic(state.store), 'Login to access concerns.')) return; renderConcerns(); openDialog('concernsModal'); }
function renderConcerns() { const user = currentUser(state.store); const list = isSuperAdmin(state.store) ? state.store.concerns : state.store.concerns.filter((item) => item.organization_id === user.organization_id); const canRespond = canApproveEvents(state.store); $('concernsList').innerHTML = list.map((item) => `<div class="activity-item"><strong>${escapeHtml(item.title)} <span class="status-pill ${classToken(item.status)}">${escapeHtml(cap(item.status))}</span></strong><p>${escapeHtml(item.organization_name)} - ${escapeHtml(item.category)} - ${escapeHtml(cap(item.priority))}</p><p>${escapeHtml(item.description)}</p><p>Submitted: ${escapeHtml(formatDateTime(item.created_at))}</p><p>Admin response: ${escapeHtml(item.admin_response || 'Pending')}</p>${canRespond ? `${actionButton('concern-review', item.id, 'Respond', 'secondary-button')}${actionButton('concern-resolve', item.id, 'Resolve', 'primary-button')}${actionButton('concern-reject', item.id, 'Reject', 'danger-button')}` : ''}</div>`).join('') || empty('No concerns'); }
function addConcern(event) {
  event.preventDefault();
  if (!isManager(state.store)) return;
  const user = currentUser(state.store);
  const org = state.store.organizations.find((item) => item.id === user.organization_id);
  if (!org) return showToast('This account is not assigned to an organization.', 'error');
  const title = cleanSingleLine($('concernTitle').value);
  const description = cleanMultiline($('concernDescription').value);
  if (!title || !description) return showToast('Complete concern title and description.', 'error');
  const textError = firstTextLimitError([
    [title, TEXT_LIMITS.concernTitle, 'Concern title'],
    [description, TEXT_LIMITS.concernDescription, 'Concern description']
  ]);
  if (textError) return showToast(textError, 'error');
  const item = { id: createId(), organization_id: org.id, organization_name: org.organization_name, title, category: $('concernCategory').value, priority: $('concernPriority').value, description, status: 'pending', admin_response: '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  state.store.concerns.push(item);
  notifyAdmins({
    notification_type: 'concern_new',
    reference_id: item.id,
    title: 'New Concern Submitted',
    message: `${item.organization_name} submitted concern "${item.title}".`
  });
  log('concern_submitted', `${user.full_name} raised "${item.title}".`, item);
  event.target.reset(); persist('Concern submitted.'); renderConcerns();
}

function openDashboard() { if (!requirePermission(!isPublic(state.store), 'Login to view a dashboard.')) return; renderDashboard(); openDialog('dashboardModal'); }
function renderDashboard() {
  const user = currentUser(state.store);
  const events = isSuperAdmin(state.store)
    ? state.store.events
    : state.store.events.filter((item) => item.organization_id === user.organization_id);
  const upcoming = events.filter((item) => new Date(item.start_time) >= new Date() && eventIsActive(item));
  const ownSchedules = isSuperAdmin(state.store) ? events : events.filter((item) => item.created_by === user.id);
  const pending = ownSchedules.filter((item) => item.approval_status === 'pending');
  const approved = ownSchedules.filter((item) => item.approval_status === 'approved');
  const rejected = ownSchedules.filter((item) => item.approval_status === 'rejected');
  const metrics = isSuperAdmin(state.store)
    ? [['All posted events', events.length], ['Upcoming programs', upcoming.length], ['Blocked periods', state.store.blockedTimes.length], ['Announcements', activeAnnouncements(state.store).length], ['Open concerns', state.store.concerns.filter((item) => !['resolved', 'rejected'].includes(item.status)).length], ['Conflict warnings', events.filter((item) => item.conflict_event_ids?.length).length], ['Organizations', state.store.organizations.length]]
    : [['Pending approval', pending.length], ['Approved schedules', approved.length], ['Changes requested', rejected.length], ['My submissions', ownSchedules.length], ['Announcements', activeAnnouncements(state.store).length], ['Blocked periods', state.store.blockedTimes.length]];
  $('dashboardTitle').textContent = isSuperAdmin(state.store) ? 'Admin Dashboard' : 'Schedule Status';
  $('dashboardGrid').innerHTML = metrics.map(([label, value]) => `<div class="metric"><strong>${value}</strong><span>${escapeHtml(label)}</span></div>`).join('');
  const statusItems = isSuperAdmin(state.store) ? upcoming : ownSchedules;
  $('dashboardList').innerHTML = statusItems
    .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
    .slice(0, 12)
    .map(scheduleStatusHtml)
    .join('') || empty(isSuperAdmin(state.store) ? 'No upcoming events' : 'No submitted schedules');
}

function scheduleStatusHtml(event) {
  const status = event.approval_status || 'pending';
  const recommendation = event.admin_recommendation || event.rejection_reason || '';
  return `<div class="activity-item"><strong>${escapeHtml(event.title)} <span class="status-pill ${classToken(status)}">${escapeHtml(cap(status))}</span></strong><p>${escapeHtml(formatDateTime(event.start_time))} - ${escapeHtml(event.venue)}</p><p>${escapeHtml(event.privacy_level === 'internal' ? 'Admin only' : 'Public after approval')}</p>${recommendation ? `<p>Admin note: ${escapeHtml(recommendation)}</p>` : ''}</div>`;
}

function openEventRequests() { if (!requirePermission(canApproveEvents(state.store), 'This account cannot review event requests.')) return; renderEventRequests(); openDialog('eventRequestsModal'); }
function renderEventRequests() {
  const eventCards = [...state.store.events]
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
    .map(eventRequestHtml);
  $('eventRequestsList').innerHTML = eventCards.join('') || empty('No event requests');
}

function eventRequestHtml(item) {
  const conflictCount = Array.isArray(item.conflict_event_ids) ? item.conflict_event_ids.length : 0;
  const conflictText = conflictCount ? `Warning: ${conflictCount} schedule conflict(s)` : 'No schedule conflict warning';
  const reviewText = item.approval_date ? `<p>${escapeHtml(formatDateTime(item.approval_date))} - ${escapeHtml(item.admin_recommendation || 'No recommendation added.')}</p>` : '';
  const requestType = item.revision_of ? 'Revision Request' : 'Schedule Request';
  const needsReview = item.approval_status === 'pending' && item.created_by !== currentUser(state.store).id;
  const actions = `${actionButton('event-view', item.id, 'Details', 'secondary-button')}${needsReview ? `${actionButton('event-approve', item.id, 'Approve', 'primary-button')}${actionButton('event-reject', item.id, 'Reject', 'secondary-button')}` : ''}`;
  return `<div class="activity-item"><strong>${escapeHtml(item.title)} <span class="status-pill ${classToken(item.approval_status)}">${escapeHtml(cap(item.approval_status))}</span></strong><p>${escapeHtml(requestType)} - ${escapeHtml(item.organization_name)} - ${escapeHtml(item.venue)} - ${eventOccurrences(item).length} scheduled day(s)</p><p>${escapeHtml(conflictText)}</p>${reviewText}${actions}</div>`;
}

function openBlockedTimes() { if (!requirePermission(canManageBlockedTimes(state.store), 'This account cannot manage blocked times.')) return; renderBlockedTimes(); updateBlockTimeFields(); openDialog('blockedTimesModal'); }
function updateBlockTimeFields() {
  const blockType = $('blockType')?.value;
  const multiDay = blockType === 'multi_day';
  const wholeDay = blockType === 'whole_day';
  $('blockTimeFields')?.classList.toggle('is-multi-day', multiDay);
  const endDateLabel = $('blockEndDateLabel');
  if (endDateLabel) endDateLabel.hidden = !multiDay;
  if ($('blockStartDateLabelText')) $('blockStartDateLabelText').textContent = multiDay ? 'Start Date' : 'Date';
  $('blockEndDate').required = multiDay;
  $('blockEndDate').readOnly = !multiDay;
  const startTimeLabel = $('blockStart')?.closest('label');
  const endTimeLabel = $('blockEnd')?.closest('label');
  if (startTimeLabel) startTimeLabel.hidden = wholeDay;
  if (endTimeLabel) endTimeLabel.hidden = wholeDay;
  $('blockStart').required = !wholeDay;
  $('blockEnd').required = !wholeDay;
  if (wholeDay) {
    $('blockStart').value = '00:00';
    $('blockEnd').value = '00:00';
  } else if (!multiDay) {
    syncSingleDayBlockEndDate();
  }
}

function syncSingleDayBlockEndDate() {
  if ($('blockType')?.value !== 'multi_day') $('blockEndDate').value = $('blockStartDate').value;
}

function addBlockedTime(event) {
  event.preventDefault();
  if (!canManageBlockedTimes(state.store)) return;
  const existing = state.store.blockedTimes.find((item) => item.id === $('blockId')?.value);
  const title = cleanSingleLine($('blockTitle').value);
  const reason = cleanMultiline($('blockReason').value);
  const blockType = $('blockType').value;
  const startDate = $('blockStartDate').value;
  const endDate = blockType === 'multi_day' ? $('blockEndDate').value : startDate;
  if (!title || !startDate || !endDate) return showToast('Complete blocked-period title and date fields.', 'error');
  const textError = firstTextLimitError([
    [title, TEXT_LIMITS.blockTitle, 'Blocked-period title'],
    [reason, TEXT_LIMITS.blockReason, 'Blocked-period reason']
  ]);
  if (textError) return showToast(textError, 'error');
  if (!['single_day', 'whole_day', 'multi_day'].includes(blockType)) return showToast('Choose a valid block type.', 'error');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return showToast('Use valid blocked-period dates.', 'error');
  if (blockType !== 'whole_day' && (!$('blockStart').value || !$('blockEnd').value)) return showToast('Choose start and end times for the blocked period.', 'error');
  const start = blockType === 'whole_day' ? localIso(startDate, '00:00') : localIso(startDate, $('blockStart').value);
  const end = blockType === 'whole_day' ? localIso(nextDateInput(startDate), '00:00') : localIso(endDate, $('blockEnd').value);
  if (!start || !end || new Date(start) >= new Date(end)) return showToast('Blocked-time end must be later than start.', 'error');
  const item = { ...(existing || {}), id: existing?.id || createId(), record_type: 'blocked_time', block_source: 'admin', created_by_role: 'admin', requires_approval: false, title, block_type: blockType, start_time: start, end_time: end, reason, created_by: existing?.created_by || currentUser(state.store).id, created_at: existing?.created_at || new Date().toISOString(), updated_at: new Date().toISOString() };
  if (existing) Object.assign(existing, item);
  else state.store.blockedTimes.push(item);
  log(existing ? 'blocked_time_updated' : 'blocked_time_created', `${existing ? 'Updated' : 'Added'} blocked period "${item.title}".`, item);
  resetBlockedTimeForm(); persist(existing ? 'Blocked period updated.' : 'Blocked period added.'); renderBlockedTimes();
}
function renderBlockedTimes() {
  $('blockedTimesList').innerHTML = state.store.blockedTimes.map(blockedTimeHtml).join('') || empty('No blocked periods');
}

function blockedTimeHtml(item) {
  const blockType = item.block_type === 'whole_day' ? 'Whole Day' : item.block_type === 'multi_day' ? 'Multiple Day' : 'Single Day';
  const actions = canManageBlockedTimes(state.store)
    ? `${actionButton('block-edit', item.id, 'Edit', 'secondary-button')}${actionButton('block-delete', item.id, 'Remove', 'danger-button')}`
    : '';
  return `<div class="activity-item"><strong>${escapeHtml(item.title)} <span class="status-pill ${classToken(item.block_type || 'single_day')}">${escapeHtml(blockType)}</span></strong><p>${escapeHtml(formatDateTime(item.start_time))} to ${escapeHtml(formatDateTime(item.end_time))}</p><p>${escapeHtml(item.reason || 'No reason provided.')}</p>${actions}</div>`;
}

function editBlockedTime(id) {
  const item = state.store.blockedTimes.find((block) => block.id === id);
  if (!item) return showToast('Blocked period was not found.', 'error');
  $('blockId').value = item.id;
  $('blockTitle').value = item.title || '';
  $('blockType').value = item.block_type || 'single_day';
  $('blockStartDate').value = dateInput(item.start_time);
  $('blockStart').value = timeInput(item.start_time);
  $('blockEndDate').value = dateInput(item.end_time);
  $('blockEnd').value = timeInput(item.end_time);
  $('blockReason').value = item.reason || '';
  updateBlockTimeFields();
  $('blockSubmitButton').textContent = 'Save Block';
  $('cancelBlockEditButton').hidden = false;
  $('blockTitle').focus();
}

function resetBlockedTimeForm() {
  $('blockedTimeForm')?.reset();
  if ($('blockId')) $('blockId').value = '';
  if ($('blockSubmitButton')) $('blockSubmitButton').textContent = 'Add Block';
  if ($('cancelBlockEditButton')) $('cancelBlockEditButton').hidden = true;
  updateBlockTimeFields();
}

async function removeBlockedTime(id) {
  if (!requirePermission(canManageBlockedTimes(state.store), 'This account cannot manage blocked times.')) return;
  const item = state.store.blockedTimes.find((block) => block.id === id);
  if (!item) return;
  state.store.blockedTimes = state.store.blockedTimes.filter((block) => block.id !== id);
  log('blocked_time_removed', 'Blocked period removed.', item);
  try {
    await persist('Blocked period removed.');
    try {
      await deleteRecord('blockedTimes', id);
    } catch (error) {
      console.warn('CONNECT blocked-period table cleanup failed after store removal:', error);
    }
    resetBlockedTimeForm();
    renderBlockedTimes();
    refreshCalendar();
  } catch (error) {
    state.store.blockedTimes.push(item);
    showToast(error.message, 'error');
    renderBlockedTimes();
    refreshCalendar();
  }
}

function openCategories() { if (!requirePermission(canManageCategories(state.store), 'This account cannot manage categories.')) return; renderCategories(); openDialog('categoriesModal'); }
function addCategory(event) {
  event.preventDefault();
  if (!canManageCategories(state.store)) return;
  const name = cleanSingleLine($('categoryName').value);
  if (!name) return showToast('Category name is required.', 'error');
  const textError = textLimitError(name, TEXT_LIMITS.categoryName, 'Category name');
  if (textError) return showToast(textError, 'error');
  if (state.store.categories.some((item) => normalizedName(item.name) === normalizedName(name))) return showToast('A category with this name already exists.', 'error');
  const item = { id: createId(), name, color: safeCssColor($('categoryColor').value, '#2563EB'), active: true };
  state.store.categories.push(item);
  log('category_created', `Created category "${item.name}".`, item);
  event.target.reset(); persist('Category added.'); renderCategories();
}
function renderCategories() {
  $('categoriesList').innerHTML = state.store.categories.map(categoryHtml).join('');
}

function categoryHtml(item) {
  const status = item.active ? 'Active' : 'Inactive';
  const toggleLabel = item.active ? 'Deactivate' : 'Activate';
  return `<div class="activity-item"><strong><span class="color-swatch" style="background:${escapeHtml(safeCssColor(item.color))}"></span>${escapeHtml(item.name)}</strong><p>${status}</p>${actionButton('category-toggle', item.id, toggleLabel, 'secondary-button')}${actionButton('category-delete', item.id, 'Delete', 'danger-button')}</div>`;
}

function openOrganizations() { if (!requirePermission(canManageAccounts(state.store), 'Only the Manager can manage organizations.')) return; renderOrganizations(); openDialog('organizationsModal'); }
function addOrganization(event) {
  event.preventDefault();
  if (!canManageAccounts(state.store)) return;
  const organization_name = cleanSingleLine($('organizationName').value);
  const organization_type = cleanSingleLine($('organizationType').value);
  if (!organization_name || !organization_type) return showToast('Organization name and type are required.', 'error');
  const textError = firstTextLimitError([
    [organization_name, TEXT_LIMITS.organizationName, 'Organization name'],
    [organization_type, TEXT_LIMITS.organizationType, 'Organization type']
  ]);
  if (textError) return showToast(textError, 'error');
  if (state.store.organizations.some((item) => normalizedName(item.organization_name) === normalizedName(organization_name))) return showToast('An organization with this name already exists.', 'error');
  const item = { id: createId(), organization_name, organization_type, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  state.store.organizations.push(item);
  log('organization_created', `Created organization "${item.organization_name}".`, item);
  event.target.reset(); persist('Organization added.'); renderOrganizations();
}
function renderOrganizations() {
  $('organizationsList').innerHTML = state.store.organizations.map(organizationHtml).join('');
}

function organizationHtml(item) {
  return `<div class="activity-item"><strong>${escapeHtml(item.organization_name)}</strong><p>${escapeHtml(item.organization_type)}</p>${actionButton('organization-delete', item.id, 'Delete', 'danger-button')}</div>`;
}

function openUsers() { if (!requirePermission(canManageAccounts(state.store), 'Only the Manager can manage accounts.')) return; renderUsers(); openDialog('usersModal'); }
function renderUsers() {
  const requests = pendingAccountRequests().map(accountRequestHtml).join('');
  const accounts = state.store.users.map(userHtml).join('');
  $('usersList').innerHTML = `${requests}${accounts}` || empty('No accounts');
}

function pendingAccountRequests() {
  return (state.store.accountRequests || []).filter((request) => !['approved', 'rejected'].includes(String(request.status || '').toLowerCase()));
}

function accountRequestHtml(request) {
  const requestId = request.id || request.request_id;
  const rows = {
    'AUP Email': accountRequestEmail(request),
    'Phone Number': accountRequestPhone(request),
    'Organization Name': request.organization_name || request.organizationName || '',
    Name: request.full_name || request.name || '',
    Submitted: request.created_at ? formatDateTime(request.created_at) : 'Pending'
  };
  return `<div class="activity-item account-card pending-account-card"><div class="account-card-head"><div><strong>Pending Organization Account</strong><p>${escapeHtml(request.organization_name || request.username || 'Account request')}</p></div><div class="account-card-actions">${actionButton('account-request-approve', requestId, 'Approve', 'primary-button')}${actionButton('account-request-reject', requestId, 'Reject', 'danger-button')}</div></div><dl class="details-list account-details">${rowsObject(rows)}</dl></div>`;
}

function userHtml(user) {
  const organization = findOrganization({ id: user.organization_id, name: userOrganizationName(user) });
  const organizationName = organization?.organization_name || userOrganizationName(user) || 'No organization';
  const status = accountStatus(user);
  const rows = {
    Name: user.full_name || '',
    Role: roleLabel(user.account_preset || user.role),
    'Account Type': user.account_type || '',
    Organization: organizationName,
    Email: accountEmail(user),
    'Contact Number': accountPhone(user),
    'Account Status': status,
    'Creation Date': user.created_at ? formatDateTime(user.created_at) : 'Not recorded'
  };
  const suspendLabel = user.suspended_status ? 'Reactivate Account' : 'Suspend Account';
  return `<div class="activity-item account-card"><div class="account-card-head"><div><strong>${escapeHtml(user.full_name || user.username)}</strong><p>@${escapeHtml(user.username || 'account')} - ${escapeHtml(status)}</p></div><div class="account-card-actions">${actionButton('account-edit', user.id, 'Edit Account', 'secondary-button')}${actionButton('account-suspend', user.id, suspendLabel, 'secondary-button')}${actionButton('account-delete', user.id, 'Delete Account', 'danger-button')}</div></div><dl class="details-list account-details">${rowsObject(rows)}</dl></div>`;
}

function accountEmail(user) {
  const email = firstAccountValue(user.email, user.aup_email, user.email_address, user.auth_email, user.user_email, user.raw_user_meta_data?.email);
  if (email && !email.endsWith('@core.local')) return email;
  if (user.role === 'organization_manager') return 'Not provided';
  return email || (user.username ? `${user.username}@core.local` : 'Not provided');
}

function accountPhone(user) {
  return firstAccountValue(user.contact_number, user.phone_number, user.mobile_number, user.contact, user.phone, user.telephone, user.raw_user_meta_data?.phone_number, user.raw_user_meta_data?.contact_number) || 'Not provided';
}

function accountRequestEmail(request) {
  return firstAccountValue(request.aup_email, request.email, request.email_address, request.auth_email, request.user_email, request.raw_user_meta_data?.email);
}

function accountRequestPhone(request) {
  return firstAccountValue(request.phone_number, request.contact_number, request.mobile_number, request.contact, request.phone, request.telephone, request.raw_user_meta_data?.phone_number, request.raw_user_meta_data?.contact_number);
}

function firstAccountValue(...values) {
  const value = values.find((item) => item != null && String(item).trim() !== '');
  return value == null ? '' : String(value).trim();
}

function accountStatus(user) {
  if (user.deleted_at) return 'Deleted';
  if (user.suspended_status || user.suspension_status) return 'Suspended';
  if (user.permissions?.enabled === false) return 'Disabled';
  return 'Active';
}

function rowsObject(data) {
  return Object.entries(data).map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value == null ? '' : value)}</dd>`).join('');
}

function openAccountEditor(id) {
  const user = state.store.users.find((item) => item.id === id);
  if (!user) return showToast('Account was not found.', 'error');
  $('accountEditId').value = user.id;
  $('accountEditName').value = user.full_name || '';
  fillSelect('accountEditRole', Object.entries(ACCOUNT_PRESETS).map(([value, preset]) => [value, preset.label]), user.account_preset || 'organization');
  fillSelect('accountEditOrganization', [['', 'No organization'], ...state.store.organizations.map((org) => [org.id, org.organization_name])], user.organization_id || '');
  $('accountEditEmail').value = accountEmail(user).endsWith('@core.local') ? '' : accountEmail(user);
  $('accountEditContact').value = accountPhone(user) === 'Not provided' ? '' : accountPhone(user);
  $('accountEditStatus').value = (user.suspended_status || user.suspension_status) ? 'suspended' : 'active';
  $('accountEditCreated').value = user.created_at ? formatDateTime(user.created_at) : 'Not recorded';
  openDialog('accountEditModal');
}

async function submitAccountEditForm(event) {
  event.preventDefault();
  if (!canManageAccounts(state.store)) return;
  const user = state.store.users.find((item) => item.id === $('accountEditId').value);
  if (!user) return showToast('Account was not found.', 'error');
  const previous = { ...user, permissions: { ...(user.permissions || {}) } };
  const fullName = cleanSingleLine($('accountEditName').value);
  const email = cleanSingleLine($('accountEditEmail').value);
  const contact = cleanSingleLine($('accountEditContact').value);
  if (!fullName) return showToast('Account name is required.', 'error');
  const textError = firstTextLimitError([
    [fullName, TEXT_LIMITS.fullName, 'Account name'],
    [email, 160, 'Email'],
    [contact, 20, 'Contact number']
  ]);
  if (textError) return showToast(textError, 'error');
  applyAccountPreset(user, $('accountEditRole').value);
  user.full_name = fullName;
  user.organization_id = $('accountEditOrganization').value;
  user.email = email;
  user.aup_email = email;
  user.contact_number = contact;
  user.phone_number = contact;
  applyAccountSuspension(user, $('accountEditStatus').value === 'suspended');
  if (user.id === currentUser(state.store).id && ((user.suspended_status || user.suspension_status) || !user.permissions?.enabled || !user.permissions?.manageAccounts || user.role !== 'super_admin')) {
    Object.assign(user, previous);
    showToast('The active Manager account must remain active with Manage accounts access.', 'error');
    renderUsers();
    return;
  }
  user.updated_at = new Date().toISOString();
  log('account_modified', `Modified account "${user.full_name}".`, { user_id: user.id, email: user.email, contact_number: user.contact_number, role: user.role, organization_id: user.organization_id });
  closeDialog('accountEditModal');
  await persist('Account updated.');
  renderUsers();
}

async function decidePendingAccountRequest(id, decision) {
  if (!canManageAccounts(state.store)) return;
  const request = state.store.accountRequests.find((item) => (item.id || item.request_id) === id);
  try {
    try {
      await decideAccountRequest(id, decision);
    } catch (error) {
      await updateAccountRequestStatus(id, decision, request);
    }
    if (request) {
      request.status = decision;
      request.updated_at = new Date().toISOString();
    }
    await reloadStore();
    if (decision === 'approved' && request) await applyApprovedAccountRequestDetails(request);
    renderUsers();
    showToast(decision === 'approved' ? 'Organization account approved.' : 'Organization account rejected.', 'success');
  } catch (error) {
    showToast(error.message || 'Account request decision failed.', 'error');
  }
}

async function applyApprovedAccountRequestDetails(request) {
  const requestUsername = cleanSingleLine(request.username || '').toLowerCase();
  const requestEmail = cleanSingleLine(accountRequestEmail(request)).toLowerCase();
  const requestPhone = String(accountRequestPhone(request)).replace(/\D/g, '');
  const requestOrganizationName = cleanSingleLine(request.organization_name || request.organizationName || '');
  if (!requestEmail && !requestPhone && !requestOrganizationName) return;
  const user = state.store.users.find((item) =>
    String(item.username || '').toLowerCase() === requestUsername
    || String(accountEmail(item)).toLowerCase() === requestEmail
    || (request.organization_name && item.organization_id && state.store.organizations.find((org) => org.id === item.organization_id && normalizedName(org.organization_name) === normalizedName(request.organization_name)))
  );
  if (!user) return;
  if (requestEmail) {
    user.email = requestEmail;
    user.aup_email = requestEmail;
  }
  if (requestPhone) {
    user.contact_number = requestPhone;
    user.phone_number = requestPhone;
  }
  if (requestOrganizationName) {
    let organization = findOrganization({ id: user.organization_id, name: requestOrganizationName });
    if (!organization) {
      organization = {
        id: request.organization_id || organizationIdentifier(requestOrganizationName),
        organization_name: requestOrganizationName,
        organization_type: 'Student Organization',
        created_at: request.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      state.store.organizations.push(organization);
    }
    user.organization_id = organization.id;
    user.organization_name = organization.organization_name;
    user.organizationName = organization.organization_name;
  }
  user.account_preset = 'organization';
  user.role = 'organization_manager';
  user.account_type = 'org';
  user.updated_at = new Date().toISOString();
  log('account_request_details_saved', `Saved organization account details for "${user.full_name || user.username}".`, { user_id: user.id, email: user.email, contact_number: user.contact_number, organization_name: user.organization_name });
  await persist('Account organization details saved.');
}

function applyAccountSuspension(user, suspended) {
  user.suspended_status = Boolean(suspended);
  user.suspension_status = Boolean(suspended);
  user.suspension_date = suspended ? (user.suspension_date || new Date().toISOString()) : '';
  user.permissions = { ...(user.permissions || {}), enabled: !suspended };
}

function suspendAccount(id) {
  const user = state.store.users.find((item) => item.id === id);
  if (!user || !canManageAccounts(state.store)) return;
  if (user.id === currentUser(state.store).id) return showToast('You cannot suspend the active Manager account.', 'error');
  const suspended = !(user.suspended_status || user.suspension_status);
  applyAccountSuspension(user, suspended);
  user.updated_at = new Date().toISOString();
  log(suspended ? 'account_suspended' : 'account_reactivated', `${suspended ? 'Suspended' : 'Reactivated'} account "${user.full_name}".`, { user_id: user.id, suspension_date: user.suspension_date });
  persist(suspended ? 'Account suspended.' : 'Account reactivated.');
  renderUsers();
}

function deleteAccount(id) {
  const user = state.store.users.find((item) => item.id === id);
  if (!user || !canManageAccounts(state.store)) return;
  if (user.id === currentUser(state.store).id) return showToast('You cannot delete the active Manager account.', 'error');
  confirmAction(`Delete account "${user.full_name}"?`, async () => {
    const deleted = { ...user, deleted_at: new Date().toISOString(), deleted_by: currentUser(state.store).id };
    state.store.users = state.store.users.filter((item) => item.id !== id);
    log('account_deleted', `Deleted account "${deleted.full_name}".`, deleted);
    await persist('Account deleted.');
    renderUsers();
  });
}

function applyAccountPreset(user, presetName) {
  const preset = ACCOUNT_PRESETS[presetName] || ACCOUNT_PRESETS.organization;
  user.account_preset = ACCOUNT_PRESETS[presetName] ? presetName : 'organization';
  user.role = preset.role;
  user.account_type = user.account_preset === 'organization' ? 'org' : user.account_preset === 'head_events' ? 'OIC' : 'CSC';
  user.permissions = { ...preset.permissions };
}

function openActivityLog() {
  if (!requirePermission(canManageAccounts(state.store), 'Only the Manager can view logs.')) return;
  $('activityList').innerHTML = [...state.store.activityLogs].reverse().map(activityLogHtml).join('') || empty('No activity logs');
  openDialog('activityLogModal');
}

function activityLogHtml(item) {
  const changes = auditChangeSummary(item.previous_values, item.new_values);
  return `<div class="activity-item"><strong>${escapeHtml(cap(String(item.action || '').split('_').join(' ')))}</strong><p>${escapeHtml(formatDateTime(item.created_at))}</p><p>${escapeHtml(item.description)}</p><p>${escapeHtml(item.performed_by)} - ${escapeHtml(roleLabel(item.performed_by_role))}</p>${changes ? `<p>Changed: ${escapeHtml(changes)}</p>` : ''}</div>`;
}

function auditChangeSummary(previousValues, nextValues) {
  if (!previousValues || !nextValues || typeof previousValues !== 'object' || typeof nextValues !== 'object') return '';
  return Object.keys(nextValues)
    .filter((key) => previousValues[key] !== nextValues[key])
    .map((key) => key.replace(/_/g, ' '))
    .join(', ');
}

function handleListAction(event) {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const { action, id } = button.dataset;
  const handler = LIST_ACTIONS[action];
  const permission = LIST_ACTION_PERMISSIONS[action];
  if (!handler || (permission && !requirePermission(permission.allowed(), permission.message))) return;
  handler(id);
}

const LIST_ACTION_PERMISSIONS = {
  'event-approve': { allowed: () => canApproveEvents(state.store), message: 'This account cannot review event requests.' },
  'event-reject': { allowed: () => canApproveEvents(state.store), message: 'This account cannot review event requests.' },
  'announcement-edit': { allowed: () => canManageAnnouncements(state.store), message: 'This account cannot manage announcements.' },
  'announcement-delete': { allowed: () => canManageAnnouncements(state.store), message: 'This account cannot manage announcements.' },
  'announcement-hide': { allowed: () => canManageAnnouncements(state.store), message: 'This account cannot manage announcements.' },
  'announcement-show': { allowed: () => canManageAnnouncements(state.store), message: 'This account cannot manage announcements.' },
  'block-edit': { allowed: () => canManageBlockedTimes(state.store), message: 'This account cannot manage blocked times.' },
  'block-delete': { allowed: () => canManageBlockedTimes(state.store), message: 'This account cannot manage blocked times.' },
  'category-toggle': { allowed: () => canManageCategories(state.store), message: 'This account cannot manage categories.' },
  'category-delete': { allowed: () => canManageCategories(state.store), message: 'This account cannot manage categories.' },
  'account-edit': { allowed: () => canManageAccounts(state.store), message: 'Only the Manager can manage accounts.' },
  'account-suspend': { allowed: () => canManageAccounts(state.store), message: 'Only the Manager can manage accounts.' },
  'account-delete': { allowed: () => canManageAccounts(state.store), message: 'Only the Manager can manage accounts.' },
  'account-request-approve': { allowed: () => canManageAccounts(state.store), message: 'Only the Manager can approve accounts.' },
  'account-request-reject': { allowed: () => canManageAccounts(state.store), message: 'Only the Manager can reject accounts.' },
  'notification-read': { allowed: () => !isPublic(state.store), message: 'Login to manage notifications.' },
  'notification-open': { allowed: () => !isPublic(state.store), message: 'Login to view schedule notifications.' },
  'concern-review': { allowed: () => canApproveEvents(state.store), message: 'This account cannot respond to concerns.' },
  'concern-resolve': { allowed: () => canApproveEvents(state.store), message: 'This account cannot respond to concerns.' },
  'concern-reject': { allowed: () => canApproveEvents(state.store), message: 'This account cannot respond to concerns.' }
};

const LIST_ACTIONS = {
  'event-view': viewEventRequest,
  'event-approve': (id) => reviewEventRequest(id, 'approved'),
  'event-reject': (id) => reviewEventRequest(id, 'rejected'),
  'announcement-edit': loadAnnouncementEditor,
  'announcement-delete': (id) => confirmAction('Delete this announcement?', () => removeById('announcements', id, 'announcement_deleted', 'Announcement deleted.')),
  'announcement-hide': (id) => setAnnouncementVisibility(id, 'hidden'),
  'announcement-show': (id) => setAnnouncementVisibility(id, 'show'),
  'block-edit': editBlockedTime,
  'block-delete': (id) => confirmAction('Remove this blocked period?', () => removeBlockedTime(id)),
  'category-toggle': toggleCategory,
  'category-delete': (id) => confirmAction('Delete this category?', () => removeById('categories', id, 'category_deleted', 'Category deleted.')),
  'organization-delete': confirmOrganizationDelete,
  'account-edit': openAccountEditor,
  'account-suspend': suspendAccount,
  'account-delete': deleteAccount,
  'account-request-approve': (id) => decidePendingAccountRequest(id, 'approved'),
  'account-request-reject': (id) => decidePendingAccountRequest(id, 'rejected'),
  'notification-read': markNotificationRead,
  'notification-open': openNotificationSchedule,
  'concern-review': reviewConcern,
  'concern-resolve': (id) => updateConcernStatus(id, 'resolved', 'concern_resolved', 'Concern resolved.'),
  'concern-reject': (id) => updateConcernStatus(id, 'rejected', 'concern_rejected', 'Concern rejected.')
};

function viewEventRequest(id) {
  const item = state.store.events.find((event) => event.id === id);
  if (item) openDetails({ type: 'event', record: item });
}

function openNotificationSchedule(id) {
  const notification = (state.store.notifications || []).find((item) => item.notification_id === id);
  if (!notification || notification.user_id !== currentUser(state.store).id) return;
  const schedule = state.store.events.find((item) => item.id === notification.reference_id);
  if (!schedule) return showToast('This schedule is no longer available.', 'error');
  notification.is_read = true;
  closeDialog('notificationsModal');
  openDetails({ type: 'event', record: schedule });
  void persist('Notification marked as read.');
}

function reviewEventRequest(id, status) {
  const item = state.store.events.find((event) => event.id === id);
  if (!item) return;
  reviewEvent(item, status);
  renderEventRequests();
}

function toggleCategory(id) {
  const item = state.store.categories.find((category) => category.id === id);
  if (!item) return;
  item.active = !item.active;
  log('category_updated', `Changed category "${item.name}".`, item);
  persist('Category updated.');
  renderCategories();
}

function confirmOrganizationDelete(id) {
  if (!requirePermission(canManageAccounts(state.store), 'Only the Manager can manage organizations.')) return;
  confirmAction('Delete this organization? Assigned users will become unassigned.', () => {
    state.store.users.forEach((user) => {
      if (user.organization_id === id) user.organization_id = null;
    });
    removeById('organizations', id, 'organization_deleted', 'Organization deleted.');
  });
}

function reviewConcern(id) {
  const item = state.store.concerns.find((concern) => concern.id === id);
  if (!item) return;
  const response = prompt('Admin response:', item.admin_response || '');
  if (response === null) return;
  const adminResponse = cleanMultiline(response);
  const textError = textLimitError(adminResponse, TEXT_LIMITS.concernResponse, 'Concern response');
  if (textError) return showToast(textError, 'error');
  item.admin_response = adminResponse;
  updateConcernStatus(
    id,
    'in_review',
    'concern_responded',
    'Concern response saved.',
    `Responded to "${item.title}".`
  );
}

function updateConcernStatus(id, status, action, message, description) {
  const item = state.store.concerns.find((concern) => concern.id === id);
  if (!item) return;
  item.status = status;
  item.updated_at = new Date().toISOString();
  notifyConcernOwner(item, action === 'concern_responded' ? 'Concern Reply' : 'Concern Status Updated', action === 'concern_responded' ? `Admin replied to "${item.title}": ${item.admin_response || 'No message provided.'}` : `Concern "${item.title}" was marked ${cap(status)}.`);
  log(action, description || `${message.replace(/\.$/, '')} "${item.title}".`, item);
  persist(message);
  renderConcerns();
}

function notifyConcernOwner(concern, title, message) {
  state.store.users
    .filter((user) => user.organization_id === concern.organization_id && user.role === 'organization_manager')
    .forEach((user) => createNotification({
      user_id: user.id,
      notification_type: 'concern_update',
      reference_id: concern.id,
      title,
      message
    }));
}

async function removeById(collection, id, action, message) {
  const item = state.store[collection].find((entry) => entry.id === id);
  if (!item) return;
  try {
    await deleteRecord(collection, id);
    state.store[collection] = state.store[collection].filter((entry) => entry.id !== id);
    log(action, message, item);
    await persist(message);
    renderCollection(collection);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function renderCollection(collection) {
  const renderers = {
    announcements: renderAnnouncements,
    blockedTimes: renderBlockedTimes,
    categories: renderCategories,
    organizations: renderOrganizations
  };
  if (renderers[collection]) renderers[collection]();
}
function confirmAction(message, action) { state.confirmAction = action; $('confirmMessage').textContent = message; openDialog('confirmModal'); }
function confirmPendingAction() { const action = state.confirmAction; state.confirmAction = null; closeDialog('confirmModal'); action?.(); }

function updateFilters() {
  state.filters = Object.fromEntries(FILTER_IDS.map((id) => [filterKey(id), cleanSingleLine($(id).value)]));
  if ($('headerOrganizationFilter')) $('headerOrganizationFilter').value = state.filters.organization;
  refreshCalendar();
}

function resetFilters() {
  FILTER_IDS.forEach((id) => { $(id).value = ''; });
  updateFilters();
  renderFilterOptions();
}

function filterKey(id) {
  return id.replace(/^filter/, '').replace(/^\w/, (letter) => letter.toLowerCase());
}

function updateAvailability() {
  const status = $('availabilityStatus');
  const detail = $('availabilityDetail');
  if (!status || !detail) return;
  const now = new Date();
  const activeEvents = state.store.events.filter((item) => item.approval_status === 'approved' && isPublicEvent(item)).flatMap((event) => eventOccurrences(event).map((occurrence) => ({ ...occurrence, title: event.title, venue: event.venue })));
  const active = [...activeEvents, ...state.store.blockedTimes].find((item) => overlaps(now, addMinutes(now, 1), item.start_time, item.end_time));
  status.textContent = active ? `Active Until ${formatTime(active.end_time)}` : 'Public Events Overview';
  detail.textContent = active?.venue ? `${active.title} at ${active.venue}` : active ? 'A university block is active.' : '';
}
function changeView(view) {
  if (isPublic(state.store)) {
    state.calendar.changeView('dayGridMonth');
  } else if (view === 'multiMonthYear') {
    state.portalViewMode = 'multiMonthYear';
    state.calendar.changeView('multiMonthYear');
  } else if (view === 'timeGridWeek') {
    state.portalViewMode = 'timeGridWeek';
    state.calendar.changeView('timeGridWeek');
  } else {
    returnToCurrentWeek();
  }
  const selector = $('viewSelector');
  if (selector) selector.value = portalSelectorValue();
  setTimeout(() => state.calendar.updateSize(), 0);
}

function returnToCurrentWeek() {
  state.portalViewMode = 'today';
  state.calendar.changeView('dayGridMonth');
  state.calendar.today();
}

function portalSelectorValue() {
  if (state.portalViewMode === 'multiMonthYear') return 'multiMonthYear';
  if (state.portalViewMode === 'timeGridWeek') return 'timeGridWeek';
  return 'today';
}
function bindCalendarResizeObserver() {
  if (!window.ResizeObserver || state.resizeObserver) return;
  const panel = $('calendar') && $('calendar').parentElement;
  if (!panel) return;
  state.resizeObserver = new ResizeObserver(() => scheduleCalendarResize(60));
  state.resizeObserver.observe(panel);
}
function scheduleCalendarResize(delay = 0) {
  clearTimeout(state.resizeTimer);
  state.resizeTimer = setTimeout(() => {
    if (!state.calendar) return;
    state.calendar.updateSize();
    requestAnimationFrame(() => state.calendar && state.calendar.updateSize());
  }, delay);
}
function handleResize() {
  if (!state.calendar) return;
  closePublicDayDialog();
  closeSidebar();
  if (!MOBILE_VIEWS.has(state.calendar.view.type)) state.calendar.changeView('timeGridWeek');
  scheduleCalendarResize(0);
}
function openSidebar() { $('sidebar').classList.add('open'); $('mobileScrim').classList.add('open'); }
function closeSidebar() { $('sidebar').classList.remove('open'); $('mobileScrim').classList.remove('open'); }

async function login(event) {
  event.preventDefault();
  const username = cleanSingleLine($('loginUsername').value).toLowerCase();
  if (!USERNAME_PATTERN.test(username)) return showToast('Use a valid username.', 'error');
  try {
    await authenticate(username, $('loginPassword').value);
    await reloadStore();
    const user = currentUser(state.store);
    if (user.role === 'public_viewer') {
      clearSession();
      await reloadStore();
      return showToast('This account is still awaiting admin approval.', 'error');
    }
    event.target.reset(); closeDialog('loginModal');
    showToast(`Logged in as ${user.full_name}.`, 'success');
    scheduleMobileAnnouncementPopup(true);
  } catch (error) { showToast(error.message, 'error'); }
}
async function logout() {
  const loginHref = isSuperAdmin(state.store) ? 'admin-login.html' : 'org/index.html';
  clearSession();
  window.location.href = loginHref;
}
async function registerAccount(event) {
  event.preventDefault();
  const username = cleanSingleLine($('registerUsername').value);
  const password = $('registerPassword').value;
  const fullName = cleanSingleLine($('registerFullName').value);
  const email = cleanSingleLine($('registerAupEmail').value).toLowerCase();
  const phoneNumber = String($('registerPhone').value || '').replace(/\D/g, '');
  const organizationName = cleanSingleLine($('registerOrganizationName').value);
  if (!email.endsWith('@aup.edu.ph')) return showToast('Use your AUP email address.', 'error');
  if (!/^\d{11}$/.test(phoneNumber)) return showToast('Phone number must be exactly 11 digits.', 'error');
  if (password.length < 10 || password.length > 128) return showToast('Password must be 10 to 128 characters.', 'error');
  if (!fullName || !username || !organizationName) return showToast('Name, username, and organization name are required.', 'error');
  const textError = firstTextLimitError([
    [fullName, TEXT_LIMITS.fullName, 'Full name'],
    [username, TEXT_LIMITS.fullName, 'Username'],
    [organizationName, TEXT_LIMITS.organizationName, 'Organization name']
  ]);
  if (textError) return showToast(textError, 'error');
  try {
    await requestAccount({ username, password, fullName, organizationName, email, phoneNumber });
    event.target.reset(); updateRegistrationFields(); closeDialog('registerModal');
    showToast('Account request submitted for admin approval.', 'success');
  } catch (error) { showToast(error.message, 'error'); }
}
function updateRegistrationFields() {
  $('registerOrganizationWrap').hidden = false;
  $('registerOrganizationName').required = true;
}
async function reloadStore() {
  state.store = (await loadStore()).store;
  renderAll();
  refreshCalendar();
}

function startStoreSync() {
  if (state.storeSyncTimer) window.clearInterval(state.storeSyncTimer);
  state.storeSyncTimer = window.setInterval(syncStoreFromBackend, STORE_SYNC_INTERVAL_MS);
  if (!state.storeSyncChannel && typeof BroadcastChannel !== 'undefined') {
    state.storeSyncChannel = new BroadcastChannel('csc-sync-store');
    state.storeSyncChannel.addEventListener('message', () => { if (!document.hidden) syncStoreFromBackend(); });
  }
}

async function syncStoreFromBackend() {
  if (state.storeSyncing || document.hidden || document.querySelector('dialog[open]')) return;
  state.storeSyncing = true;
  try {
    await reloadStore();
  } catch (error) {
    console.warn('CONNECT portal background refresh failed:', error);
  } finally {
    state.storeSyncing = false;
  }
}
function openDialog(id) {
  $(id).showModal();
  closeSidebar();
}

function closeDialog(id) {
  const dialog = $(id);
  if (dialog && dialog.open) dialog.close();
}

function scheduleMobileAnnouncementPopup(force = false) {
  if (!state.store || isPublic(state.store) || isSuperAdmin(state.store) || window.innerWidth > MOBILE_BREAKPOINT) {
    sessionStorage.removeItem(MOBILE_ANNOUNCEMENT_LOGIN_FLAG);
    return;
  }
  const loginRedirectForce = sessionStorage.getItem(MOBILE_ANNOUNCEMENT_LOGIN_FLAG) === '1';
  sessionStorage.removeItem(MOBILE_ANNOUNCEMENT_LOGIN_FLAG);
  const user = currentUser(state.store);
  const storageKey = `connect_mobile_announcements_seen_${user.id || 'user'}`;
  if (!force && !loginRedirectForce && sessionStorage.getItem(storageKey)) return;
  sessionStorage.setItem(storageKey, '1');
  window.setTimeout(() => {
    if (window.innerWidth > MOBILE_BREAKPOINT || document.querySelector('dialog[open]')) return;
    renderAnnouncements();
    openDialog('announcementsModal');
  }, 450);
}

function requirePermission(ok, message) {
  if (!ok) showToast(message, 'error');
  return ok;
}

function showToast(message, type = 'info') {
  const openDialogs = [...document.querySelectorAll('dialog[open]')];
  const host = openDialogs.length ? openDialogs[openDialogs.length - 1] : document.body;
  const region = $('toastRegion');
  host.appendChild(region);

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  region.appendChild(toast);
  setTimeout(() => toast.remove(), 4200);
}

function fillSelect(id, options, selectedValue = '') {
  const select = $(id);
  if (!select) return;
  select.innerHTML = options.map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join('');
  select.value = selectedValue || '';
}

function setHidden(id, hidden) {
  const element = $(id);
  if (element) element.hidden = hidden;
}

function actionButton(action, id, label, className) {
  return `<button type="button" class="${escapeHtml(className)}" data-action="${escapeHtml(action)}" data-id="${escapeHtml(id)}">${escapeHtml(label)}</button>`;
}

function empty(text) { return `<div class="activity-item"><strong>${escapeHtml(text)}</strong></div>`; }
function privacyLabel(value) {
  return value === 'internal' ? 'Admin only' : 'Public';
}

function detailValueHasContent(value) {
  return value != null && String(value).trim() !== '';
}

function rows(data) {
  return Object.entries(data)
    .filter(([, value]) => detailValueHasContent(value))
    .map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`)
    .join('');
}
function cap(value) { return String(value || '').split('_').join(' ').replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function roleLabel(value) { return cap(value); }
function initials(value) { return String(value || 'PV').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join(''); }
function classToken(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9_-]/g, ''); }
function safeCssColor(value, fallback = '#64748B') { return isCssColor(value) ? value : fallback; }
function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[char]));
}
function localIso(date, time) { const value = new Date(`${date}T${time}:00`); return Number.isNaN(value.getTime()) ? '' : value.toISOString(); }
function dateInput(value) { const date = new Date(value); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
function timeInput(value) { return new Date(value).toTimeString().slice(0, 5); }
function formatDateTime(value) { return new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }); }
function formatTime(value) { return new Date(value).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); }
function formatInputTime(value) { if (!value) return 'Choose time'; const [hour, minute] = value.split(':').map(Number); return new Date(2000, 0, 1, hour, minute).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); }
function eventIsActive(event) { return !['cancelled', 'completed', 'draft'].includes(event.event_status); }
function addMinutes(date, minutes) { return new Date(new Date(date).getTime() + minutes * 60000); }
function addDays(date, days) { const value = new Date(date); value.setDate(value.getDate() + days); return value; }
function nextDateInput(date) { return dateInput(addDays(new Date(`${date}T12:00:00`), 1)); }
function dateRange(start, end) { const dates = []; for (let day = new Date(`${start}T12:00:00`); dateInput(day) <= end; day = addDays(day, 1)) dates.push(dateInput(day)); return dates; }
function occurrenceRange(dates, start, end) { return dates.map((date) => ({ id: createId(), date, start_time: localIso(date, start), end_time: localIso(date, end) })); }
function selectionRange(info) {
  const view = state.calendar.view.type;
  if (view === 'timeGridDay') return { start: info.start, end: info.end };
  if (view === 'dayGridMonth') return { occurrences: occurrenceRange(dateRange(dateInput(info.start), dateInput(addMinutes(info.end, -0.001))), '09:00', '10:00') };
  return { start: info.start, end: info.end };
}
function mobileTapRange(info) {
  if (info.allDay) {
    const date = dateInput(info.date);
    return { occurrences: occurrenceRange([date], '09:00', '10:00') };
  }
  const start = info.date;
  return { start, end: addMinutes(start, 60) };
}
function clickedEventDate(info) {
  return calendarDateAtPoint(info.jsEvent.clientX, info.jsEvent.clientY)
    || info.jsEvent.target.closest('.fc-daygrid-day, .fc-timegrid-col')?.dataset.date
    || dateInput(info.event.start);
}
function calendarDateAtPoint(clientX, clientY) {
  const cells = [...document.querySelectorAll('.fc-daygrid-day[data-date], .fc-timegrid-col[data-date]')];
  const match = cells.find((cell) => {
    const rect = cell.getBoundingClientRect();
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  });
  return match?.dataset.date || '';
}
function roundToNextHalfHour(value) { const date = new Date(value); date.setSeconds(0, 0); const minutes = date.getMinutes(); date.setMinutes(minutes <= 30 ? 30 : 60, 0, 0); return date; }
function defaultRange() { let start = roundToNextHalfHour(addMinutes(new Date(), 60)); let end = addMinutes(start, 60); if (dateInput(start) !== dateInput(end)) { start = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1, 9, 0, 0, 0); end = addMinutes(start, 60); } return { start, end }; }
function debounce(callback, delay) { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => callback(...args), delay); }; }
