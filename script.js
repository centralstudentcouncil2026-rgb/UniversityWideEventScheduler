import { createId } from './app-data.js?v=20260601-public-month-v2';
import { authenticate, clearSession, decideAccountRequest, deleteRecord, loadStore, requestAccount, saveStore } from './supabase-storage.js?v=20260602-jwt-refresh-v1';
import {
  APPROVAL_STATUSES, EVENT_STATUSES, activeAnnouncements, canCreateEvents,
  canEditEvent, canViewPrivateEvent, categoryById, currentUser, findApprovedVenueConflict,
  eventOccurrences, findBlockingTime, findVenueConflicts, isManager, isPublic, isPublicEvent, isSuperAdmin, overlaps
} from './app-rules.js?v=20260601-public-month-v2';

const MOBILE_BREAKPOINT = 768;
const MOBILE_VIEWS = new Set(['timeGridWeek', 'timeGridDay', 'dayGridMonth', 'multiMonthYear', 'listWeek']);
const $ = (id) => document.getElementById(id);
const state = {
  store: null,
  calendar: null,
  pendingEvent: null,
  pendingConflictContinuation: null,
  selectedDetails: null,
  confirmAction: null,
  filters: { organization: '', venue: '', category: '', eventType: '', date: '', month: '', approval: '', eventStatus: '' },
  selectedPublicDate: '',
  search: ''
};

document.addEventListener('DOMContentLoaded', init);

async function init() {
  const { store, notice, noticeType } = await loadStore();
  state.store = store;
  bindEvents();
  populateStaticOptions();
  renderAll();
  initializeCalendar();
  refreshCalendar();
  if (notice) showToast(notice, noticeType);
}

