import { ACCOUNT_PRESETS, createId } from './app-data.js?v=20260607-security-v1';
import { authenticate, clearSession, decideAccountRequest, deleteRecord, loadStore, requestAccount, saveStore } from './supabase-storage.js?v=20260607-security-v1';
import {
  APPROVAL_STATUSES, EVENT_STATUSES, activeAnnouncements, canApproveEvents, canCreateEvents,
  canDeleteEvent, canEditEvent, canManageAccounts, canManageAnnouncements, canManageBlockedTimes,
  canManageCategories, canUpdateOfficeStatus, canUpdatePresidentStatus, canViewPrivateEvent,
  categoryById, currentUser, findApprovedVenueConflict, eventOccurrences, findBlockingTime,
  findVenueConflicts, isManager, isPublic, isPublicEvent, isSuperAdmin, overlaps
} from './app-rules.js?v=20260607-security-v1';

const MOBILE_BREAKPOINT = 768;
const MOBILE_VIEWS = new Set(['timeGridWeek', 'timeGridDay', 'dayGridMonth', 'multiMonthYear', 'listWeek']);
const WEEK_SLOT_START_MINUTES = 7 * 60;
const WEEK_SLOT_END_MINUTES = 21 * 60;
const WEEK_SNAP_MINUTES = 15;
const monthSpanLabels = new Set();
const $ = (id) => document.getElementById(id);
const FILTER_IDS = ['filterOrganization', 'filterVenue', 'filterCategory', 'filterEventType', 'filterDate', 'filterMonth', 'filterApproval', 'filterEventStatus'];
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
  organizationsButton: canManageAccounts,
  usersButton: canManageAccounts,
  activityLogButton: canManageAccounts,
  updateOfficeStatusButton: canUpdateOfficeStatus,
  updatePresidentStatusButton: canUpdatePresidentStatus
};
const state = {
  store: null,
  calendar: null,
  pendingEvent: null,
  pendingConflictContinuation: null,
  selectedDetails: null,
  confirmAction: null,
  weekSelection: null,
  resizeObserver: null,
  resizeTimer: 0,
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
    todayButton: () => state.calendar.today(),
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
    deleteEventButton: deleteEventFromModal,
    detailsApproveButton: () => reviewSelectedEvent('approved'),
    detailsRejectButton: () => reviewSelectedEvent('rejected'),
    agreementSubmitButton: finishAgreement,
    conflictContinueButton: continueAfterConflict,
    filtersButton: () => openDialog('filtersModal'),
    resetFiltersButton: resetFilters,
    notificationsButton: openNotifications,
    dashboardButton: openDashboard,
    announcementsButton: openAnnouncements,
    concernsButton: openConcerns,
    eventRequestsButton: openEventRequests,
    blockedTimesButton: openBlockedTimes,
    categoriesButton: openCategories,
    organizationsButton: openOrganizations,
    usersButton: openUsers,
    activityLogButton: openActivityLog,
    updateOfficeStatusButton: () => updateAppStatus('incampus_offcampus', 'Incampus & Offcampus'),
    updatePresidentStatusButton: () => updateAppStatus('csc_president', 'CSC President'),
    confirmYesButton: confirmPendingAction
  });
  bindSubmitActions({
    loginForm: login,
    registerForm: registerAccount,
    eventForm: submitEventForm,
    announcementForm: addAnnouncement,
    concernForm: addConcern,
    blockedTimeForm: addBlockedTime,
    categoryForm: addCategory,
    organizationForm: addOrganization
  });
  bindDelegatedLists(['announcementsList', 'concernsList', 'eventRequestsList', 'blockedTimesList', 'categoriesList', 'organizationsList', 'accountRequestsList']);
  FILTER_IDS.forEach((id) => on(id, 'input', updateFilters));
  ['agreeRules', 'agreePrivacy'].forEach((id) => on(id, 'change', updateAgreementButton));
  on('viewSelector', 'change', (event) => changeView(event.target.value));
  on('searchInput', 'input', debounce((event) => { state.search = cleanSingleLine(event.target.value).slice(0, TEXT_LIMITS.search).toLowerCase(); refreshCalendar(); }, 180));
  on('registerRole', 'change', updateRegistrationFields);
  on('eventScheduleType', 'change', updateScheduleType);
  on('occurrenceList', 'click', handleOccurrenceListClick);
  on('blockAllDay', 'change', updateBlockTimeFields);
  on('usersList', 'change', handleUserPermissionChange);
  const closePublicDialogButton = $('closePublicDayDialog');
  if (closePublicDialogButton) closePublicDialogButton.addEventListener('click', closePublicDayDialog);
  $('calendar').addEventListener('pointerdown', startWeekRectangleSelection, true);
  document.addEventListener('pointermove', updateWeekRectangleSelection);
  document.addEventListener('pointerup', finishWeekRectangleSelection);
  document.addEventListener('pointercancel', cancelWeekRectangleSelection);
  document.addEventListener('click', (event) => {
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
    refreshCalendar();
    if (message) showToast(message, 'success');
    return true;
  } catch (error) {
    showToast(`Could not sync Supabase: ${error.message}`, 'error');
    return false;
  }
}

function log(action, description, payload = null) {
  const user = currentUser(state.store);
  state.store.activityLogs.push({ id: createId(), action, description, payload, performed_by: user.full_name, performed_by_role: user.role, created_at: new Date().toISOString() });
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
}

function renderRole() {
  const user = currentUser(state.store);
  document.body.classList.toggle('is-manager', isManager(state.store));
  document.body.classList.toggle('is-super-admin', isSuperAdmin(state.store));
  document.body.classList.toggle('is-public', isPublic(state.store));
  $('profileName').textContent = user.full_name;
  $('profileInitials').textContent = initials(user.full_name);
  Object.entries(PORTAL_TOOL_VISIBILITY).forEach(([id, allowed]) => setHidden(id, !allowed(state.store)));
  if (state.calendar && isPublic(state.store) && state.calendar.view.type !== 'dayGridMonth') state.calendar.changeView('dayGridMonth');
  if (!isPublic(state.store)) closePublicDayDialog();
}

