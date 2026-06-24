import { emptyPublicStore } from './app-data.js?v=20260623-public-popup-close-v1';
import { loadPublicStore } from './supabase-storage.js?v=20260624-organizations-table-v1';
import { activeAnnouncements, eventOccurrences, isPublicEvent } from './app-rules.js?v=20260623-public-popup-close-v1';

const $ = (id) => document.getElementById(id);
const PUBLIC_SLOW_LOAD_MS = 6500;
const PUBLIC_STORE_SYNC_INTERVAL_MS = 3000;
const DEFAULT_ANNOUNCEMENT = {
  title: 'CSC S.Y.N.C. is ready for scheduling',
  content: 'Student organizations may now coordinate university-wide events through CSC S.Y.N.C.'
};
const LEGACY_DEFAULT_ANNOUNCEMENT = {
  title: 'CONNECT is ready for scheduling',
  content: 'Student organizations may now coordinate university-wide events through CONNECT.'
};
const state = { store: null, eventSignature: '', calendar: null, selectedDate: '', selectedOrganizationId: '', publicViewMode: 'today', resizeTimer: 0, resizeObserver: null, loadTimer: 0, storeSyncTimer: 0, storeSyncing: false, storeSyncChannel: null, spanLabels: new Set() };

document.addEventListener('DOMContentLoaded', initPublicCalendar);

function initPublicCalendar() {
  try {
    state.store = emptyPublicStore();
    state.eventSignature = publicStoreSignature(state.store);
    renderAnnouncements();
    renderStatuses();
    initializePublicCalendar();
    refreshPublicStore();
    startPublicStoreSync();
  } catch (error) {
    console.error('CONNECT public calendar failed to load:', error);
    showCalendarError();
  }
}

async function refreshPublicStore() {
  if (state.storeSyncing) return;
  state.storeSyncing = true;
  const showBlockingLoader = !publicStoreHasContent(state.store);
  setPublicLoading(showBlockingLoader);
  state.loadTimer = setTimeout(() => setPublicLoading(true, 'Still loading calendar data...'), PUBLIC_SLOW_LOAD_MS);

  try {
    const result = await loadPublicStore();
    if (result.noticeType === 'error') {
      if (!publicStoreHasContent(state.store)) state.store = result.store;
      if (result.notice) console.warn(result.notice);
      return;
    }

    const nextSignature = publicStoreSignature(result.store);
    const calendarChanged = nextSignature !== state.eventSignature;
    state.store = result.store;
    state.eventSignature = nextSignature;
    renderAnnouncements();
    renderStatuses();
    renderOrganizationFilter();
    if (calendarChanged) {
      if (typeof state.calendar?.batchRendering === 'function') state.calendar.batchRendering(() => state.calendar.refetchEvents());
      else state.calendar?.refetchEvents();
    }
    if (state.selectedDate) openPublicDayDialog(state.selectedDate, null);
    if (result.notice) console.info(result.notice);
  } catch (error) {
    console.error('CONNECT public calendar data refresh failed:', error);
  } finally {
    clearTimeout(state.loadTimer);
    setPublicLoading(false);
    state.storeSyncing = false;
    schedulePublicCalendarResize(0);
  }
}

function startPublicStoreSync() {
  if (state.storeSyncTimer) window.clearInterval(state.storeSyncTimer);
  state.storeSyncTimer = window.setInterval(() => {
    if (!document.hidden) refreshPublicStore();
  }, PUBLIC_STORE_SYNC_INTERVAL_MS);
  if (!state.storeSyncChannel && typeof BroadcastChannel !== 'undefined') {
    state.storeSyncChannel = new BroadcastChannel('csc-sync-store');
    state.storeSyncChannel.addEventListener('message', () => { if (!document.hidden) refreshPublicStore(); });
  }
}

function publicStoreHasContent(store) {
  return Boolean(store?.events?.length || store?.blockedTimes?.length || store?.announcements?.length || store?.activityStatuses?.length);
}

function publicConnectedViewType(info) {
  const days = (info.end - info.start) / 86400000;
  if (days > 45) return 'multiMonthYear';
  return info.view?.type || state.calendar?.view?.type;
}