function bindEvents() {
  $('todayButton').addEventListener('click', () => state.calendar.today());
  $('prevButton').addEventListener('click', () => state.calendar.prev());
  $('nextButton').addEventListener('click', () => state.calendar.next());
  $('viewSelector').addEventListener('change', (event) => changeView(event.target.value));
  $('searchInput').addEventListener('input', debounce((event) => { state.search = event.target.value.trim().toLowerCase(); refreshCalendar(); }, 180));
  $('searchToggle').addEventListener('click', () => { $('searchWrap').classList.toggle('open'); $('searchInput').focus(); });
  $('profileButton').addEventListener('click', () => openDialog('loginModal'));
  $('loginButton').addEventListener('click', () => openDialog('loginModal'));
  $('logoutButton').addEventListener('click', logout);
  $('loginForm').addEventListener('submit', login);
  $('registerButton').addEventListener('click', () => openDialog('registerModal'));
  $('registerForm').addEventListener('submit', registerAccount);
  $('registerRole').addEventListener('change', updateRegistrationFields);
  $('mobileMenuButton').addEventListener('click', openSidebar);
  $('mobileScrim').addEventListener('click', closeSidebar);
  $('createEventButton').addEventListener('click', () => openEventModal(defaultRange()));
  $('eventForm').addEventListener('submit', submitEventForm);
  $('eventScheduleType').addEventListener('change', updateScheduleType);
  $('addOccurrenceButton').addEventListener('click', () => addOccurrenceRow());
  $('applySharedTimesButton').addEventListener('click', applySharedTimes);
  $('occurrenceList').addEventListener('click', (event) => { if (event.target.matches('[data-remove-occurrence]')) { event.target.closest('.occurrence-row').remove(); ensureOccurrenceRows(); } });
  $('cancelEventButton').addEventListener('click', cancelEventFromModal);
  $('detailsEditButton').addEventListener('click', editSelectedEvent);
  $('detailsCancelButton').addEventListener('click', cancelSelectedEvent);
  $('detailsDeleteButton').addEventListener('click', deleteSelectedEvent);
  $('deleteEventButton').addEventListener('click', deleteEventFromModal);
  $('detailsApproveButton').addEventListener('click', () => reviewSelectedEvent('approved'));
  $('detailsRejectButton').addEventListener('click', () => reviewSelectedEvent('rejected'));
  $('agreeRules').addEventListener('change', updateAgreementButton);
  $('agreePrivacy').addEventListener('change', updateAgreementButton);
  $('agreementSubmitButton').addEventListener('click', finishAgreement);
  $('conflictContinueButton').addEventListener('click', continueAfterConflict);
  $('filtersButton').addEventListener('click', () => openDialog('filtersModal'));
  ['filterOrganization', 'filterVenue', 'filterCategory', 'filterEventType', 'filterDate', 'filterMonth', 'filterApproval', 'filterEventStatus'].forEach((id) => $(id).addEventListener('input', updateFilters));
  $('resetFiltersButton').addEventListener('click', resetFilters);
  $('notificationsButton').addEventListener('click', openNotifications);
  $('dashboardButton').addEventListener('click', openDashboard);
  $('announcementsButton').addEventListener('click', openAnnouncements);
  $('announcementForm').addEventListener('submit', addAnnouncement);
  $('announcementsList').addEventListener('click', handleListAction);
  $('concernsButton').addEventListener('click', openConcerns);
  $('concernForm').addEventListener('submit', addConcern);
  $('concernsList').addEventListener('click', handleListAction);
  $('eventRequestsButton').addEventListener('click', openEventRequests);
  $('eventRequestsList').addEventListener('click', handleListAction);
  $('blockedTimesButton').addEventListener('click', openBlockedTimes);
  $('blockedTimeForm').addEventListener('submit', addBlockedTime);
  $('blockAllDay').addEventListener('change', updateBlockTimeFields);
  $('blockedTimesList').addEventListener('click', handleListAction);
  $('categoriesButton').addEventListener('click', openCategories);
  $('categoryForm').addEventListener('submit', addCategory);
  $('categoriesList').addEventListener('click', handleListAction);
  $('organizationsButton').addEventListener('click', openOrganizations);
  $('organizationForm').addEventListener('submit', addOrganization);
  $('organizationsList').addEventListener('click', handleListAction);
  $('usersButton').addEventListener('click', openUsers);
  $('accountRequestsList').addEventListener('click', handleListAction);
  $('activityLogButton').addEventListener('click', openActivityLog);
  $('confirmYesButton').addEventListener('click', confirmPendingAction);
  $('closePublicDayPanel').addEventListener('click', closePublicDayPanel);
  document.addEventListener('click', (event) => {
    const closer = event.target.closest('[data-close]');
    if (closer) closeDialog(closer.dataset.close);
  });
  window.addEventListener('resize', debounce(handleResize, 160));
  window.addEventListener('orientationchange', () => setTimeout(handleResize, 260));
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
  if (state.calendar && isPublic(state.store) && state.calendar.view.type !== 'dayGridMonth') state.calendar.changeView('dayGridMonth');
  if (!isPublic(state.store)) closePublicDayPanel();
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

function initializeCalendar() {
  state.calendar = new FullCalendar.Calendar($('calendar'), {
    initialView: isPublic(state.store) ? 'dayGridMonth' : 'timeGridWeek', firstDay: 1, height: '100%', expandRows: true, nowIndicator: true,
    selectable: true, selectMirror: true, selectMinDistance: 3, longPressDelay: 220, selectLongPressDelay: 220,
    eventLongPressDelay: 300, editable: true, eventResizableFromStart: true, slotMinTime: '07:00:00',
    slotMaxTime: '21:00:00', slotDuration: '00:30:00', snapDuration: '00:15:00', allDaySlot: false, headerToolbar: false,
    views: { multiMonthYear: { type: 'multiMonth', duration: { months: 12 }, multiMonthMaxColumns: 3 }, listWeek: { buttonText: 'Agenda' } },
    events: (_info, success) => success(calendarEvents()),
    datesSet: (info) => { $('calendarTitle').textContent = info.view.title; $('viewSelector').value = info.view.type; updateAvailability(); },
    selectAllow: () => !isPublic(state.store) && window.innerWidth > MOBILE_BREAKPOINT && state.calendar.view.type !== 'multiMonthYear',
    select: (info) => { if (!requirePermission(canCreateEvents(state.store), 'Login as an organization manager or super admin to create requests.')) return; openEventModal(selectionRange(info)); state.calendar.unselect(); },
    dateClick: (info) => {
      if (isPublic(state.store)) return openPublicDayPanel(dateInput(info.date));
      if (window.innerWidth > MOBILE_BREAKPOINT || state.calendar.view.type === 'multiMonthYear' || !canCreateEvents(state.store)) return;
      openEventModal(mobileTapRange(info));
    },
    eventClick: (info) => isPublic(state.store) ? openPublicDayPanel(clickedEventDate(info)) : openDetails(info.event.extendedProps),
    eventAllow: (_dropInfo, event) => state.calendar.view.type !== 'multiMonthYear' && (event.extendedProps.type === 'block' ? isSuperAdmin(state.store) : canEditEvent(state.store, event.extendedProps.record)),
    eventDrop: persistMovedCalendarItem, eventResize: persistMovedCalendarItem
  });
  state.calendar.render();
}

function refreshCalendar() {
  state.calendar?.refetchEvents();
  updateAvailability();
  if (state.selectedPublicDate) renderPublicDayPanel();
}

function calendarEvents() {
  const user = currentUser(state.store);
  const events = state.store.events.filter((event) => {
    if (isPublic(state.store)) return event.approval_status === 'approved' && isPublicEvent(event);
    if (isSuperAdmin(state.store)) return true;
    return event.organization_id === user.organization_id || (event.approval_status === 'approved' && isPublicEvent(event));
  }).filter(matchesFilters).flatMap((event) => {
    const category = categoryById(state.store, event.category_id);
    return state.calendar?.view.type === 'dayGridMonth'
      ? connectedMonthEvents(event, category)
      : occurrenceCalendarEvents(event, category);
  });
  const blocks = state.store.blockedTimes.map((block) => ({ id: block.id, title: isSuperAdmin(state.store) ? block.title : 'Unavailable', start: block.start_time, end: block.end_time, backgroundColor: '#071C3D', borderColor: '#071C3D', editable: state.calendar?.view.type !== 'multiMonthYear' && isSuperAdmin(state.store), extendedProps: { type: 'block', record: block } }));
  return [...events, ...blocks];
}

function occurrenceCalendarEvents(event, category) {
  const occurrences = eventOccurrences(event);
  return occurrences.map((occurrence, index) => ({ id: `${event.id}::${occurrence.id}`, title: `${event.title} - ${event.organization_name}${occurrences.length > 1 ? ` (${index + 1}/${occurrences.length})` : ''}`, start: occurrence.start_time, end: occurrence.end_time, backgroundColor: category.color, borderColor: category.color, editable: state.calendar?.view.type !== 'multiMonthYear' && canEditEvent(state.store, event), extendedProps: { type: 'event', record: event, occurrence } }));
}

function connectedMonthEvents(event, category) {
  return groupConsecutiveOccurrences(eventOccurrences(event)).map((group, index) => ({
    id: `${event.id}::month-span-${index}`,
    title: `${event.title} - ${event.organization_name}`,
    start: group[0].date,
    end: nextDateInput(group.at(-1).date),
    allDay: true,
    backgroundColor: category.color,
    borderColor: category.color,
    editable: false,
    classNames: ['event-month-span'],
    extendedProps: { type: 'event', record: event }
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
  $('eventOrganization').disabled = isManager(state.store); $('deleteEventButton').hidden = !record; $('cancelEventButton').hidden = !record || record.event_status === 'cancelled';
  openDialog('eventModal');
}

function readEventForm() {
  const existing = state.store.events.find((event) => event.id === $('eventId').value);
  const org = state.store.organizations.find((item) => item.id === $('eventOrganization').value);
  const schedule_type = $('eventScheduleType').value;
  const occurrences = schedule_type === 'multi_day' ? readOccurrenceRows() : [{ id: existing?.occurrences?.[0]?.id || createId(), date: $('eventDate').value, start_time: localIso($('eventDate').value, $('eventStart').value), end_time: localIso($('eventDate').value, $('eventEnd').value) }];
  return syncEventRange({
    ...existing, id: existing?.id || createId(), title: $('eventTitle').value.trim(), event_type: $('eventType').value.trim(),
    organization_id: org?.id || '', organization_name: org?.organization_name || '', category_id: $('eventCategory').value,
    venue: $('eventVenue').value.trim(), schedule_type, occurrences,
    expected_attendees: Number($('eventAttendees').value), public_description: $('eventPublicDescription').value.trim(), purpose: $('eventPurpose').value.trim(),
    contact_person: $('eventContactPerson').value.trim(), contact_info: $('eventContactInfo').value.trim(), private_notes: $('eventPrivateNotes').value.trim(),
    admin_notes: isSuperAdmin(state.store) ? $('eventAdminNotes').value.trim() : existing?.admin_notes || '', rejection_reason: isSuperAdmin(state.store) ? $('eventRejectionReason').value.trim() : existing?.rejection_reason || '',
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
  row.innerHTML = `<label>Date<input type="date" data-occurrence-date value="${escapeHtml(item.date || '')}" required></label><label>Start Time<input type="time" data-occurrence-start value="${escapeHtml(item.start || $('eventSharedStart').value || '')}" required></label><label>End Time<input type="time" data-occurrence-end value="${escapeHtml(item.end || $('eventSharedEnd').value || '')}" required></label><button type="button" class="icon-button occurrence-remove" data-remove-occurrence title="Remove day">&times;</button>`;
  $('occurrenceList').appendChild(row);
  ensureOccurrenceRows();
}

function ensureOccurrenceRows() {
  if (!$('occurrenceList').children.length) addOccurrenceRow({ date: $('eventDate').value, start: $('eventStart').value, end: $('eventEnd').value });
  const removable = $('occurrenceList').children.length > 1;
  $('occurrenceList').querySelectorAll('[data-remove-occurrence]').forEach((button) => { button.hidden = !removable; });
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
  if (conflicts.length) {
    log('event_conflict_warning', `"${candidate.title}" has schedule conflicts.`, { event_id: candidate.id, conflict_ids: candidate.conflict_event_ids });
    state.pendingConflictContinuation = () => openAgreementOrPersist(candidate);
    return showConflict('Schedule Conflict Warning', 'Another organization has an event during this time. You may continue posting, but review the schedule and venue first.', conflicts, true);
  }
  openAgreementOrPersist(candidate);
}

function validateEvent(event) {
  if (!event.title || !event.event_type || !event.organization_id || !event.category_id || !event.venue) return 'Complete title, type, organization, category, and venue.';
  if (!event.occurrences.length) return 'Add at least one event day.';
  if (event.occurrences.some((item) => !item.start_time || !item.end_time || new Date(item.start_time) >= new Date(item.end_time))) return 'Each event day needs an end time later than its start time.';
  if (new Set(event.occurrences.map((item) => item.date)).size !== event.occurrences.length) return 'Use one schedule row per date.';
  if (!event.expected_attendees || event.expected_attendees < 1) return 'Expected attendees must be greater than zero.';
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
  const existingIndex = state.store.events.findIndex((event) => event.id === candidate.id);
  if (existingIndex >= 0) state.store.events[existingIndex] = candidate; else state.store.events.push(candidate);
  log(existingIndex >= 0 ? 'event_updated' : 'event_posted', `${currentUser(state.store).full_name} saved "${candidate.title}".`, candidate);
  closeDialog('eventModal'); state.pendingEvent = null; persist('Event saved.');
}

function openDetails(props) {
  state.selectedDetails = props; const record = props.record;
  if (props.type === 'block') {
    $('detailsTitle').textContent = record.title; $('detailsMeta').textContent = 'Blocked university period';
    $('detailsList').innerHTML = rows({ Date: formatDateTime(record.start_time), End: formatTime(record.end_time), Reason: isSuperAdmin(state.store) ? record.reason : 'Unavailable' });
    ['detailsDeleteButton', 'detailsCancelButton', 'detailsEditButton', 'detailsApproveButton', 'detailsRejectButton'].forEach((id) => $(id).hidden = true);
  } else {
    const category = categoryById(state.store, record.category_id); const privateView = canViewPrivateEvent(state.store, record);
    const data = { Organization: record.organization_name, Category: category.name, Venue: record.venue, Schedule: scheduleSummary(record), Approval: cap(record.approval_status), Status: cap(record.event_status), Description: record.public_description };
    if (privateView) Object.assign(data, { Purpose: record.purpose, 'Contact Person': record.contact_person, 'Contact Info': record.contact_info, 'Private Notes': record.private_notes || 'None' });
    if (isSuperAdmin(state.store)) Object.assign(data, { 'Admin Notes': record.admin_notes || 'None', 'Rejection Reason': record.rejection_reason || 'None', Conflicts: record.conflict_event_ids?.length || 0 });
    $('detailsTitle').textContent = record.title; $('detailsMeta').textContent = `${category.name} - ${record.venue}`; $('detailsList').innerHTML = rows(data);
    $('detailsEditButton').hidden = !canEditEvent(state.store, record); $('detailsDeleteButton').hidden = !canEditEvent(state.store, record); $('detailsCancelButton').hidden = !canEditEvent(state.store, record) || record.event_status === 'cancelled';
    $('detailsApproveButton').hidden = !isSuperAdmin(state.store) || record.approval_status === 'approved'; $('detailsRejectButton').hidden = !isSuperAdmin(state.store) || record.approval_status === 'rejected';
  }
  openDialog('detailsModal');
}

function openPublicDayPanel(date) {
  state.selectedPublicDate = date;
  renderPublicDayPanel();
  $('publicDayPanel').classList.add('open');
  $('publicDayPanel').setAttribute('aria-hidden', 'false');
}

function closePublicDayPanel() {
  state.selectedPublicDate = '';
  $('publicDayPanel').classList.remove('open');
  $('publicDayPanel').setAttribute('aria-hidden', 'true');
}

function renderPublicDayPanel() {
  if (!state.selectedPublicDate) return;
  const items = state.store.events
    .filter((event) => event.approval_status === 'approved' && isPublicEvent(event))
    .flatMap((event) => eventOccurrences(event).filter((occurrence) => occurrence.date === state.selectedPublicDate).map((occurrence) => ({ event, occurrence })))
    .sort((a, b) => new Date(a.occurrence.start_time) - new Date(b.occurrence.start_time));
  $('publicDayTitle').textContent = new Date(`${state.selectedPublicDate}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  $('publicDayEvents').innerHTML = items.map(({ event, occurrence }) => {
    const category = categoryById(state.store, event.category_id);
    return `<article class="public-day-event" style="border-left-color:${escapeHtml(category.color)}"><strong>${escapeHtml(event.title)}</strong><p>${escapeHtml(formatTime(occurrence.start_time))} to ${escapeHtml(formatTime(occurrence.end_time))}</p><p>${escapeHtml(event.organization_name)} - ${escapeHtml(event.venue)}</p><p>${escapeHtml(category.name)} - ${escapeHtml(cap(event.event_status))}</p><p>${escapeHtml(event.public_description)}</p></article>`;
  }).join('') || '<p class="empty-text">No public events scheduled for this date.</p>';
}

function editSelectedEvent() { const event = state.selectedDetails?.record; if (!event) return; closeDialog('detailsModal'); openEventModal({ start: new Date(event.start_time), end: new Date(event.end_time) }, event); }
function cancelSelectedEvent() { const event = state.selectedDetails?.record; if (event) confirmAction(`Cancel "${event.title}"?`, () => cancelEvent(event)); }
function cancelEventFromModal() { const event = state.store.events.find((item) => item.id === $('eventId').value); if (event) confirmAction(`Cancel "${event.title}"?`, () => { cancelEvent(event); closeDialog('eventModal'); }); }
function cancelEvent(event) { event.event_status = 'cancelled'; event.updated_at = new Date().toISOString(); log('event_cancelled', `${currentUser(state.store).full_name} cancelled "${event.title}".`, event); closeDialog('detailsModal'); persist('Event cancelled.'); }
function deleteSelectedEvent() { const event = state.selectedDetails?.record; if (event) confirmDeleteEvent(event); }
function deleteEventFromModal() { const event = state.store.events.find((item) => item.id === $('eventId').value); if (event) confirmDeleteEvent(event); }
function confirmDeleteEvent(event) { if (!requirePermission(canEditEvent(state.store, event), 'You cannot delete this event.')) return; confirmAction(`Permanently delete "${event.title}"?`, () => deleteEvent(event)); }
async function deleteEvent(event) {
  const index = state.store.events.findIndex((item) => item.id === event.id);
  if (index < 0) return;
  const logLength = state.store.activityLogs.length;
  state.store.events.splice(index, 1);
  log('event_deleted', `${currentUser(state.store).full_name} deleted "${event.title}".`, event);
  try {
    await saveStore(state.store);
    closeDialog('detailsModal'); closeDialog('eventModal'); renderAll(); refreshCalendar(); showToast('Event deleted.', 'success');
  } catch (error) {
    state.store.events.splice(index, 0, event);
    state.store.activityLogs.length = logLength;
    showToast(`Could not delete event: ${error.message}`, 'error');
  }
}

function reviewSelectedEvent(status) { const event = state.selectedDetails?.record; if (event) reviewEvent(event, status); }
function reviewEvent(event, status) {
  if (!requirePermission(isSuperAdmin(state.store), 'Only super admins can review requests.')) return;
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
function renderAnnouncementPreview() { const first = activeAnnouncements(state.store)[0]; $('announcementPreview').innerHTML = first ? `<div class="notice ${first.priority}"><strong>${escapeHtml(first.title)}</strong><p>${escapeHtml(first.content)}</p></div>` : '<p class="empty-text">No active announcements.</p>'; }
function renderAnnouncements() { $('announcementsList').innerHTML = activeAnnouncements(state.store).map((item) => `<div class="activity-item notice ${item.priority}"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.content)}</p><p>${escapeHtml(cap(item.priority))} - ${escapeHtml(item.posted_by)} - expires ${escapeHtml(item.expires_at.slice(0, 10))}</p>${isSuperAdmin(state.store) ? actionButton('announcement-delete', item.id, 'Delete', 'danger-button') : ''}</div>`).join('') || empty('No active announcements'); }
function addAnnouncement(event) { event.preventDefault(); if (!isSuperAdmin(state.store)) return; const item = { id: createId(), title: $('announcementTitle').value.trim(), content: $('announcementContent').value.trim(), priority: $('announcementPriority').value, posted_by: currentUser(state.store).full_name, posted_at: new Date().toISOString(), expires_at: `${$('announcementExpiry').value}T23:59:59` }; state.store.announcements.push(item); log('announcement_posted', `Posted announcement "${item.title}".`, item); event.target.reset(); persist('Announcement posted.'); renderAnnouncements(); }

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

function openConcerns() { if (!requirePermission(!isPublic(state.store), 'Login to access concerns.')) return; renderConcerns(); openDialog('concernsModal'); }
function renderConcerns() { const user = currentUser(state.store); const list = isSuperAdmin(state.store) ? state.store.concerns : state.store.concerns.filter((item) => item.organization_id === user.organization_id); $('concernsList').innerHTML = list.map((item) => `<div class="activity-item"><strong>${escapeHtml(item.title)} <span class="status-pill ${item.status}">${escapeHtml(cap(item.status))}</span></strong><p>${escapeHtml(item.organization_name)} - ${escapeHtml(item.category)} - ${escapeHtml(cap(item.priority))}</p><p>${escapeHtml(item.description)}</p><p>Submitted: ${escapeHtml(formatDateTime(item.created_at))}</p><p>Admin response: ${escapeHtml(item.admin_response || 'Pending')}</p>${isSuperAdmin(state.store) ? `${actionButton('concern-review', item.id, 'Respond', 'secondary-button')}${actionButton('concern-resolve', item.id, 'Resolve', 'primary-button')}${actionButton('concern-reject', item.id, 'Reject', 'danger-button')}` : ''}</div>`).join('') || empty('No concerns'); }
function addConcern(event) { event.preventDefault(); if (!isManager(state.store)) return; const user = currentUser(state.store); const org = state.store.organizations.find((item) => item.id === user.organization_id); const item = { id: createId(), organization_id: org.id, organization_name: org.organization_name, title: $('concernTitle').value.trim(), category: $('concernCategory').value, priority: $('concernPriority').value, description: $('concernDescription').value.trim(), status: 'pending', admin_response: '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }; state.store.concerns.push(item); log('concern_submitted', `${user.full_name} raised "${item.title}".`, item); event.target.reset(); persist('Concern submitted.'); renderConcerns(); }

function openDashboard() { if (!requirePermission(!isPublic(state.store), 'Login to view a dashboard.')) return; renderDashboard(); openDialog('dashboardModal'); }
function renderDashboard() { const user = currentUser(state.store); const events = isSuperAdmin(state.store) ? state.store.events : state.store.events.filter((item) => item.organization_id === user.organization_id); const upcoming = events.filter((item) => new Date(item.start_time) >= new Date() && eventIsActive(item)); const metrics = isSuperAdmin(state.store) ? [['All posted events', events.length], ['Upcoming programs', upcoming.length], ['Blocked periods', state.store.blockedTimes.length], ['Announcements', activeAnnouncements(state.store).length], ['Open concerns', state.store.concerns.filter((item) => !['resolved', 'rejected'].includes(item.status)).length], ['Conflict warnings', events.filter((item) => item.conflict_event_ids?.length).length], ['Organizations', state.store.organizations.length]] : [['Upcoming events', upcoming.length], ['Submitted events', events.length], ['Postponed / cancelled', events.filter((item) => ['postponed', 'cancelled'].includes(item.event_status)).length], ['Raised concerns', state.store.concerns.filter((item) => item.organization_id === user.organization_id).length], ['Announcements', activeAnnouncements(state.store).length], ['Blocked periods', state.store.blockedTimes.length]];
  $('dashboardTitle').textContent = isSuperAdmin(state.store) ? 'Admin Dashboard' : 'Organization Dashboard'; $('dashboardGrid').innerHTML = metrics.map(([label, value]) => `<div class="metric"><strong>${value}</strong><span>${escapeHtml(label)}</span></div>`).join('');
  $('dashboardList').innerHTML = upcoming.slice(0, 8).map((item) => `<div class="activity-item"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.venue)} - ${escapeHtml(formatDateTime(item.start_time))}</p></div>`).join('') || empty('No upcoming events');
}

function openEventRequests() { if (!requirePermission(isSuperAdmin(state.store), 'Only super admins can review event requests.')) return; renderEventRequests(); openDialog('eventRequestsModal'); }
function renderEventRequests() { $('eventRequestsList').innerHTML = [...state.store.events].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)).map((item) => `<div class="activity-item"><strong>${escapeHtml(item.title)} <span class="status-pill ${item.approval_status}">${escapeHtml(cap(item.approval_status))}</span></strong><p>${escapeHtml(item.organization_name)} - ${escapeHtml(item.venue)} - ${eventOccurrences(item).length} scheduled day(s)</p><p>${item.conflict_event_ids?.length ? `Warning: ${item.conflict_event_ids.length} schedule conflict(s)` : 'No schedule conflict warning'}</p>${actionButton('event-view', item.id, 'Details', 'secondary-button')}${actionButton('event-approve', item.id, 'Approve', 'primary-button')}${actionButton('event-reject', item.id, 'Reject', 'secondary-button')}</div>`).join('') || empty('No event requests'); }

function openBlockedTimes() { if (!requirePermission(isSuperAdmin(state.store), 'Only super admins can manage blocked times.')) return; renderBlockedTimes(); openDialog('blockedTimesModal'); }
function updateBlockTimeFields() { $('blockStart').disabled = $('blockAllDay').checked; $('blockEnd').disabled = $('blockAllDay').checked; }
function addBlockedTime(event) { event.preventDefault(); if (!isSuperAdmin(state.store)) return; const date = $('blockDate').value; const allDay = $('blockAllDay').checked; const start = allDay ? `${date}T00:00:00` : localIso(date, $('blockStart').value); const end = allDay ? `${date}T23:59:59` : localIso(date, $('blockEnd').value); if (new Date(start) >= new Date(end)) return showToast('Blocked-time end must be later than start.', 'error'); const item = { id: createId(), title: $('blockTitle').value.trim(), start_time: start, end_time: end, all_day: allDay, reason: $('blockReason').value.trim(), created_by: currentUser(state.store).id, created_at: new Date().toISOString() }; state.store.blockedTimes.push(item); log('blocked_time_created', `Added blocked period "${item.title}".`, item); event.target.reset(); updateBlockTimeFields(); persist('Blocked period added.'); renderBlockedTimes(); }
function renderBlockedTimes() { $('blockedTimesList').innerHTML = state.store.blockedTimes.map((item) => `<div class="activity-item"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(formatDateTime(item.start_time))} to ${escapeHtml(formatTime(item.end_time))}</p><p>${escapeHtml(item.reason)}</p>${actionButton('block-delete', item.id, 'Remove', 'danger-button')}</div>`).join('') || empty('No blocked periods'); }

function openCategories() { if (!requirePermission(isSuperAdmin(state.store), 'Only super admins can manage categories.')) return; renderCategories(); openDialog('categoriesModal'); }
function addCategory(event) { event.preventDefault(); if (!isSuperAdmin(state.store)) return; const item = { id: createId(), name: $('categoryName').value.trim(), color: $('categoryColor').value, active: true }; state.store.categories.push(item); log('category_created', `Created category "${item.name}".`, item); event.target.reset(); persist('Category added.'); renderCategories(); }
function renderCategories() { $('categoriesList').innerHTML = state.store.categories.map((item) => `<div class="activity-item"><strong><span class="color-swatch" style="background:${escapeHtml(item.color)}"></span>${escapeHtml(item.name)}</strong><p>${item.active ? 'Active' : 'Inactive'}</p>${actionButton('category-toggle', item.id, item.active ? 'Deactivate' : 'Activate', 'secondary-button')}${actionButton('category-delete', item.id, 'Delete', 'danger-button')}</div>`).join(''); }

function openOrganizations() { if (!requirePermission(isSuperAdmin(state.store), 'Only super admins can manage organizations.')) return; renderOrganizations(); openDialog('organizationsModal'); }
function addOrganization(event) { event.preventDefault(); if (!isSuperAdmin(state.store)) return; const item = { id: createId(), organization_name: $('organizationName').value.trim(), organization_type: $('organizationType').value.trim(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() }; state.store.organizations.push(item); log('organization_created', `Created organization "${item.organization_name}".`, item); event.target.reset(); persist('Organization added.'); renderOrganizations(); }
function renderOrganizations() { $('organizationsList').innerHTML = state.store.organizations.map((item) => `<div class="activity-item"><strong>${escapeHtml(item.organization_name)}</strong><p>${escapeHtml(item.organization_type)}</p>${actionButton('organization-delete', item.id, 'Delete', 'danger-button')}</div>`).join(''); }

function openUsers() { if (!requirePermission(isSuperAdmin(state.store), 'Only admins can manage accounts.')) return; renderUsers(); openDialog('usersModal'); }
function renderUsers() {
  const requests = state.store.accountRequests.filter((item) => item.status === 'pending');
  $('accountRequestsList').innerHTML = requests.map((item) => `<div class="activity-item"><strong>${escapeHtml(item.full_name)} <span class="status-pill pending">Pending</span></strong><p>${escapeHtml(roleLabel(item.role))} - @${escapeHtml(item.username)}</p><p>${escapeHtml(item.organization_name || 'No organization')}</p>${actionButton('account-approve', item.id, 'Approve', 'primary-button')}${actionButton('account-reject', item.id, 'Reject', 'danger-button')}</div>`).join('') || empty('No pending account requests');
  $('usersList').innerHTML = state.store.users.map((user) => `<div class="activity-item"><strong>${escapeHtml(user.full_name)}</strong><p>@${escapeHtml(user.username)} - ${escapeHtml(roleLabel(user.role))}</p><p>${escapeHtml(state.store.organizations.find((org) => org.id === user.organization_id)?.organization_name || 'No organization')}</p></div>`).join('');
}
function openActivityLog() { if (!requirePermission(isSuperAdmin(state.store), 'Only super admins can view logs.')) return; $('activityList').innerHTML = [...state.store.activityLogs].reverse().map((item) => `<div class="activity-item"><strong>${escapeHtml(cap(item.action.replaceAll('_', ' ')))}</strong><p>${escapeHtml(formatDateTime(item.created_at))}</p><p>${escapeHtml(item.description)}</p><p>${escapeHtml(item.performed_by)} - ${escapeHtml(roleLabel(item.performed_by_role))}</p></div>`).join('') || empty('No activity logs'); openDialog('activityLogModal'); }

function handleListAction(event) {
  const button = event.target.closest('[data-action]'); if (!button) return; const { action, id } = button.dataset;
  if (action === 'event-view') { const item = state.store.events.find((event) => event.id === id); if (item) openDetails({ type: 'event', record: item }); }
  if (action === 'event-approve' || action === 'event-reject') { const item = state.store.events.find((event) => event.id === id); if (item) reviewEvent(item, action.split('-')[1] === 'approve' ? 'approved' : 'rejected'); renderEventRequests(); }
  if (action === 'announcement-delete') confirmAction('Delete this announcement?', () => removeById('announcements', id, 'announcement_deleted', 'Announcement deleted.'));
  if (action === 'block-delete') confirmAction('Remove this blocked period?', () => removeById('blockedTimes', id, 'blocked_time_removed', 'Blocked period removed.'));
  if (action === 'category-toggle') { const item = state.store.categories.find((category) => category.id === id); item.active = !item.active; log('category_updated', `Changed category "${item.name}".`, item); persist('Category updated.'); renderCategories(); }
  if (action === 'category-delete') confirmAction('Delete this category?', () => removeById('categories', id, 'category_deleted', 'Category deleted.'));
  if (action === 'organization-delete') confirmAction('Delete this organization? Assigned users will become unassigned.', () => { state.store.users.forEach((user) => { if (user.organization_id === id) user.organization_id = null; }); removeById('organizations', id, 'organization_deleted', 'Organization deleted.'); });
  if (action === 'account-approve') approveAccount(id);
  if (action === 'account-reject') rejectAccount(id);
  if (action === 'concern-review') { const item = state.store.concerns.find((concern) => concern.id === id); const response = prompt('Admin response:', item.admin_response || ''); if (response !== null) { item.admin_response = response.trim(); item.status = 'in_review'; item.updated_at = new Date().toISOString(); log('concern_responded', `Responded to "${item.title}".`, item); persist('Concern response saved.'); renderConcerns(); } }
  if (action === 'concern-resolve') { const item = state.store.concerns.find((concern) => concern.id === id); item.status = 'resolved'; item.updated_at = new Date().toISOString(); log('concern_resolved', `Resolved "${item.title}".`, item); persist('Concern resolved.'); renderConcerns(); }
  if (action === 'concern-reject') { const item = state.store.concerns.find((concern) => concern.id === id); item.status = 'rejected'; item.updated_at = new Date().toISOString(); log('concern_rejected', `Rejected "${item.title}".`, item); persist('Concern rejected.'); renderConcerns(); }
}

async function removeById(collection, id, action, message) { const item = state.store[collection].find((entry) => entry.id === id); try { await deleteRecord(collection, id); state.store[collection] = state.store[collection].filter((entry) => entry.id !== id); log(action, message, item); await persist(message); if (collection === 'announcements') renderAnnouncements(); if (collection === 'blockedTimes') renderBlockedTimes(); if (collection === 'categories') renderCategories(); if (collection === 'organizations') renderOrganizations(); } catch (error) { showToast(error.message, 'error'); } }
function confirmAction(message, action) { state.confirmAction = action; $('confirmMessage').textContent = message; openDialog('confirmModal'); }
function confirmPendingAction() { const action = state.confirmAction; state.confirmAction = null; closeDialog('confirmModal'); action?.(); }

function updateFilters() { state.filters = { organization: $('filterOrganization').value, venue: $('filterVenue').value.trim(), category: $('filterCategory').value, eventType: $('filterEventType').value.trim(), date: $('filterDate').value, month: $('filterMonth').value, approval: $('filterApproval').value, eventStatus: $('filterEventStatus').value }; refreshCalendar(); }
function resetFilters() { state.filters = { organization: '', venue: '', category: '', eventType: '', date: '', month: '', approval: '', eventStatus: '' }; ['filterVenue', 'filterEventType', 'filterDate', 'filterMonth'].forEach((id) => $(id).value = ''); renderFilterOptions(); $('filterApproval').value = ''; $('filterEventStatus').value = ''; refreshCalendar(); }

function updateAvailability() { const now = new Date(); const activeEvents = state.store.events.filter((item) => item.approval_status === 'approved' && isPublicEvent(item)).flatMap((event) => eventOccurrences(event).map((occurrence) => ({ ...occurrence, title: event.title, venue: event.venue }))); const active = [...activeEvents, ...state.store.blockedTimes].find((item) => overlaps(now, addMinutes(now, 1), item.start_time, item.end_time)); $('availabilityStatus').textContent = active ? `Active Until ${formatTime(active.end_time)}` : 'Public Events Overview'; $('availabilityDetail').textContent = active?.venue ? `${active.title} at ${active.venue}` : active ? 'A university block is active.' : 'Select a calendar date to see its public events.'; }
function changeView(view) { state.calendar.changeView(isPublic(state.store) ? 'dayGridMonth' : MOBILE_VIEWS.has(view) ? view : 'timeGridWeek'); setTimeout(() => state.calendar.updateSize(), 0); }
function handleResize() { if (!state.calendar) return; if (!MOBILE_VIEWS.has(state.calendar.view.type)) state.calendar.changeView('timeGridWeek'); state.calendar.updateSize(); }
function openSidebar() { $('sidebar').classList.add('open'); $('mobileScrim').classList.add('open'); }
function closeSidebar() { $('sidebar').classList.remove('open'); $('mobileScrim').classList.remove('open'); }

async function login(event) {
  event.preventDefault();
  const username = $('loginUsername').value.trim().toLowerCase();
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
  const username = $('registerUsername').value.trim().toLowerCase();
  try {
    await requestAccount({ username, password: $('registerPassword').value, fullName: $('registerFullName').value.trim(), role: $('registerRole').value, organizationName: $('registerRole').value === 'organization_manager' ? $('registerOrganizationName').value.trim() : '' });
    event.target.reset(); updateRegistrationFields(); closeDialog('registerModal');
    showToast('Account request submitted for admin approval.', 'success');
  } catch (error) { showToast(error.message, 'error'); }
}
function updateRegistrationFields() {
  const needsOrganization = $('registerRole').value === 'organization_manager';
  $('registerOrganizationWrap').hidden = !needsOrganization;
  $('registerOrganizationName').required = needsOrganization;
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
function openDialog(id) { $(id).showModal(); closeSidebar(); }
function closeDialog(id) { if ($(id)?.open) $(id).close(); }
function requirePermission(ok, message) { if (!ok) showToast(message, 'error'); return ok; }
function showToast(message, type = 'info') { const host = [...document.querySelectorAll('dialog[open]')].at(-1) || document.body; host.appendChild($('toastRegion')); const toast = document.createElement('div'); toast.className = `toast ${type}`; toast.textContent = message; $('toastRegion').appendChild(toast); setTimeout(() => toast.remove(), 4200); }
function fillSelect(id, options, selectedValue = '') { const select = $(id); select.innerHTML = options.map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join(''); select.value = selectedValue || ''; }
function actionButton(action, id, label, className) { return `<button type="button" class="${className}" data-action="${action}" data-id="${id}">${escapeHtml(label)}</button>`; }
function empty(text) { return `<div class="activity-item"><strong>${escapeHtml(text)}</strong></div>`; }
function rows(data) { return Object.entries(data).map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value ?? '')}</dd>`).join(''); }
function cap(value) { return String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function roleLabel(value) { return cap(value); }
function initials(value) { return String(value || 'PV').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join(''); }
function escapeHtml(value) { return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;'); }
function localIso(date, time) { const value = new Date(`${date}T${time}:00`); return Number.isNaN(value.getTime()) ? '' : value.toISOString(); }
function dateInput(value) { const date = new Date(value); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
function timeInput(value) { return new Date(value).toTimeString().slice(0, 5); }
function formatDateTime(value) { return new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }); }
function formatTime(value) { return new Date(value).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); }
function eventIsActive(event) { return !['cancelled', 'completed', 'draft'].includes(event.event_status); }
function addMinutes(date, minutes) { return new Date(new Date(date).getTime() + minutes * 60000); }
function addDays(date, days) { const value = new Date(date); value.setDate(value.getDate() + days); return value; }
function nextDateInput(date) { return dateInput(addDays(new Date(`${date}T12:00:00`), 1)); }
function dateRange(start, end) { const dates = []; for (let day = new Date(`${start}T12:00:00`); dateInput(day) <= end; day = addDays(day, 1)) dates.push(dateInput(day)); return dates; }
function occurrenceRange(dates, start, end) { return dates.map((date) => ({ id: createId(), date, start_time: localIso(date, start), end_time: localIso(date, end) })); }
function selectionRange(info) {
  const view = state.calendar.view.type;
  if (view === 'timeGridDay') return { start: info.start, end: info.end };
  if (view === 'timeGridWeek') return { occurrences: occurrenceRange(dateRange(dateInput(info.start), dateInput(addMinutes(info.end, -0.001))), timeInput(info.start), timeInput(info.end)) };
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
function clickedEventDate(info) { return info.jsEvent.target.closest('.fc-daygrid-day')?.dataset.date || dateInput(info.event.start); }
function roundToNextHalfHour(value) { const date = new Date(value); date.setSeconds(0, 0); const minutes = date.getMinutes(); date.setMinutes(minutes <= 30 ? 30 : 60, 0, 0); return date; }
function defaultRange() { let start = roundToNextHalfHour(addMinutes(new Date(), 60)); let end = addMinutes(start, 60); if (dateInput(start) !== dateInput(end)) { start = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1, 9, 0, 0, 0); end = addMinutes(start, 60); } return { start, end }; }
function debounce(callback, delay) { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => callback(...args), delay); }; }