function renderFormOptions() {
  const user = currentUser(state.store);
  const organizations = isManager(state.store) ? state.store.organizations.filter((org) => org.id === user.organization_id) : state.store.organizations;
  fillSelect('eventOrganization', organizations.map((org) => [org.id, org.organization_name]));
  fillSelect('eventCategory', state.store.categories.filter((item) => item.active).map((item) => [item.id, item.name]));
}

function renderFilterOptions() {
  fillSelect('filterOrganization', [['', 'All organizations'], ...state.store.organizations.map((org) => [org.id, org.organization_name])], state.filters.organization);
  fillSelect('filterCategory', [['', 'All categories'], ...state.store.categories.filter((item) => item.active).map((item) => [item.id, item.name])], state.filters.category);
}

function renderStatuses() {
  const office = findStatus('incampus_offcampus');
  const president = findStatus('csc_president');
  $('officeStatusValue').textContent = statusLabel(office);
  $('presidentStatusValue').textContent = statusLabel(president);
}

function findStatus(key) {
  const statuses = Array.isArray(state.store.activityStatuses) ? state.store.activityStatuses : [];
  return statuses.find((item) => item.id === key || item.key === key);
}

function statusLabel(status) {
  if (!status) return 'Status not posted';
  return status.status_label || cap(status.status || '') || 'Status not posted';
}