function publicStoreSignature(store) {
  const events = Array.isArray(store?.events) ? store.events : [];
  const schedulesSignature = events
    .filter((event) => event.approval_status === 'approved' && isPublicEvent(event))
    .map((event) => [
      event.id,
      event.title,
      event.organization_id,
      event.category_id,
      event.venue,
      event.privacy_level,
      event.event_status,
      ...sortedEventOccurrences(event).map((occurrence) => `${occurrence.date}:${occurrence.start_time}:${occurrence.end_time}`)
    ].join('|'))
    .sort()
    .join('||');
  const blocksSignature = publicBlockRecords(store)
    .map((block) => [block.id, block.title, block.start_time, block.end_time, block.reason].join('|'))
    .sort()
    .join('||');
  return `${schedulesSignature}::${blocksSignature}`;
}

function setPublicLoading(isLoading, label = 'Loading calendar...') {
  const panel = $('calendar')?.parentElement;
  if (!panel) return;
  panel.classList.toggle('is-loading', isLoading);
  panel.dataset.loadingLabel = isLoading ? label : '';
}

function showCalendarError() {
  const calendar = $('calendar');
  if (!calendar) return;
  calendar.innerHTML = '<div class="activity-item"><strong>Calendar failed to load.</strong><p>Please refresh the page.</p></div>';
}

function initializePublicCalendar() {
  state.calendar = new FullCalendar.Calendar($('calendar'), {
    initialView: 'dayGridMonth',
    firstDay: 0,
    height: publicCalendarHeight(),
    headerToolbar: false,
    displayEventTime: false,
    dayMaxEvents: false,
    dayMaxEventRows: false,
    fixedWeekCount: false,
    showNonCurrentDates: false,
    views: { multiMonthYear: { type: 'multiMonth', duration: { months: 12 }, multiMonthMaxColumns: 3 } },
    events: (info, success) => success(publicEvents(publicConnectedViewType(info))),
    datesSet: (info) => {
      state.spanLabels.clear();
      $('calendarTitle').textContent = info.view.title;
      syncPublicViewControls(info.view.type);
    },
    dateClick: (info) => openPublicDayDialog(info.dateStr, info.dayEl),
    eventClick: (info) => {
      const panelDate = info.event.extendedProps && info.event.extendedProps.panelDate ? info.event.extendedProps.panelDate : info.event.startStr;
      openPublicDayDialog(String(panelDate).slice(0, 10), info.el);
    },
    eventDidMount: applyPublicEventAccent
  });

  const prevButton = $('prevButton');
  const nextButton = $('nextButton');
  const viewSelector = $('publicViewSelector');
  const organizationSelect = $('publicOrganizationSelect');
  const closeButton = $('closePublicDayDialog');
  const menuButton = $('mobileMenuButton');
  const scrim = $('mobileScrim');

  if (prevButton) prevButton.addEventListener('click', () => { state.calendar.prev(); schedulePublicCalendarResize(0); });
  if (nextButton) nextButton.addEventListener('click', () => { state.calendar.next(); schedulePublicCalendarResize(0); });
  if (viewSelector) viewSelector.addEventListener('pointerdown', () => {
    if (viewSelector.value === 'today') returnToToday();
  });
  if (viewSelector) viewSelector.addEventListener('change', (event) => {
    changePublicView(event.target.value);
  });
  if (organizationSelect) organizationSelect.addEventListener('change', (event) => {
    selectOrganizationFilter(event.target.value);
  });
  if (closeButton) closeButton.addEventListener('click', closePublicDayDialog);
  if (menuButton) menuButton.addEventListener('click', openPublicSidebar);
  if (scrim) scrim.addEventListener('click', closePublicSidebar);
  document.addEventListener('pointerdown', handlePublicDialogPointerDown);
  document.addEventListener('keydown', handlePublicDialogKeyDown);
  window.addEventListener('resize', handlePublicResize, { passive: true });
  window.addEventListener('orientationchange', () => schedulePublicCalendarResize(260), { passive: true });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', handlePublicResize, { passive: true });

  state.calendar.render();
  changePublicView('today');
  renderOrganizationFilter();
  bindPublicCalendarResizeObserver();
  schedulePublicCalendarResize(0);
}

