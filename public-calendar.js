import { loadStore } from './supabase-storage.js?v=20260605-cleanup-v1';
import { activeAnnouncements, eventOccurrences, isPublicEvent } from './app-rules.js?v=20260601-public-month-v2';

const $ = (id) => document.getElementById(id);
const state = { store: null, calendar: null, selectedDate: '' };

document.addEventListener('DOMContentLoaded', initPublicCalendar);

async function initPublicCalendar() {
  try {
    state.store = await loadPublicStore();
    renderAnnouncements();
    renderStatuses();
    initializePublicCalendar();
  } catch (error) {
    console.error('CONNECT public calendar failed to load:', error);
    showCalendarError();
  }
}

async function loadPublicStore() {
  const result = await loadStore();
  if (result.notice) console.info(result.notice);
  return result.store;
}

function showCalendarError() {
  const calendar = $('calendar');
  if (!calendar) return;
  calendar.innerHTML = '<div class="activity-item"><strong>Calendar failed to load.</strong><p>Please refresh the page.</p></div>';
}

function initializePublicCalendar() {
  state.calendar = new FullCalendar.Calendar($('calendar'), {
    initialView: 'dayGridMonth',
    firstDay: 1,
    height: '100%',
    headerToolbar: false,
    dayMaxEvents: false,
    dayMaxEventRows: false,
    views: { multiMonthYear: { type: 'multiMonth', duration: { months: 12 }, multiMonthMaxColumns: 3 } },
    events: publicEvents(),
    datesSet: (info) => { $('calendarTitle').textContent = info.view.title; },
    dateClick: (info) => openPublicDayDialog(info.dateStr, info.dayEl),
    eventClick: (info) => {
      const panelDate = info.event.extendedProps && info.event.extendedProps.panelDate ? info.event.extendedProps.panelDate : info.event.startStr;
      openPublicDayDialog(String(panelDate).slice(0, 10), info.el);
    },
    eventDidMount: applyPublicEventAccent
  });

  const todayButton = $('todayButton');
  const prevButton = $('prevButton');
  const nextButton = $('nextButton');
  const viewSelector = $('publicViewSelector');
  const closeButton = $('closePublicDayDialog');
  const menuButton = $('mobileMenuButton');
  const scrim = $('mobileScrim');

  if (todayButton) todayButton.addEventListener('click', () => state.calendar.today());
  if (prevButton) prevButton.addEventListener('click', () => state.calendar.prev());
  if (nextButton) nextButton.addEventListener('click', () => state.calendar.next());
  if (viewSelector) viewSelector.addEventListener('change', (event) => state.calendar.changeView(event.target.value));
  if (closeButton) closeButton.addEventListener('click', closePublicDayDialog);
  if (menuButton) menuButton.addEventListener('click', () => $('sidebar') && $('sidebar').classList.add('open'));
  if (scrim) scrim.addEventListener('click', () => $('sidebar') && $('sidebar').classList.remove('open'));
  document.addEventListener('pointerdown', handlePublicDialogPointerDown);
  document.addEventListener('keydown', handlePublicDialogKeyDown);
  window.addEventListener('resize', closePublicDayDialog);

  state.calendar.render();
}

function publicEvents() {
  const approvedEvents = state.store.events
    .filter((event) => event.approval_status === 'approved' && isPublicEvent(event))
  return approvedEvents.reduce((items, event) => items.concat(publicCalendarItems(event)), []);
}

function publicCalendarItems(event) {
  return consecutiveOccurrenceRanges(sortedEventOccurrences(event))
    .map((range, index) => fullCalendarRangeItem(event, range, index));
}

function sortedEventOccurrences(event) {
  return eventOccurrences(event)
    .filter((occurrence) => occurrence.date && occurrence.start_time && occurrence.end_time)
    .sort((a, b) => a.date.localeCompare(b.date) || new Date(a.start_time) - new Date(b.start_time));
}

function fullCalendarRangeItem(event, range, index) {
  const color = eventPrimaryColor(event);
  const accentColor = eventAccentColor(event);
  const first = range[0];
  const last = range[range.length - 1];
  const isMultiDay = range.length > 1;

  return {
    id: `${event.id}::public-range-${index}`,
    title: `${formatCompactTime(first.start_time)} ${event.title} - ${event.organization_name}`,
    start: isMultiDay ? first.date : first.start_time,
    end: isMultiDay ? nextDate(last.date) : first.end_time,
    allDay: isMultiDay,
    backgroundColor: color,
    borderColor: color,
    classNames: isMultiDay ? ['event-month-span', 'event-month-span-multi', 'public-multi-day-event'] : ['public-single-day-event'],
    extendedProps: { event, occurrence: first, panelDate: first.date, accentColor }
  };
}

function applyPublicEventAccent(info) {
  const accentColor = info.event.extendedProps && info.event.extendedProps.accentColor;
  if (accentColor) info.el.style.setProperty('--event-accent-color', accentColor);
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
  const announcements = activeAnnouncements(state.store).slice(0, 4);
  $('announcementPreview').innerHTML = announcements.map((item) => `<div class="notice ${escapeHtml(item.priority)}"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.content)}</p></div>`).join('') || '<p class="empty-text">No active announcements.</p>';
}

function renderStatuses() {
  const statuses = Array.isArray(state.store.activityStatuses) ? state.store.activityStatuses : [];
  const office = statuses.find((item) => item.id === 'incampus_offcampus' || item.key === 'incampus_offcampus');
  const president = statuses.find((item) => item.id === 'csc_president' || item.key === 'csc_president');
  $('officeStatusValue').textContent = (office && office.status_label) || readableStatus(office && office.status) || 'Status not posted';
  $('presidentStatusValue').textContent = (president && president.status_label) || readableStatus(president && president.status) || 'Status not posted';
}

function openPublicDayDialog(date, anchorEl) {
  state.selectedDate = date;
  const items = publicDayItems(date);
  const dialog = $('publicDayDialog');

  $('publicDayTitle').textContent = new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  $('publicDayCount').textContent = `${items.length} public event${items.length === 1 ? '' : 's'}`;
  $('publicDayEvents').innerHTML = items.map(publicDayEventHtml).join('') || '<p class="empty-text">No public events scheduled for this date.</p>';
  positionPublicDayDialog(dialog, anchorEl);
  dialog.classList.add('open');
  dialog.setAttribute('aria-hidden', 'false');
}

function publicDayItems(date) {
  return state.store.events
    .filter((event) => event.approval_status === 'approved' && isPublicEvent(event))
    .reduce((results, event) => {
      const matchingOccurrences = eventOccurrences(event)
        .filter((occurrence) => occurrence.date === date)
        .map((occurrence) => ({ event, occurrence }));
      return results.concat(matchingOccurrences);
    }, [])
    .sort((a, b) => new Date(a.occurrence.start_time) - new Date(b.occurrence.start_time));
}

function publicDayEventHtml({ event, occurrence }) {
  return `<article class="public-day-event" style="border-left-color:${escapeHtml(eventPrimaryColor(event))};--event-accent-color:${escapeHtml(eventAccentColor(event))}"><strong>${escapeHtml(event.title)}</strong><p>${formatTime(occurrence.start_time)} to ${formatTime(occurrence.end_time)}</p><p>${escapeHtml(event.organization_name)} - ${escapeHtml(event.venue)}</p><p>${escapeHtml(event.public_description || '')}</p></article>`;
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

function closePublicDayDialog() {
  const dialog = $('publicDayDialog');
  if (!dialog) return;
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

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
}