function initializeCalendar() {
  state.calendar = new FullCalendar.Calendar($('calendar'), {
    initialView: isPublic(state.store) ? 'dayGridMonth' : 'timeGridWeek', firstDay: 1, height: '100%', expandRows: true, nowIndicator: true,
    selectable: true, selectMirror: true, selectMinDistance: 3, longPressDelay: 220, selectLongPressDelay: 220,
    eventLongPressDelay: 300, editable: true, eventResizableFromStart: true, slotEventOverlap: true, slotMinTime: '07:00:00',
    slotMaxTime: '21:00:00', slotDuration: '00:30:00', snapDuration: '00:15:00', allDaySlot: false, dayMaxEvents: false, dayMaxEventRows: false, headerToolbar: false,
    views: { multiMonthYear: { type: 'multiMonth', duration: { months: 12 }, multiMonthMaxColumns: 3 }, listWeek: { buttonText: 'Agenda' } },
    events: (info, success) => { monthSpanLabels.clear(); success(calendarEvents(isConnectedGridFetch(info))); },
    datesSet: (info) => { cancelWeekRectangleSelection(); $('calendarTitle').textContent = info.view.title; $('viewSelector').value = info.view.type; updateAvailability(); },
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

function calendarEvents(monthView = state.calendar?.view.type === 'dayGridMonth') {
  const user = currentUser(state.store);
  const visibleEvents = state.store.events.filter((event) => {
    if (isPublic(state.store)) return event.approval_status === 'approved' && isPublicEvent(event);
    if (isSuperAdmin(state.store)) return true;
    return event.organization_id === user.organization_id || (event.approval_status === 'approved' && isPublicEvent(event));
  }).filter(matchesFilters);
  const weekLineLayout = !monthView && state.calendar?.view.type === 'timeGridWeek' ? buildWeekLineLayout(visibleEvents) : new Map();
  const events = visibleEvents.flatMap((event) => {
    const eventColor = organizationColor(state.store, event);
    const accentColor = eventAccentColor(state.store, event);
    return monthView
      ? connectedMonthEvents(event, eventColor, accentColor)
      : occurrenceCalendarEvents(event, eventColor, accentColor, weekLineLayout);
  });
  const blocks = state.store.blockedTimes.map((block) => ({
    id: block.id,
    title: canManageBlockedTimes(state.store) ? block.title : 'Unavailable',
    start: block.start_time,
    end: block.end_time,
    backgroundColor: '#071C3D',
    borderColor: '#F4B400',
    editable: state.calendar?.view.type !== 'multiMonthYear' && canManageBlockedTimes(state.store),
    classNames: ['event-blocked', 'event-super-admin-block'],
    extendedProps: { type: 'block', record: block }
  }));
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
  const recordId = info.event.extendedProps.record?.id || info.event.id;
  if (monthSpanLabels.has(recordId)) info.el.classList.add('event-month-span-continuation');
  else monthSpanLabels.add(recordId);
}

function isConnectedGridFetch(info) {
  const viewType = info.view?.type || state.calendar?.view?.type;
  if (viewType === 'dayGridMonth' || viewType === 'multiMonthYear') return true;
  return ((info.end - info.start) / 86400000) > 7;
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

function connectedMonthEvents(event, eventColor, accentColor) {
  return groupConsecutiveOccurrences(eventOccurrences(event)).map((group, index) => ({
    id: `${event.id}::month-span-${index}`,
    title: `${event.title} - ${event.organization_name}`,
    start: group[0].date,
    end: nextDateInput(group.at(-1).date),
    allDay: true,
    backgroundColor: eventColor,
    borderColor: eventColor,
    editable: false,
    classNames: ['event-month-span', group.length > 1 ? 'event-month-span-multi' : 'event-month-span-single'],
    extendedProps: { type: 'event', record: event, occurrences: group, accentColor }
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
    occurrences.forEach((occurrence) => {
      if (!parts.has(occurrence.id)) return;
      entries.push({
        key: weekLineKey(event, occurrence),
        date: occurrence.date,
        start: new Date(occurrence.start_time).getTime(),
        end: new Date(occurrence.end_time).getTime()
      });
    });
  });

  const byDate = entries.reduce((groups, entry) => {
    if (!groups.has(entry.date)) groups.set(entry.date, []);
    groups.get(entry.date).push(entry);
    return groups;
  }, new Map());
  const layout = new Map();

  byDate.forEach((dayEntries) => {
    const clusters = overlappingWeekLineClusters(dayEntries);
    clusters.forEach((cluster) => {
      const lanes = [];
      cluster.sort((a, b) => a.start - b.start || a.end - b.end).forEach((entry) => {
        let lane = lanes.findIndex((laneEnd) => laneEnd <= entry.start);
        if (lane < 0) {
          lane = lanes.length;
          lanes.push(entry.end);
        } else {
          lanes[lane] = entry.end;
        }
        entry.lane = lane;
      });
      const count = lanes.length;
      cluster.forEach((entry) => layout.set(entry.key, { lane: entry.lane, count }));
    });
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
  $('eventForm').reset(); $('eventId').value = record?.id || ''; $('eventModalTitle').textContent = record ? 'Edit University Event' : 'Post University Event';
  $('eventOrganization').value = record?.organization_id || currentUser(state.store).organization_id || state.store.organizations[0]?.id || '';
  $('eventCategory').value = record?.category_id || state.store.categories.find((item) => item.active)?.id || '';
  $('eventTitle').value = record?.title || ''; $('eventType').value = record?.event_type || ''; $('eventVenue').value = record?.venue || '';
  const occurrences = record ? eventOccurrences(record) : range.occurrences || [{ id: createId(), start_time: range.start.toISOString(), end_time: range.end.toISOString() }];
  $('eventScheduleType').value = record?.schedule_type || (occurrences.length > 1 ? 'multi_day' : 'single_day');
  $('eventDate').value = dateInput(occurrences[0].start_time); $('eventStart').value = timeInput(occurrences[0].start_time); $('eventEnd').value = timeInput(occurrences[0].end_time);
  $('eventSharedStart').value = timeInput(occurrences[0].start_time); $('eventSharedEnd').value = timeInput(occurrences[0].end_time);
  renderOccurrenceRows(occurrences);
  updateScheduleType();
  $('eventAttendees').value = record?.expected_attendees || ''; $('eventStatus').value = record?.event_status || 'planned';
  $('eventPrivacy').value = record?.privacy_level || 'basic';
  $('eventContactPerson').value = record?.contact_person || currentUser(state.store).full_name; $('eventContactInfo').value = record?.contact_info || '';
  $('eventPublicDescription').value = record?.public_description || ''; $('eventPurpose').value = record?.purpose || '';
  $('eventPrivateNotes').value = record?.private_notes || ''; $('eventAdminNotes').value = record?.admin_notes || ''; $('eventRejectionReason').value = record?.rejection_reason || '';
  $('eventOrganization').disabled = isManager(state.store); $('deleteEventButton').hidden = !canDeleteEvent(state.store, record); $('cancelEventButton').hidden = !record || record.event_status === 'cancelled';
  openDialog('eventModal');
}

function readEventForm() {
  const existing = state.store.events.find((event) => event.id === $('eventId').value);
  const org = state.store.organizations.find((item) => item.id === $('eventOrganization').value);
  const schedule_type = $('eventScheduleType').value;
  const occurrences = schedule_type === 'multi_day' ? readOccurrenceRows() : [{ id: existing?.occurrences?.[0]?.id || createId(), date: $('eventDate').value, start_time: localIso($('eventDate').value, $('eventStart').value), end_time: localIso($('eventDate').value, $('eventEnd').value) }];
  return syncEventRange({
    ...existing, id: existing?.id || createId(), title: cleanSingleLine($('eventTitle').value), event_type: cleanSingleLine($('eventType').value),
    organization_id: org?.id || '', organization_name: org?.organization_name || '', category_id: $('eventCategory').value,
    venue: cleanSingleLine($('eventVenue').value), schedule_type, occurrences,
    expected_attendees: Number($('eventAttendees').value), public_description: cleanMultiline($('eventPublicDescription').value), purpose: cleanMultiline($('eventPurpose').value),
    contact_person: cleanSingleLine($('eventContactPerson').value), contact_info: cleanSingleLine($('eventContactInfo').value), private_notes: cleanMultiline($('eventPrivateNotes').value),
    admin_notes: isSuperAdmin(state.store) ? cleanMultiline($('eventAdminNotes').value) : existing?.admin_notes || '', rejection_reason: canApproveEvents(state.store) ? cleanMultiline($('eventRejectionReason').value) : existing?.rejection_reason || '',
    event_status: $('eventStatus').value, privacy_level: $('eventPrivacy').value, approval_status: isManager(state.store) ? 'approved' : existing?.approval_status || 'approved', created_by: existing?.created_by || currentUser(state.store).id,
    created_at: existing?.created_at || new Date().toISOString(), updated_at: new Date().toISOString(), conflict_event_ids: []
  });
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
  $('singleScheduleFields').hidden = multiDay;
  $('multiScheduleSection').hidden = !multiDay;
  ['eventDate', 'eventStart', 'eventEnd'].forEach((id) => { $(id).required = !multiDay; });
  if (multiDay) ensureOccurrenceRows();
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
  if (block) return showConflict('Blocked Date or Time', `This period has been blocked by the admin. Please choose another date or time.`, [block], false);
  const conflicts = findVenueConflicts(state.store, candidate);
  candidate.conflict_event_ids = conflicts.map((item) => item.id);
  state.pendingEvent = candidate;
  if (conflicts.length) log('event_conflict_warning', `"${candidate.title}" has schedule conflicts.`, { event_id: candidate.id, conflict_ids: candidate.conflict_event_ids });
  openAgreementOrPersist(candidate);
}

function validateEvent(event) {
  if (!event.title || !event.event_type || !event.organization_id || !event.category_id || !event.venue) return 'Complete title, type, organization, category, and venue.';
  const textError = firstTextLimitError([
    [event.title, TEXT_LIMITS.eventTitle, 'Event title'],
    [event.event_type, TEXT_LIMITS.eventType, 'Event type'],
    [event.venue, TEXT_LIMITS.venue, 'Venue'],
    [event.public_description, TEXT_LIMITS.publicDescription, 'Public description'],
    [event.purpose, TEXT_LIMITS.purpose, 'Purpose'],
    [event.contact_person, TEXT_LIMITS.contactPerson, 'Contact person'],
    [event.contact_info, TEXT_LIMITS.contactInfo, 'Contact details'],
    [event.private_notes || '', TEXT_LIMITS.privateNotes, 'Private notes'],
    [event.admin_notes || '', TEXT_LIMITS.adminNotes, 'Admin notes'],
    [event.rejection_reason || '', TEXT_LIMITS.rejectionReason, 'Rejection reason']
  ]);
  if (textError) return textError;
  if (!event.occurrences.length) return 'Add at least one event day.';
  if (event.occurrences.some((item) => !item.date || !/^\d{4}-\d{2}-\d{2}$/.test(item.date))) return 'Each event day needs a valid date.';
  if (event.occurrences.some((item) => !item.start_time || !item.end_time || new Date(item.start_time) >= new Date(item.end_time))) return 'Each event day needs an end time later than its start time.';
  if (new Set(event.occurrences.map((item) => item.date)).size !== event.occurrences.length) return 'Use one schedule row per date.';
  if (!Number.isInteger(event.expected_attendees) || event.expected_attendees < 1 || event.expected_attendees > 99999) return 'Expected attendees must be between 1 and 99999.';
  if (!event.public_description || !event.purpose || !event.contact_person || !event.contact_info) return 'Complete description, purpose, and contact details.';
  if (isManager(state.store) && event.organization_id !== currentUser(state.store).organization_id) return 'Organization managers can only manage their assigned organization.';
  return '';
}

function openAgreementOrPersist(candidate) {
  if (isSuperAdmin(state.store)) return saveEvent(candidate);
  state.pendingEvent = candidate; $('agreeRules').checked = false; $('agreePrivacy').checked = false; updateAgreementButton(); openDialog('agreementModal');
}

function updateAgreementButton() { $('agreementSubmitButton').disabled = !$('agreeRules').checked || !$('agreePrivacy').checked; $('agreementWarning').hidden = !$('agreementSubmitButton').disabled; }
function finishAgreement() { if (!$('agreementSubmitButton').disabled && state.pendingEvent) { closeDialog('agreementModal'); saveEvent(state.pendingEvent); } }

function saveEvent(candidate) {
  if (!requirePermission(canEditEvent(state.store, candidate), 'You cannot save this event.')) return;
  const existingIndex = state.store.events.findIndex((event) => event.id === candidate.id);
  if (existingIndex >= 0) state.store.events[existingIndex] = candidate; else state.store.events.push(candidate);
  log(existingIndex >= 0 ? 'event_updated' : 'event_posted', `${currentUser(state.store).full_name} saved "${candidate.title}".`, candidate);
  closeDialog('eventModal'); state.pendingEvent = null; persist('Event saved.');
}

function openDetails(props) {
  state.selectedDetails = props; const record = props.record;
  if (props.type === 'block') {
    $('detailsTitle').textContent = record.title; $('detailsMeta').textContent = 'Blocked university period';
    $('detailsList').innerHTML = rows({ Date: formatDateTime(record.start_time), End: formatTime(record.end_time), Reason: canManageBlockedTimes(state.store) ? record.reason : 'Unavailable' });
    ['detailsDeleteButton', 'detailsCancelButton', 'detailsEditButton', 'detailsApproveButton', 'detailsRejectButton'].forEach((id) => $(id).hidden = true);
  } else {
    const category = categoryById(state.store, record.category_id); const privateView = canViewPrivateEvent(state.store, record);
    const selectedOccurrence = props.occurrence || eventOccurrences(record)[0];
    const scheduleLabel = selectedOccurrence ? `${formatDateTime(selectedOccurrence.start_time)} to ${formatTime(selectedOccurrence.end_time)}` : scheduleSummary(record);
    const data = { Organization: record.organization_name, Category: category.name, Venue: record.venue, Schedule: scheduleLabel, Approval: cap(record.approval_status), Status: cap(record.event_status), Description: record.public_description };
    if (privateView) Object.assign(data, { Purpose: record.purpose, 'Contact Person': record.contact_person, 'Contact Info': record.contact_info, 'Private Notes': record.private_notes || 'None' });
    if (isSuperAdmin(state.store)) Object.assign(data, { 'Admin Notes': record.admin_notes || 'None', 'Rejection Reason': record.rejection_reason || 'None', Conflicts: record.conflict_event_ids?.length || 0 });
    $('detailsTitle').textContent = record.title; $('detailsMeta').textContent = `${category.name} - ${record.venue}`; $('detailsList').innerHTML = rows(data);
    $('detailsEditButton').hidden = !canEditEvent(state.store, record); $('detailsDeleteButton').hidden = !canDeleteEvent(state.store, record); $('detailsCancelButton').hidden = !canEditEvent(state.store, record) || record.event_status === 'cancelled';
    $('detailsApproveButton').hidden = !canApproveEvents(state.store) || record.approval_status === 'approved'; $('detailsRejectButton').hidden = !canApproveEvents(state.store) || record.approval_status === 'rejected';
  }
  openDialog('detailsModal');
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

function editSelectedEvent() { const event = state.selectedDetails?.record; if (!event) return; closeDialog('detailsModal'); openEventModal({ start: new Date(event.start_time), end: new Date(event.end_time) }, event); }
function cancelSelectedEvent() { const event = state.selectedDetails?.record; if (event) confirmAction(`Cancel "${event.title}"?`, () => cancelEvent(event)); }
function cancelEventFromModal() { const event = state.store.events.find((item) => item.id === $('eventId').value); if (event) confirmAction(`Cancel "${event.title}"?`, () => { cancelEvent(event); closeDialog('eventModal'); }); }
function cancelEvent(event) { event.event_status = 'cancelled'; event.updated_at = new Date().toISOString(); log('event_cancelled', `${currentUser(state.store).full_name} cancelled "${event.title}".`, event); closeDialog('detailsModal'); persist('Event cancelled.'); }
function deleteSelectedEvent() { const event = state.selectedDetails?.record; if (event) confirmDeleteEvent(event); }
function deleteEventFromModal() { const event = state.store.events.find((item) => item.id === $('eventId').value); if (event) confirmDeleteEvent(event); }
function confirmDeleteEvent(event) { if (!requirePermission(canDeleteEvent(state.store, event), 'You cannot delete this event.')) return; confirmAction(`Permanently delete "${event.title}"?`, () => deleteEvent(event)); }
async function deleteEvent(event) {
  const index = state.store.events.findIndex((item) => item.id === event.id);
  if (index < 0) return;

  const deletedEvent = state.store.events[index];
  const logLength = state.store.activityLogs.length;

  try {
    state.store.events.splice(index, 1);
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
    state.store.activityLogs.length = logLength;
    await reloadStore();
    showToast(`Could not delete event: ${error.message}`, 'error');
  }
}

function reviewSelectedEvent(status) { const event = state.selectedDetails?.record; if (event) reviewEvent(event, status); }
function reviewEvent(event, status) {
  if (!requirePermission(canApproveEvents(state.store), 'This account cannot review event requests.')) return;
  if (status === 'approved') {
    const block = findEventBlock(event);
    if (block) return showConflict('Approval Blocked', 'This request overlaps an admin-blocked period.', [block], false);
    const conflict = findApprovedVenueConflict(state.store, event);
    if (conflict) return showConflict('Approval Blocked', 'An approved event already uses this venue and time.', [conflict], false);
  }
  event.approval_status = status; event.updated_at = new Date().toISOString();
  log(`event_request_${status}`, `${currentUser(state.store).full_name} marked "${event.title}" as ${status}.`, event);
  closeDialog('detailsModal'); persist(`Event request ${status}.`);
}

function showConflict(title, subtitle, records, canContinue) {
  $('conflictTitle').textContent = title; $('conflictSubtitle').textContent = subtitle;
  $('conflictBody').innerHTML = records.map((record) => `<p><strong>${escapeHtml(record.title)}</strong><br>${escapeHtml(record.venue || 'University-wide')}<br>${escapeHtml(record.occurrences ? scheduleSummary(record) : `${formatDateTime(record.start_time)} to ${formatTime(record.end_time)}`)}</p>`).join('');
  $('conflictContinueButton').hidden = !canContinue; openDialog('conflictModal');
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

function openAnnouncements() { renderAnnouncements(); openDialog('announcementsModal'); }
function renderAnnouncementPreview() { const first = activeAnnouncements(state.store)[0]; $('announcementPreview').innerHTML = first ? `<div class="notice ${classToken(first.priority)}"><strong>${escapeHtml(first.title)}</strong><p>${escapeHtml(first.content)}</p></div>` : '<p class="empty-text">No active announcements.</p>'; }
function renderAnnouncements() { $('announcementsList').innerHTML = activeAnnouncements(state.store).map((item) => `<div class="activity-item notice ${classToken(item.priority)}"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.content)}</p><p>${escapeHtml(cap(item.priority))} - ${escapeHtml(item.posted_by)} - expires ${escapeHtml(item.expires_at.slice(0, 10))}</p>${canManageAnnouncements(state.store) ? actionButton('announcement-delete', item.id, 'Delete', 'danger-button') : ''}</div>`).join('') || empty('No active announcements'); }
function addAnnouncement(event) {
  event.preventDefault();
  if (!canManageAnnouncements(state.store)) return;
  const title = cleanSingleLine($('announcementTitle').value);
  const content = cleanMultiline($('announcementContent').value);
  const expiry = $('announcementExpiry').value;
  if (!title || !content || !expiry) return showToast('Complete announcement title, content, and expiry date.', 'error');
  const textError = firstTextLimitError([
    [title, TEXT_LIMITS.announcementTitle, 'Announcement title'],
    [content, TEXT_LIMITS.announcementContent, 'Announcement content']
  ]);
  if (textError) return showToast(textError, 'error');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiry)) return showToast('Use a valid announcement expiry date.', 'error');
  const item = { id: createId(), title, content, priority: $('announcementPriority').value, posted_by: currentUser(state.store).full_name, posted_at: new Date().toISOString(), expires_at: `${expiry}T23:59:59` };
  state.store.announcements.push(item);
  log('announcement_posted', `Posted announcement "${item.title}".`, item);
  event.target.reset(); persist('Announcement posted.'); renderAnnouncements();
}

function openNotifications() { renderNotifications(); openDialog('notificationsModal'); }
function renderNotifications() {
  const user = currentUser(state.store);
  const upcomingLimit = addDays(new Date(), 7);
  const ownEvents = isSuperAdmin(state.store) ? state.store.events : state.store.events.filter((item) => item.organization_id === user.organization_id);
  const notices = [
    ...activeAnnouncements(state.store).map((item) => ({ title: `Announcement: ${item.title}`, detail: `${cap(item.priority)} - ${item.content}`, date: item.posted_at })),
    ...state.store.blockedTimes.filter((item) => new Date(item.end_time) >= new Date()).map((item) => ({ title: `Blocked period: ${item.title}`, detail: `${formatDateTime(item.start_time)} to ${formatTime(item.end_time)}`, date: item.created_at })),
    ...ownEvents.filter((item) => eventIsActive(item) && new Date(item.start_time) >= new Date() && new Date(item.start_time) <= upcomingLimit).map((item) => ({ title: `Upcoming event: ${item.title}`, detail: `${item.venue} - ${formatDateTime(item.start_time)}`, date: item.start_time })),
    ...ownEvents.filter((item) => item.conflict_event_ids?.length).map((item) => ({ title: `Conflict warning: ${item.title}`, detail: `${item.conflict_event_ids.length} overlapping event(s) need review.`, date: item.updated_at })),
    ...state.store.concerns.filter((item) => isSuperAdmin(state.store) || item.organization_id === user.organization_id).filter((item) => item.admin_response).map((item) => ({ title: `Concern update: ${item.title}`, detail: `${cap(item.status)} - ${item.admin_response}`, date: item.updated_at }))
  ].sort((a, b) => new Date(b.date) - new Date(a.date));
  $('notificationsList').innerHTML = notices.map((item) => `<div class="activity-item"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.detail)}</p><p>${escapeHtml(formatDateTime(item.date))}</p></div>`).join('') || empty('No notifications right now.');
}

function updateAppStatus(key, label) {
  const allowed = key === 'csc_president' ? canUpdatePresidentStatus(state.store) : canUpdateOfficeStatus(state.store);
  if (!requirePermission(allowed, `This account cannot update ${label} status.`)) return;
  const existing = findStatus(key);
  const next = prompt(`${label} status:`, existing?.status_label || existing?.status || 'Active');
  if (next === null) return;
  const statusLabelValue = cleanSingleLine(next);
  if (!statusLabelValue) return showToast('Status cannot be empty.', 'error');
  const textError = textLimitError(statusLabelValue, TEXT_LIMITS.statusLabel, 'Status');
  if (textError) return showToast(textError, 'error');
  if (!Array.isArray(state.store.activityStatuses)) state.store.activityStatuses = [];
  const item = existing || { id: key, key, created_at: new Date().toISOString() };
  Object.assign(item, {
    status: statusLabelValue.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'active',
    status_label: statusLabelValue,
    updated_at: new Date().toISOString(),
    updated_by: currentUser(state.store).full_name
  });
  if (!existing) state.store.activityStatuses.push(item);
  log('app_status_updated', `${currentUser(state.store).full_name} updated ${label} status to "${statusLabelValue}".`, item);
  persist(`${label} status updated.`);
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
  log('concern_submitted', `${user.full_name} raised "${item.title}".`, item);
  event.target.reset(); persist('Concern submitted.'); renderConcerns();
}

function openDashboard() { if (!requirePermission(!isPublic(state.store), 'Login to view a dashboard.')) return; renderDashboard(); openDialog('dashboardModal'); }
function renderDashboard() { const user = currentUser(state.store); const events = isSuperAdmin(state.store) ? state.store.events : state.store.events.filter((item) => item.organization_id === user.organization_id); const upcoming = events.filter((item) => new Date(item.start_time) >= new Date() && eventIsActive(item)); const metrics = isSuperAdmin(state.store) ? [['All posted events', events.length], ['Upcoming programs', upcoming.length], ['Blocked periods', state.store.blockedTimes.length], ['Announcements', activeAnnouncements(state.store).length], ['Open concerns', state.store.concerns.filter((item) => !['resolved', 'rejected'].includes(item.status)).length], ['Conflict warnings', events.filter((item) => item.conflict_event_ids?.length).length], ['Organizations', state.store.organizations.length]] : [['Upcoming events', upcoming.length], ['Submitted events', events.length], ['Postponed / cancelled', events.filter((item) => ['postponed', 'cancelled'].includes(item.event_status)).length], ['Raised concerns', state.store.concerns.filter((item) => item.organization_id === user.organization_id).length], ['Announcements', activeAnnouncements(state.store).length], ['Blocked periods', state.store.blockedTimes.length]];
  $('dashboardTitle').textContent = isSuperAdmin(state.store) ? 'Admin Dashboard' : 'Organization Dashboard'; $('dashboardGrid').innerHTML = metrics.map(([label, value]) => `<div class="metric"><strong>${value}</strong><span>${escapeHtml(label)}</span></div>`).join('');
  $('dashboardList').innerHTML = upcoming.slice(0, 8).map((item) => `<div class="activity-item"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.venue)} - ${escapeHtml(formatDateTime(item.start_time))}</p></div>`).join('') || empty('No upcoming events');
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
  return `<div class="activity-item"><strong>${escapeHtml(item.title)} <span class="status-pill ${classToken(item.approval_status)}">${escapeHtml(cap(item.approval_status))}</span></strong><p>${escapeHtml(item.organization_name)} - ${escapeHtml(item.venue)} - ${eventOccurrences(item).length} scheduled day(s)</p><p>${escapeHtml(conflictText)}</p>${actionButton('event-view', item.id, 'Details', 'secondary-button')}${actionButton('event-approve', item.id, 'Approve', 'primary-button')}${actionButton('event-reject', item.id, 'Reject', 'secondary-button')}</div>`;
}

function openBlockedTimes() { if (!requirePermission(canManageBlockedTimes(state.store), 'This account cannot manage blocked times.')) return; renderBlockedTimes(); openDialog('blockedTimesModal'); }
function updateBlockTimeFields() { $('blockStart').disabled = $('blockAllDay').checked; $('blockEnd').disabled = $('blockAllDay').checked; }
function addBlockedTime(event) {
  event.preventDefault();
  if (!canManageBlockedTimes(state.store)) return;
  const title = cleanSingleLine($('blockTitle').value);
  const reason = cleanMultiline($('blockReason').value);
  const date = $('blockDate').value;
  const allDay = $('blockAllDay').checked;
  if (!title || !reason || !date) return showToast('Complete blocked-period title, date, and reason.', 'error');
  const textError = firstTextLimitError([
    [title, TEXT_LIMITS.blockTitle, 'Blocked-period title'],
    [reason, TEXT_LIMITS.blockReason, 'Blocked-period reason']
  ]);
  if (textError) return showToast(textError, 'error');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return showToast('Use a valid blocked-period date.', 'error');
  if (!allDay && (!$('blockStart').value || !$('blockEnd').value)) return showToast('Choose start and end times for a partial-day block.', 'error');
  const start = allDay ? `${date}T00:00:00` : localIso(date, $('blockStart').value);
  const end = allDay ? `${date}T23:59:59` : localIso(date, $('blockEnd').value);
  if (!start || !end || new Date(start) >= new Date(end)) return showToast('Blocked-time end must be later than start.', 'error');
  const item = { id: createId(), title, start_time: start, end_time: end, all_day: allDay, reason, created_by: currentUser(state.store).id, created_at: new Date().toISOString() };
  state.store.blockedTimes.push(item);
  log('blocked_time_created', `Added blocked period "${item.title}".`, item);
  event.target.reset(); updateBlockTimeFields(); persist('Blocked period added.'); renderBlockedTimes();
}
function renderBlockedTimes() {
  $('blockedTimesList').innerHTML = state.store.blockedTimes.map(blockedTimeHtml).join('') || empty('No blocked periods');
}

function blockedTimeHtml(item) {
  return `<div class="activity-item"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(formatDateTime(item.start_time))} to ${escapeHtml(formatTime(item.end_time))}</p><p>${escapeHtml(item.reason)}</p>${actionButton('block-delete', item.id, 'Remove', 'danger-button')}</div>`;
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
  const requests = state.store.accountRequests.filter((item) => item.status === 'pending');
  $('accountRequestsList').innerHTML = requests.map(accountRequestHtml).join('') || empty('No pending account requests');
  $('usersList').innerHTML = state.store.users.map(userHtml).join('');
}

function accountRequestHtml(item) {
  return `<div class="activity-item"><strong>${escapeHtml(item.full_name)} <span class="status-pill pending">Pending</span></strong><p>${escapeHtml(roleLabel(item.role))} - @${escapeHtml(item.username)}</p><p>${escapeHtml(item.organization_name || 'No organization')}</p>${actionButton('account-approve', item.id, 'Approve', 'primary-button')}${actionButton('account-reject', item.id, 'Reject', 'danger-button')}</div>`;
}

function userHtml(user) {
  const organization = state.store.organizations.find((org) => org.id === user.organization_id);
  const permissions = user.permissions || {};
  const presetOptions = Object.entries(ACCOUNT_PRESETS).map(([value, preset]) => `<option value="${escapeHtml(value)}"${user.account_preset === value ? ' selected' : ''}>${escapeHtml(preset.label)}</option>`).join('');
  const toggles = ACCOUNT_PERMISSION_FIELDS.map(({ key, label }) => `<label class="permission-toggle"><input type="checkbox" data-account-permission="${escapeHtml(key)}" data-user-id="${escapeHtml(user.id)}"${permissions[key] !== false && permissions[key] ? ' checked' : ''}>${escapeHtml(label)}</label>`).join('');
  return `<div class="activity-item account-card"><div class="account-card-head"><div><strong>${escapeHtml(user.full_name)}</strong><p>@${escapeHtml(user.username)} - ${escapeHtml(roleLabel(user.account_preset || user.role))}</p><p>${escapeHtml(organization ? organization.organization_name : 'No organization')}</p></div><label>Preset<select data-account-preset data-user-id="${escapeHtml(user.id)}">${presetOptions}</select></label></div><div class="permission-grid">${toggles}</div></div>`;
}

const ACCOUNT_PERMISSION_FIELDS = [
  { key: 'enabled', label: 'Account enabled' },
  { key: 'manageAccounts', label: 'Manage accounts' },
  { key: 'approveEvents', label: 'Approve events' },
  { key: 'editAllEvents', label: 'Edit all events' },
  { key: 'deleteAllEvents', label: 'Delete all events' },
  { key: 'manageBlockedTimes', label: 'Manage blocked times' },
  { key: 'manageAnnouncements', label: 'Manage announcements' },
  { key: 'updatePresidentStatus', label: 'Update CSC President status' },
  { key: 'updateOfficeStatus', label: 'Update Incampus/Offcampus status' },
  { key: 'manageCategories', label: 'Manage categories' }
];

async function handleUserPermissionChange(event) {
  if (!canManageAccounts(state.store)) return;
  const target = event.target;
  const user = state.store.users.find((item) => item.id === target.dataset.userId);
  if (!user) return;
  const previousUser = {
    account_preset: user.account_preset,
    role: user.role,
    permissions: { ...(user.permissions || {}) }
  };

  if (target.matches('[data-account-preset]')) {
    applyAccountPreset(user, target.value);
  } else if (target.matches('[data-account-permission]')) {
    user.permissions = { ...user.permissions, [target.dataset.accountPermission]: target.checked };
  } else {
    return;
  }

  if (user.id === currentUser(state.store).id && (!user.permissions.enabled || !user.permissions.manageAccounts || user.role !== 'super_admin')) {
    Object.assign(user, previousUser);
    showToast('The active Manager account must stay enabled with Manage accounts access.', 'error');
    renderUsers();
    return;
  }

  user.updated_at = new Date().toISOString();
  log('account_permissions_updated', `Updated access for ${user.full_name}.`, { user_id: user.id, account_preset: user.account_preset, permissions: user.permissions });
  await persist('Account access updated.');
  renderUsers();
}

function applyAccountPreset(user, presetName) {
  const preset = ACCOUNT_PRESETS[presetName] || ACCOUNT_PRESETS.organization;
  user.account_preset = ACCOUNT_PRESETS[presetName] ? presetName : 'organization';
  user.role = preset.role;
  user.permissions = { ...preset.permissions };
}

function openActivityLog() {
  if (!requirePermission(canManageAccounts(state.store), 'Only the Manager can view logs.')) return;
  $('activityList').innerHTML = [...state.store.activityLogs].reverse().map(activityLogHtml).join('') || empty('No activity logs');
  openDialog('activityLogModal');
}

function activityLogHtml(item) {
  return `<div class="activity-item"><strong>${escapeHtml(cap(String(item.action || '').split('_').join(' ')))}</strong><p>${escapeHtml(formatDateTime(item.created_at))}</p><p>${escapeHtml(item.description)}</p><p>${escapeHtml(item.performed_by)} - ${escapeHtml(roleLabel(item.performed_by_role))}</p></div>`;
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
  'announcement-delete': { allowed: () => canManageAnnouncements(state.store), message: 'This account cannot manage announcements.' },
  'block-delete': { allowed: () => canManageBlockedTimes(state.store), message: 'This account cannot manage blocked times.' },
  'category-toggle': { allowed: () => canManageCategories(state.store), message: 'This account cannot manage categories.' },
  'category-delete': { allowed: () => canManageCategories(state.store), message: 'This account cannot manage categories.' },
  'account-approve': { allowed: () => canManageAccounts(state.store), message: 'Only the Manager can manage accounts.' },
  'account-reject': { allowed: () => canManageAccounts(state.store), message: 'Only the Manager can manage accounts.' },
  'concern-review': { allowed: () => canApproveEvents(state.store), message: 'This account cannot respond to concerns.' },
  'concern-resolve': { allowed: () => canApproveEvents(state.store), message: 'This account cannot respond to concerns.' },
  'concern-reject': { allowed: () => canApproveEvents(state.store), message: 'This account cannot respond to concerns.' }
};

const LIST_ACTIONS = {
  'event-view': viewEventRequest,
  'event-approve': (id) => reviewEventRequest(id, 'approved'),
  'event-reject': (id) => reviewEventRequest(id, 'rejected'),
  'announcement-delete': (id) => confirmAction('Delete this announcement?', () => removeById('announcements', id, 'announcement_deleted', 'Announcement deleted.')),
  'block-delete': (id) => confirmAction('Remove this blocked period?', () => removeById('blockedTimes', id, 'blocked_time_removed', 'Blocked period removed.')),
  'category-toggle': toggleCategory,
  'category-delete': (id) => confirmAction('Delete this category?', () => removeById('categories', id, 'category_deleted', 'Category deleted.')),
  'organization-delete': confirmOrganizationDelete,
  'account-approve': approveAccount,
  'account-reject': rejectAccount,
  'concern-review': reviewConcern,
  'concern-resolve': (id) => updateConcernStatus(id, 'resolved', 'concern_resolved', 'Concern resolved.'),
  'concern-reject': (id) => updateConcernStatus(id, 'rejected', 'concern_rejected', 'Concern rejected.')
};

function viewEventRequest(id) {
  const item = state.store.events.find((event) => event.id === id);
  if (item) openDetails({ type: 'event', record: item });
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
  log(action, description || `${message.replace(/\.$/, '')} "${item.title}".`, item);
  persist(message);
  renderConcerns();
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

function updateAvailability() { const now = new Date(); const activeEvents = state.store.events.filter((item) => item.approval_status === 'approved' && isPublicEvent(item)).flatMap((event) => eventOccurrences(event).map((occurrence) => ({ ...occurrence, title: event.title, venue: event.venue }))); const active = [...activeEvents, ...state.store.blockedTimes].find((item) => overlaps(now, addMinutes(now, 1), item.start_time, item.end_time)); $('availabilityStatus').textContent = active ? `Active Until ${formatTime(active.end_time)}` : 'Public Events Overview'; $('availabilityDetail').textContent = active?.venue ? `${active.title} at ${active.venue}` : active ? 'A university block is active.' : ''; }
function changeView(view) { state.calendar.changeView(isPublic(state.store) ? 'dayGridMonth' : MOBILE_VIEWS.has(view) ? view : 'timeGridWeek'); setTimeout(() => state.calendar.updateSize(), 0); }
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
  } catch (error) { showToast(error.message, 'error'); }
}
async function logout() {
  clearSession();
  await reloadStore();
  closeSidebar();
  showToast('Continuing as Public Viewer.', 'success');
}
async function registerAccount(event) {
  event.preventDefault();
  const username = cleanSingleLine($('registerUsername').value).toLowerCase();
  const password = $('registerPassword').value;
  const fullName = cleanSingleLine($('registerFullName').value);
  const organizationName = cleanSingleLine($('registerOrganizationName').value);
  if (!USERNAME_PATTERN.test(username)) return showToast('Username can use 3-32 letters, numbers, dots, hyphens, or underscores.', 'error');
  if (password.length < 10 || password.length > 128) return showToast('Password must be 10 to 128 characters.', 'error');
  if (!fullName || !organizationName) return showToast('Full name and organization name are required.', 'error');
  const textError = firstTextLimitError([
    [fullName, TEXT_LIMITS.fullName, 'Full name'],
    [organizationName, TEXT_LIMITS.organizationName, 'Organization name']
  ]);
  if (textError) return showToast(textError, 'error');
  try {
    await requestAccount({ username, password, fullName, organizationName });
    event.target.reset(); updateRegistrationFields(); closeDialog('registerModal');
    showToast('Account request submitted for admin approval.', 'success');
  } catch (error) { showToast(error.message, 'error'); }
}
function updateRegistrationFields() {
  $('registerOrganizationWrap').hidden = false;
  $('registerOrganizationName').required = true;
}
async function approveAccount(id) {
  try { await decideAccountRequest(id, 'approved'); await reloadStore(); renderUsers(); showToast('Account request approved.', 'success'); }
  catch (error) { showToast(error.message, 'error'); }
}
async function rejectAccount(id) {
  try { await decideAccountRequest(id, 'rejected'); await reloadStore(); renderUsers(); showToast('Account request rejected.', 'success'); }
  catch (error) { showToast(error.message, 'error'); }
}
async function reloadStore() {
  state.store = (await loadStore()).store;
  renderAll();
  refreshCalendar();
}
function openDialog(id) {
  $(id).showModal();
  closeSidebar();
}

function closeDialog(id) {
  const dialog = $(id);
  if (dialog && dialog.open) dialog.close();
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
function rows(data) { return Object.entries(data).map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value == null ? '' : value)}</dd>`).join(''); }
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