function changePublicView(value) {
  state.publicViewMode = value === 'multiMonthYear' ? 'multiMonthYear' : value === 'dayGridMonth' ? 'dayGridMonth' : 'today';
  if (state.publicViewMode === 'today') {
    returnToToday();
  } else {
    state.calendar.changeView(state.publicViewMode);
  }
  syncPublicViewControls(state.calendar.view.type);
  schedulePublicCalendarResize(0);
}

function returnToToday() {
  state.publicViewMode = 'today';
  state.calendar.changeView('dayGridMonth');
  state.calendar.today();
  syncPublicViewControls(state.calendar.view.type);
  schedulePublicCalendarResize(0);
}

function syncPublicViewControls(viewType = state.calendar?.view.type) {
  const selector = $('publicViewSelector');
  if (selector) selector.value = state.publicViewMode;
}

function bindPublicCalendarResizeObserver() {
  if (!window.ResizeObserver || state.resizeObserver) return;
  const panel = $('calendar') && $('calendar').parentElement;
  if (!panel) return;
  state.resizeObserver = new ResizeObserver(() => schedulePublicCalendarResize(60));
  state.resizeObserver.observe(panel);
}

function handlePublicResize() {
  closePublicDayDialog();
  closePublicSidebar();
  applyPublicCalendarHeight();
  schedulePublicCalendarResize(120);
}

function publicCalendarHeight() {
  return isMobilePublicViewport() ? 'auto' : '100%';
}

function isMobilePublicViewport() {
  return window.innerWidth <= 900 || (window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)').matches);
}

function applyPublicCalendarHeight() {
  if (!state.calendar) return;
  const height = publicCalendarHeight();
  if (state.calendar.getOption('height') !== height) state.calendar.setOption('height', height);
}

function openPublicSidebar() {
  $('sidebar')?.classList.add('open');
  $('mobileScrim')?.classList.add('open');
}

function closePublicSidebar() {
  $('sidebar')?.classList.remove('open');
  $('mobileScrim')?.classList.remove('open');
}

function schedulePublicCalendarResize(delay = 0) {
  clearTimeout(state.resizeTimer);
  state.resizeTimer = setTimeout(() => {
    if (!state.calendar) return;
    state.calendar.updateSize();
    requestAnimationFrame(() => state.calendar && state.calendar.updateSize());
  }, delay);
}

function publicEvents(viewType = state.calendar?.view.type) {
  const approvedEvents = state.store.events
    .filter((event) => event.approval_status === 'approved' && isPublicEvent(event))
    .filter(matchesSelectedOrganization)
  const dateCounts = publicDateEventCounts(approvedEvents);
  const scheduleItems = approvedEvents.reduce((items, event) => items.concat(publicCalendarItems(event, dateCounts, viewType)), []);
  return scheduleItems.concat(publicBlockedCalendarItems(viewType));
}

function matchesSelectedOrganization(event) {
  if (!state.selectedOrganizationId) return true;
  return event.organization_id === state.selectedOrganizationId || organizationKey(event.organization_name) === state.selectedOrganizationId;
}

function renderOrganizationFilter() {
  const options = publicOrganizations();
  if (state.selectedOrganizationId && !options.some((item) => item.id === state.selectedOrganizationId)) state.selectedOrganizationId = '';
  const select = $('publicOrganizationSelect');
  if (!select) return;
  select.innerHTML = [
    '<option value="">All organizations</option>',
    ...options.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`)
  ].join('');
  select.value = state.selectedOrganizationId;
}

function selectOrganizationFilter(id) {
  state.selectedOrganizationId = id;
  renderOrganizationFilter();
  closePublicDayDialog();
  state.calendar?.refetchEvents();
  if (state.selectedDate) openPublicDayDialog(state.selectedDate, null);
}

function publicOrganizations() {
  const organizations = new Map();
  (Array.isArray(state.store?.organizations) ? state.store.organizations : []).forEach((org) => {
    const name = cleanOrganizationName(org.organization_name || org.name);
    if (name) organizations.set(org.id || organizationKey(name), { id: org.id || organizationKey(name), name });
  });
  (Array.isArray(state.store?.events) ? state.store.events : [])
    .filter((event) => event.approval_status === 'approved' && isPublicEvent(event))
    .forEach((event) => {
      const name = cleanOrganizationName(event.organization_name);
      if (!name) return;
      const id = event.organization_id || organizationKey(name);
      if (!organizations.has(id)) organizations.set(id, { id, name });
    });
  return [...organizations.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function cleanOrganizationName(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function organizationKey(value) {
  return `name:${cleanOrganizationName(value).toLowerCase()}`;
}

function publicDateEventCounts(events) {
  return events.reduce((counts, event) => {
    sortedEventOccurrences(event).forEach((occurrence) => counts.set(occurrence.date, (counts.get(occurrence.date) || 0) + 1));
    return counts;
  }, new Map());
}

function publicCalendarItems(event, dateCounts, viewType = state.calendar?.view.type) {
  return consecutiveOccurrenceRanges(sortedEventOccurrences(event))
    .map((range, index) => fullCalendarRangeItem(event, range, index, dateCounts, viewType));
}

function sortedEventOccurrences(event) {
  return eventOccurrences(event)
    .filter((occurrence) => occurrence.date && occurrence.start_time && occurrence.end_time)
    .sort((a, b) => a.date.localeCompare(b.date) || new Date(a.start_time) - new Date(b.start_time));
}

function fullCalendarRangeItem(event, range, index, dateCounts, viewType = state.calendar?.view.type) {
  const color = eventPrimaryColor(event);
  const accentColor = eventAccentColor(event);
  const first = range[0];
  const last = range[range.length - 1];
  const isMultiDay = range.length > 1;
  const densityClass = publicDensityClass(range, dateCounts);

  return {
    id: `${event.id}::public-range-${index}`,
    title: `${formatCompactTime(first.start_time)} ${event.title}`,
    start: isMultiDay ? first.date : first.start_time,
    end: isMultiDay ? nextDate(last.date) : first.end_time,
    allDay: isMultiDay,
    display: 'block',
    backgroundColor: color,
    borderColor: color,
    classNames: isMultiDay
      ? ['event-month-span', viewType === 'multiMonthYear' ? 'event-year-span' : null, 'event-month-span-multi', 'public-multi-day-event', densityClass].filter(Boolean)
      : ['public-single-day-event', densityClass],
    extendedProps: { event, occurrence: first, panelDate: first.date, spanKey: `${event.id}::public-range-${index}`, accentColor, eventCount: dateCounts.get(first.date) || 1 }
  };
}

function publicDensityClass(range, dateCounts) {
  const maxCount = Math.max(...range.map((occurrence) => dateCounts.get(occurrence.date) || 1));
  if (maxCount >= 6) return 'public-density-max';
  if (maxCount >= 4) return 'public-density-high';
  if (maxCount >= 3) return 'public-density-medium';
  return 'public-density-normal';
}

function applyPublicEventAccent(info) {
  const accentColor = info.event.extendedProps && info.event.extendedProps.accentColor;
  if (accentColor) info.el.style.setProperty('--event-accent-color', accentColor);
  if (!info.el.classList.contains('event-month-span-multi')) return;
  const spanKey = info.event.extendedProps?.spanKey || info.event.id;
  if (state.spanLabels.has(spanKey)) info.el.classList.add('event-month-span-continuation');
  else state.spanLabels.add(spanKey);
}

function consecutiveOccurrenceRanges(occurrences) {
  return occurrences.reduce((ranges, occurrence) => {
    const lastRange = ranges.length ? ranges[ranges.length - 1] : null;
    const lastOccurrence = lastRange && lastRange.length ? lastRange[lastRange.length - 1] : null;
    if (!lastRange || !lastOccurrence || nextDate(lastOccurrence.date) !== occurrence.date) {
      ranges.push([occurrence]);
    } else {
      lastRange.push(occurrence);
    }
    return ranges;
  }, []);
}

function renderAnnouncements() {
  const announcements = activeAnnouncements(state.store).filter((item) => !isDefaultAnnouncement(item)).slice(0, 4);
  $('announcementPreview').innerHTML = announcements.map(announcementHtml).join('') || announcementHtml(DEFAULT_ANNOUNCEMENT);
}

function publicBlockedCalendarItems(viewType = state.calendar?.view.type) {
  return publicBlockRecords(state.store)
    .filter((block) => block.start_time && block.end_time)
    .map((block) => {
      const wholeDay = block.block_type === 'whole_day';
      const multiDay = !wholeDay && dateOnly(block.start_time) !== dateOnly(block.end_time);
      return {
        id: `${block.id}::public-block`,
        title: block.title || 'Blocked university period',
        start: wholeDay || multiDay ? dateOnly(block.start_time) : block.start_time,
        end: wholeDay ? dateOnly(block.end_time) : multiDay ? nextDate(dateOnly(block.end_time)) : block.end_time,
        allDay: wholeDay || multiDay,
        display: 'block', backgroundColor: '#071C3D', borderColor: '#F4B400',
        classNames: ['event-blocked', 'public-blocked-event', viewType === 'multiMonthYear' ? 'event-year-span' : null].filter(Boolean),
        extendedProps: { type: 'block', block, panelDate: dateOnly(block.start_time), accentColor: '#F4B400' }
      };
    });
}

function isDefaultAnnouncement(item) {
  const title = String(item?.title || '').trim().toLowerCase();
  const content = String(item?.content || '').trim().toLowerCase();
  return [DEFAULT_ANNOUNCEMENT, LEGACY_DEFAULT_ANNOUNCEMENT].some((announcement) =>
    title === announcement.title.toLowerCase() && content === announcement.content.toLowerCase()
  );
}

function announcementHtml(item) {
  return `<div class="notice"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.content)}</p></div>`;
}

function renderStatuses() {
  const statuses = Array.isArray(state.store.activityStatuses) ? state.store.activityStatuses : [];
  $('cscStatusValue').textContent = publicStatusLabel(latestStatusForType(statuses, 'CSC'));
  $('oicStatusValue').textContent = publicStatusLabel(latestStatusForType(statuses, 'OIC'));
}

function latestStatusForType(statuses, accountType) {
  return statuses
    .filter((item) => item.account_type === accountType)
    .sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0))[0];
}

function publicStatusLabel(status) {
  if (!status) return 'Status not posted';
  return status.activity_status || status.status_label || readableStatus(status.status) || 'Status not posted';
}

function openPublicDayDialog(date, anchorEl) {
  state.selectedDate = date;
  const items = publicDayItems(date);
  const dialog = $('publicDayDialog');

  $('publicDayTitle').textContent = new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  $('publicDayCount').textContent = `${items.length} calendar item${items.length === 1 ? '' : 's'}`;
  $('publicDayEvents').innerHTML = items.map(publicDayEventHtml).join('') || '<p class="empty-text">No public events scheduled for this date.</p>';
  positionPublicDayDialog(dialog, anchorEl);
  dialog.classList.add('open');
  dialog.setAttribute('aria-hidden', 'false');
}

function publicDayItems(date) {
  const events = state.store.events
    .filter((event) => event.approval_status === 'approved' && isPublicEvent(event))
    .filter(matchesSelectedOrganization)
    .reduce((results, event) => {
      const matchingOccurrences = eventOccurrences(event)
        .filter((occurrence) => occurrence.date === date)
        .map((occurrence) => ({ type: 'event', event, occurrence }));
      return results.concat(matchingOccurrences);
    }, []);
  const blocks = publicBlockRecords(state.store)
    .filter((block) => blockOverlapsDate(block, date))
    .map((block) => ({ type: 'block', block, occurrence: { start_time: block.start_time, end_time: block.end_time } }));
  return events.concat(blocks)
    .sort((a, b) => new Date(a.occurrence.start_time) - new Date(b.occurrence.start_time));
}

function publicBlockRecords(store = state.store) {
  return Array.isArray(store?.blockedTimes) ? store.blockedTimes.filter((block) => block?.id) : [];
}

function publicDayEventHtml(item) {
  if (item.type === 'block') return publicBlockedDayHtml(item.block);
  const { event, occurrence } = item;
  const details = {
    Organization: event.organization_name,
    Category: publicCategoryName(event),
    Venue: event.venue,
    Schedule: `${formatPublicDateTime(occurrence.start_time)} to ${formatTime(occurrence.end_time)}`,
    'Expected Attendees': event.expected_attendees,
    'Contact Person': event.contact_person,
    'Contact Number': event.contact_info,
    Description: event.public_description,
    Purpose: event.purpose
  };
  return `<article class="public-day-event" style="border-left-color:${escapeHtml(eventPrimaryColor(event))};--event-accent-color:${escapeHtml(eventAccentColor(event))}"><strong>${escapeHtml(event.title)}</strong><dl class="public-event-details">${detailRows(details)}</dl></article>`;
}

function publicBlockedDayHtml(block) {
  const details = {
    Type: 'Blocked university period',
    Schedule: `${formatPublicDateTime(block.start_time)} to ${formatTime(block.end_time)}`,
    Reason: block.reason || 'No reason provided.'
  };
  return `<article class="public-day-event public-blocked-card"><strong>${escapeHtml(block.title || 'Blocked university period')}</strong><dl class="public-event-details">${detailRows(details)}</dl></article>`;
}

function blockOverlapsDate(block, date) {
  const start = new Date(`${date}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return new Date(block.start_time) < end && new Date(block.end_time) > start;
}

function dateOnly(value) {
  return String(value || '').slice(0, 10);
}


function publicCategoryName(event) {
  const category = state.store.categories.find((item) => item.id === event.category_id || item.name === event.event_type);
  return category?.name || event.event_type || '';
}

function detailRows(data) {
  return Object.entries(data)
    .filter(([, value]) => value != null && String(value).trim() !== '')
    .map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`)
    .join('');
}

function positionPublicDayDialog(dialog, anchorEl) {
  if (!dialog) return;
  dialog.style.removeProperty('--dialog-left');
  dialog.style.removeProperty('--dialog-top');
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

function closePublicDayDialog() {
  const dialog = $('publicDayDialog');
  if (!dialog) return;
  state.selectedDate = '';
  dialog.classList.remove('open');
  dialog.setAttribute('aria-hidden', 'true');
}

function eventPrimaryColor(event) {
  const org = state.store.organizations.find((item) => item.id === event.organization_id || item.organization_name === event.organization_name);
  const assigned = org && (org.color || org.organization_color || org.assigned_color || org.theme_color || org.color_hex);
  if (isCssColor(assigned)) return assigned;
  return ['#2563EB', '#16A34A', '#DC2626', '#9333EA', '#EA580C', '#0891B2'][Math.abs(hashText(event.organization_id || event.organization_name || event.title)) % 6];
}

function eventAccentColor(event) {
  const category = state.store.categories.find((item) => item.id === event.category_id || item.name === event.event_type);
  if (category && isCssColor(category.color)) return category.color;
  return '#FACC15';
}

function isCssColor(value) {
  return typeof value === 'string' && /^(#(?:[0-9a-f]{3}){1,2}|rgb\(|rgba\(|hsl\(|hsla\()/i.test(value.trim());
}

function readableStatus(value) {
  if (!value) return '';
  return String(value).split('_').join(' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function formatPublicDateTime(value) {
  return new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function formatCompactTime(value) {
  return new Date(value).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }).replace(' AM', 'a').replace(' PM', 'p');
}

function nextDate(dateString) {
  const date = new Date(`${dateString}T12:00:00`);
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

function hashText(value) {
  return String(value || '').split('').reduce((hash, char) => ((hash << 5) - hash) + char.charCodeAt(0), 0);
}

function classToken(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9_-]/g, '');
}

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
}
