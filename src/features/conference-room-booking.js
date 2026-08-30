import { createId } from './app-data.js?v=20260625-status-sync-v1';
import { accountLoginEmail, currentUser, isManager, isSuperAdmin, overlaps } from './app-rules.js?v=20260625-status-sync-v1';

(() => {
  const RUNTIME_VERSION = 'conference-room-booking-db-v6';
  window.__conferenceRoomBooking = RUNTIME_VERSION;

  const PAGE_ID = 'conferenceRoomModal';
  const BUTTON_ID = 'conferenceRoomButton';
  const ACTIVE_KEY = 'csc_conference_room_active_org';
  const CALENDAR_ID = 'conferenceRoomCalendar';
  const FORM_ID = 'conferenceRoomForm';
  const DETAILS_ID = 'conferenceRoomDetailsDialog';
  const ROOM_VENUE = 'Conference Room';
  const BOOKING_TITLE = 'Conference Room Booking';
  const FALLBACK_SUPABASE_KEY = 'sb_publishable_67aTD3F2GDhTpoiHzpYkdw_4fQrUJms';
  const CONFERENCE_APPROVER_EMAILS = new Set([
    'president@aup.edu.ph',
    'cscadviser@aup.edu.ph',
    'vicepresident@aup.edu.ph',
    'gensec@aup.edu.ph',
    'finance@aup.edu.ph',
    'assocgensec@aup.edu.ph'
  ]);
  let calendar = null;
  let selectedRange = null;

  function api() { return window.CSCPortalApi || {}; }
  function state() { return window.CONNECT_STATE; }
  function store() { return state()?.store; }
  function user() { return currentUser(store() || {}); }
  function isAdmin() { return isSuperAdmin(store() || {}); }
  function canApproveConferenceBookings() { return isAdmin() && CONFERENCE_APPROVER_EMAILS.has(accountLoginEmail(user())); }
  function isOrg() { return isManager(store() || {}) && !isAdmin(); }
  function ownBookingAccess(booking, current = user()) { return booking.created_by === current.id || (booking.organization_id && booking.organization_id === current.organization_id); }
  function clean(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char])); }
  function cap(value) { return String(value || '').split('_').join(' ').replace(/\b\w/g, (letter) => letter.toUpperCase()); }
  function jsonArray(value) {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string' || !value.trim()) return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  function dateTime(value) {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
  function localInput(value) {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const pad = (number) => String(number).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
  function localIso(value) {
    const text = String(value || '');
    return text.length === 16 ? text : localInput(value);
  }
  function dateOnly(value) {
    const text = String(value || '');
    if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const pad = (number) => String(number).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }
  function timeOnly(value) {
    const text = String(value || '');
    const match = text.match(/T(\d{2}:\d{2})/);
    if (match) return match[1];
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const pad = (number) => String(number).padStart(2, '0');
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
  function combineLocal(date, time) {
    return date && time ? `${date}T${time}` : '';
  }
  function addRepeatStep(date, repeatRule) {
    const next = new Date(`${date}T00:00`);
    if (Number.isNaN(next.getTime())) return '';
    if (repeatRule === 'daily') next.setDate(next.getDate() + 1);
    else if (repeatRule === 'weekly') next.setDate(next.getDate() + 7);
    else if (repeatRule === 'monthly') next.setMonth(next.getMonth() + 1);
    else return '';
    return dateOnly(next);
  }
  function defaultRepeatUntil(startTime, repeatRule) {
    const startDate = dateOnly(startTime);
    if (!startDate || repeatRule === 'none') return '';
    const date = new Date(`${startDate}T00:00`);
    if (Number.isNaN(date.getTime())) return '';
    date.setMonth(date.getMonth() + 1);
    date.setDate(date.getDate() - 1);
    return dateOnly(date);
  }
  function buildOccurrences(startTime, endTime, repeatRule = 'none', repeatUntil = '') {
    const startDate = dateOnly(startTime);
    const endDate = dateOnly(endTime) || startDate;
    const startClock = timeOnly(startTime);
    const endClock = timeOnly(endTime);
    if (!startDate || !startClock || !endClock) return [];
    const rule = ['daily', 'weekly', 'monthly'].includes(repeatRule) ? repeatRule : 'none';
    const untilDate = rule === 'none' ? startDate : (dateOnly(repeatUntil) || defaultRepeatUntil(startTime, rule));
    const occurrences = [];
    let currentStartDate = startDate;
    let currentEndDate = endDate;
    for (let index = 0; index < 80; index += 1) {
      if (currentStartDate > untilDate) break;
      const occurrenceStart = combineLocal(currentStartDate, startClock);
      const occurrenceEnd = combineLocal(currentEndDate, endClock);
      if (occurrenceStart && occurrenceEnd && new Date(occurrenceEnd) > new Date(occurrenceStart)) {
        occurrences.push({ id: createId(), date: currentStartDate, start_time: occurrenceStart, end_time: occurrenceEnd });
      }
      if (rule === 'none') break;
      currentStartDate = addRepeatStep(currentStartDate, rule);
      currentEndDate = addRepeatStep(currentEndDate, rule);
      if (!currentStartDate || !currentEndDate) break;
    }
    return occurrences;
  }
  function normalizeBookingOccurrence(booking = {}, occurrence = {}, index = 0) {
    const date = dateOnly(occurrence.date || occurrence.start_time || booking.start_time);
    const startClock = timeOnly(occurrence.start_time || booking.start_time);
    const endClock = timeOnly(occurrence.end_time || booking.end_time);
    if (!date || !startClock || !endClock) return null;
    const start_time = combineLocal(date, startClock);
    const endDate = dateOnly(occurrence.end_time) || date;
    const end_time = combineLocal(endDate >= date ? endDate : date, endClock);
    if (!start_time || !end_time || new Date(end_time) <= new Date(start_time)) return null;
    return {
      ...occurrence,
      id: occurrence.id || `${booking.id || 'booking'}-${date}-${startClock}-${index}`,
      date,
      start_time,
      end_time
    };
  }
  function bookingOccurrences(booking = {}) {
    const rawRows = jsonArray(booking.occurrences).filter((occurrence) => occurrence?.start_time && occurrence?.end_time);
    const rows = rawRows.length ? rawRows : [{ id: booking.id || createId(), date: dateOnly(booking.start_time), start_time: booking.start_time || '', end_time: booking.end_time || '' }];
    const bySlot = new Map();
    rows.map((occurrence, index) => normalizeBookingOccurrence(booking, occurrence, index)).filter(Boolean).forEach((occurrence) => {
      const key = `${occurrence.date}|${occurrence.start_time}|${occurrence.end_time}`;
      if (!bySlot.has(key)) bySlot.set(key, occurrence);
    });
    return [...bySlot.values()].sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
  }
  function repeatLabel(booking = {}) {
    const occurrences = bookingOccurrences(booking);
    const rule = String(booking.repeat_rule || booking.recurrence_type || inferRepeatRule(occurrences) || 'none');
    if (rule === 'daily') return 'Daily';
    if (rule === 'weekly') return 'Weekly';
    if (rule === 'monthly') return 'Monthly';
    return 'Does not repeat';
  }
  function inferRepeatRule(occurrences = []) {
    if (!Array.isArray(occurrences) || occurrences.length < 2) return 'none';
    const days = occurrences.map((occurrence) => dateOnly(occurrence.start_time || occurrence.date)).filter(Boolean);
    if (days.length < 2) return 'none';
    const deltas = days.slice(1).map((day, index) => Math.round((new Date(`${day}T00:00`) - new Date(`${days[index]}T00:00`)) / 86400000));
    if (deltas.every((delta) => delta === 1)) return 'daily';
    if (deltas.every((delta) => delta === 7)) return 'weekly';
    return 'monthly';
  }
  function repeatUntilLabel(booking = {}) {
    const explicit = dateOnly(booking.repeat_until || booking.recurrence_until);
    if (explicit) return explicit;
    const occurrences = bookingOccurrences(booking);
    return occurrences.length > 1 ? dateOnly(occurrences[occurrences.length - 1].start_time || occurrences[occurrences.length - 1].date) : '';
  }
  function active(event = {}) {
    return !['cancelled', 'disabled', 'completed'].includes(event.event_status || 'planned');
  }
  function bookingStatus(event = {}) {
    return String(event.approval_status || 'pending').trim().toLowerCase();
  }
  function reservesConferenceSlot(event = {}) {
    return ['pending', 'approved'].includes(bookingStatus(event));
  }
  function isConference(event = {}) {
    const scheduleType = String(event.schedule_type || '').trim().toLowerCase();
    const venue = String(event.venue || '').trim().toLowerCase();
    const title = String(event.title || '').trim().toLowerCase();
    const eventType = String(event.event_type || event.booking_type || event.type || '').trim().toLowerCase();
    const category = String(event.category_id || event.category || '').trim().toLowerCase();
    return scheduleType === 'conference_room_booking'
      || venue === ROOM_VENUE.toLowerCase()
      || title === 'conference room booking'
      || eventType === 'conference room booking'
      || eventType === 'conference_room_booking'
      || category === 'conference_room'
      || category === 'conference room';
  }
  function visibleBookings() {
    return (store()?.events || []).filter((event) => {
      if (!isConference(event) || !active(event)) return false;
      return reservesConferenceSlot(event);
    });
  }
  function bookingConflict(startTime, endTime, ignoreId = '', statuses = ['pending', 'approved']) {
    const blockingStatuses = new Set(statuses);
    const candidates = Array.isArray(startTime) ? startTime : [{ start_time: startTime, end_time: endTime }];
    return (store()?.events || []).find((event) => {
      if (event.id === ignoreId || !isConference(event) || !active(event) || !blockingStatuses.has(bookingStatus(event))) return false;
      return candidates.some((candidate) => bookingOccurrences(event).some((occurrence) => overlaps(candidate.start_time, candidate.end_time, occurrence.start_time, occurrence.end_time)));
    }) || null;
  }
  function approvedConflict(startTime, endTime, ignoreId = '') {
    return bookingConflict(startTime, endTime, ignoreId, ['approved']);
  }
  function reservedConflict(startTime, endTime, ignoreId = '') {
    return bookingConflict(startTime, endTime, ignoreId, ['pending', 'approved']);
  }
  function session() {
    try { return JSON.parse(sessionStorage.getItem('core_supabase_auth_session') || 'null'); }
    catch { return null; }
  }
  function isReloadNavigation() {
    const entry = performance.getEntriesByType?.('navigation')?.[0];
    if (entry?.type) return entry.type === 'reload';
    return performance.navigation?.type === 1;
  }
  function restorePageAfterReload(attempt = 0) {
    let shouldRestore = false;
    try { shouldRestore = sessionStorage.getItem(ACTIVE_KEY) === '1'; } catch {}
    if (!shouldRestore || !isReloadNavigation()) return;
    if (!state()?.store && attempt < 40) {
      window.setTimeout(() => restorePageAfterReload(attempt + 1), 100);
      return;
    }
    openPage();
  }
  function authUserId() {
    return uuid(session()?.user?.id || window.CONNECT_AUTHENTICATED_USER?.auth_id || window.CONNECT_AUTHENTICATED_USER?.auth_user_id);
  }
  function uuid(value) {
    const text = String(value || '');
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : null;
  }
  function organizationUuid(booking = {}) {
    const direct = uuid(booking.organization_id);
    if (direct) return direct;
    const bookingName = String(booking.organization_name || '').trim().toLowerCase();
    const match = (store()?.organizations || []).find((org) =>
      String(org.id || '') === String(booking.organization_id || '')
      || (bookingName && String(org.organization_name || org.name || '').trim().toLowerCase() === bookingName)
    );
    return uuid(match?.id);
  }
  function dbHeaders() {
    const key = supabaseKey();
    return {
      apikey: key,
      Authorization: `Bearer ${session()?.access_token || key}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal'
    };
  }
  function dbReadHeaders(authenticated = Boolean(session()?.access_token)) {
    const key = supabaseKey();
    return {
      apikey: key,
      Authorization: `Bearer ${authenticated ? session()?.access_token || key : key}`,
      'Content-Type': 'application/json'
    };
  }
  function supabaseKey() {
    const config = window.SUPABASE_CONFIG || {};
    return String(config.publishableKey || config.anonKey || config.apiKey || config.apikey || FALLBACK_SUPABASE_KEY || '').trim();
  }
  function supabaseUrl() {
    return String(window.SUPABASE_CONFIG?.url || 'https://ockpzmmpxebqmeipirsz.supabase.co').replace(/\/$/, '');
  }
  function dbRow(booking) {
    const now = new Date().toISOString();
    return {
      id: booking.id,
      record_type: 'schedule',
      schedule_source: booking.schedule_source || 'organization',
      created_by_role: booking.created_by_role || booking.schedule_source || 'organization',
      requires_approval: booking.requires_approval !== false,
      organization_id: organizationUuid(booking),
      organization_name: bookingOrganizationName(booking),
      category_id: booking.category_id || 'meeting',
      title: booking.title || bookingOrganizationName(booking) || bookingTitle(),
      venue: ROOM_VENUE,
      schedule_type: 'conference_room_booking',
      start_time: booking.start_time,
      end_time: booking.end_time,
      occurrences: Array.isArray(booking.occurrences) ? booking.occurrences : [],
      repeat_rule: booking.repeat_rule || 'none',
      repeat_until: booking.repeat_until || null,
      recurrence_type: booking.repeat_rule || booking.recurrence_type || 'none',
      recurrence_until: booking.repeat_until || booking.recurrence_until || null,
      expected_attendees: Math.max(1, Number.parseInt(booking.expected_attendees, 10) || 1),
      attendee_names: bookingAttendees(booking),
      activity_description: bookingActivityDescription(booking),
      activity_description_other: clean(booking.activity_description_other),
      privacy_level: booking.privacy_level || 'internal',
      contact_person: bookingContactPerson(booking) || null,
      contact_info: bookingContactInfo(booking) || null,
      public_description: booking.public_description || 'Conference room booking',
      purpose: booking.purpose || 'Conference room booking',
      approval_status: booking.approval_status || 'pending',
      admin_recommendation: booking.admin_recommendation || null,
      approval_date: booking.approval_date || null,
      reviewed_by: booking.reviewed_by ? (authUserId() || uuid(booking.reviewed_by)) : null,
      approved_by: booking.approved_by ? (authUserId() || uuid(booking.approved_by)) : null,
      event_status: booking.event_status || 'planned',
      notification_status: booking.notification_status || null,
      notification_read_by: booking.notification_read_by && typeof booking.notification_read_by === 'object' ? booking.notification_read_by : {},
      created_by: uuid(booking.created_by) || authUserId() || null,
      created_at: booking.created_at || now,
      updated_at: booking.updated_at || now
    };
  }
  async function saveBookingToDatabase(booking) {
    if (!supabaseUrl() || !supabaseKey()) throw new Error('Supabase config is missing for conference room booking.');
    let row = dbRow(booking);
    const strippedColumns = new Set();
    const existingBooking = (store()?.events || []).some((event) => event.id === booking.id);
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await fetch(bookingSaveUrl(row.id, existingBooking), {
        method: existingBooking ? 'PATCH' : 'POST',
        headers: dbHeaders(),
        body: JSON.stringify(row)
      });
      if (response.ok) {
        if (strippedColumns.size) console.warn('CONNECT conference room save skipped unsupported columns:', [...strippedColumns]);
        return;
      }
      const payload = await response.json().catch(() => ({}));
      console.warn('CONNECT conference room save failed:', payload, row);
      if (!existingBooking && response.status === 409) {
        const patchResponse = await fetch(bookingSaveUrl(row.id, true), {
          method: 'PATCH',
          headers: dbHeaders(),
          body: JSON.stringify(row)
        });
        if (patchResponse.ok) return;
        const patchPayload = await patchResponse.json().catch(() => ({}));
        console.warn('CONNECT conference room duplicate patch failed:', patchPayload, row);
        throw new Error(supabaseErrorMessage(patchPayload, patchResponse.status));
      }
      const missing = missingBookingColumn(payload);
      if (!missing || strippedColumns.has(missing) || !(missing in row)) {
        throw new Error(supabaseErrorMessage(payload, response.status));
      }
      strippedColumns.add(missing);
      row = { ...row };
      delete row[missing];
    }
    throw new Error('Conference room booking save failed because the database schema is missing too many columns.');
  }
  async function saveBookingMirrorToCalendarItems(booking) {
    if (!supabaseUrl() || !supabaseKey()) return;
    let row = dbRow(booking);
    const strippedColumns = new Set();
    const existingBooking = (store()?.events || []).some((event) => event.id === booking.id);
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await fetch(`${supabaseUrl()}/rest/v1/calendar_items${existingBooking ? `?id=eq.${encodeURIComponent(row.id)}` : ''}`, {
        method: existingBooking ? 'PATCH' : 'POST',
        headers: dbHeaders(),
        body: JSON.stringify(row)
      });
      if (response.ok) return;
      const payload = await response.json().catch(() => ({}));
      if (!existingBooking && response.status === 409) {
        const patchResponse = await fetch(`${supabaseUrl()}/rest/v1/calendar_items?id=eq.${encodeURIComponent(row.id)}`, {
          method: 'PATCH',
          headers: dbHeaders(),
          body: JSON.stringify(row)
        });
        if (patchResponse.ok) return;
      }
      const missing = missingBookingColumn(payload);
      if (!missing || strippedColumns.has(missing) || !(missing in row)) {
        console.warn('CONNECT conference room calendar_items mirror failed:', payload);
        return;
      }
      strippedColumns.add(missing);
      row = { ...row };
      delete row[missing];
    }
  }
  function bookingSaveUrl(id, existingBooking) {
    const base = `${supabaseUrl()}/rest/v1/conference_room_bookings`;
    return existingBooking ? `${base}?id=eq.${encodeURIComponent(id)}` : base;
  }
  function supabaseErrorMessage(payload = {}, status = 400) {
    return [payload.message, payload.details, payload.hint, payload.error].filter(Boolean).join(' ') || `Conference room booking save failed (${status})`;
  }
  function missingBookingColumn(payload = {}) {
    const text = `${payload.message || ''} ${payload.details || ''} ${payload.hint || ''}`;
    const match = text.match(/'([^']+)' column of 'conference_room_bookings'|Could not find the '([^']+)' column/i);
    return match?.[1] || match?.[2] || '';
  }
  function upsertLocalBooking(booking) {
    const currentStore = store();
    if (!currentStore) return;
    if (!Array.isArray(currentStore.events)) currentStore.events = [];
    const existingIndex = currentStore.events.findIndex((event) => event.id === booking.id);
    if (existingIndex >= 0) currentStore.events[existingIndex] = { ...currentStore.events[existingIndex], ...booking };
    else currentStore.events.push(booking);
    state()?.calendar?.refetchEvents?.();
    state()?.calendar?.render?.();
    window.dispatchEvent(new CustomEvent('csc:store-rendered'));
  }
  function hasStoredValue(value) {
    if (Array.isArray(value)) return value.length > 0;
    if (value && typeof value === 'object') return Object.keys(value).length > 0;
    return value !== null && value !== undefined && String(value).trim() !== '';
  }
  function repeatValue(value) {
    const text = String(value || '').trim();
    return text && text !== 'none' ? text : '';
  }
  function mergeConferenceRows(left = {}, right = {}) {
    if (!left?.id) return right || {};
    if (!right?.id) return left || {};
    const leftUpdated = new Date(left.updated_at || left.created_at || 0);
    const rightUpdated = new Date(right.updated_at || right.created_at || 0);
    const base = rightUpdated >= leftUpdated ? { ...left, ...right } : { ...right, ...left };
    const leftOccurrences = bookingOccurrences(left);
    const rightOccurrences = bookingOccurrences(right);
    if (leftOccurrences.length || rightOccurrences.length) {
      base.occurrences = rightOccurrences.length >= leftOccurrences.length ? rightOccurrences : leftOccurrences;
    }
    [
      'repeat_rule',
      'repeat_until',
      'recurrence_type',
      'recurrence_until',
      'attendee_names',
      'activity_description',
      'activity_description_other',
      'contact_person',
      'contact_info',
      'public_description',
      'purpose'
    ].forEach((key) => {
      if (!hasStoredValue(base[key])) base[key] = hasStoredValue(right[key]) ? right[key] : left[key];
    });
    if (!hasStoredValue(base.repeat_rule) && hasStoredValue(base.recurrence_type)) base.repeat_rule = base.recurrence_type;
    if (!hasStoredValue(base.repeat_until) && hasStoredValue(base.recurrence_until)) base.repeat_until = base.recurrence_until;
    const mergedOccurrences = bookingOccurrences(base);
    const preservedRule = repeatValue(right.repeat_rule) || repeatValue(right.recurrence_type) || repeatValue(left.repeat_rule) || repeatValue(left.recurrence_type);
    if (mergedOccurrences.length > 1 && (!repeatValue(base.repeat_rule) || base.repeat_rule === 'none')) {
      base.repeat_rule = preservedRule || inferRepeatRule(mergedOccurrences);
      base.recurrence_type = base.repeat_rule;
    }
    if (mergedOccurrences.length > 1 && !hasStoredValue(base.repeat_until)) {
      base.repeat_until = dateOnly(mergedOccurrences[mergedOccurrences.length - 1].start_time || mergedOccurrences[mergedOccurrences.length - 1].date);
      base.recurrence_until = base.repeat_until;
    }
    return base;
  }
  function conferenceBookingFromRow(row = {}) {
    const occurrences = bookingOccurrences({ ...row, occurrences: jsonArray(row.occurrences) });
    const inferredRepeat = occurrences.length > 1 ? inferRepeatRule(occurrences) : 'none';
    const repeatRule = repeatValue(row.repeat_rule) || repeatValue(row.recurrence_type) || inferredRepeat;
    return {
      ...row,
      record_type: 'schedule',
      schedule_source: row.schedule_source || row.created_by_role || (row.requires_approval === false ? 'admin' : 'organization'),
      created_by_role: row.created_by_role || row.schedule_source || (row.requires_approval === false ? 'admin' : 'organization'),
      requires_approval: row.requires_approval !== false,
      schedule_type: row.schedule_type || 'conference_room_booking',
      event_type: row.event_type || row.booking_type || 'Conference Room Booking',
      venue: row.venue || ROOM_VENUE,
      title: row.title || row.organization_name || BOOKING_TITLE,
      category_id: row.category_id || 'meeting',
      approval_status: row.approval_status || 'pending',
      event_status: row.event_status || 'planned',
      privacy_level: row.privacy_level || 'internal',
      occurrences,
      repeat_rule: repeatRule,
      repeat_until: row.repeat_until || row.recurrence_until || (occurrences.length > 1 ? dateOnly(occurrences[occurrences.length - 1].start_time || occurrences[occurrences.length - 1].date) : ''),
      attendee_names: jsonArray(row.attendee_names),
      notification_read_by: row.notification_read_by && typeof row.notification_read_by === 'object' ? row.notification_read_by : {},
      updated_at: row.updated_at || row.created_at || new Date().toISOString()
    };
  }
  function mergeDatabaseBookings(rows = []) {
    const currentStore = store();
    if (!currentStore) return;
    if (!Array.isArray(currentStore.events)) currentStore.events = [];
    const byId = new Map(currentStore.events.filter((event) => isConference(event) && event.id).map((event) => [event.id, event]));
    rows.filter((row) => row && row.id).forEach((row) => {
      byId.set(row.id, mergeConferenceRows(byId.get(row.id), row));
    });
    const conferenceEvents = [...byId.values()].map(conferenceBookingFromRow);
    currentStore.events = [...currentStore.events.filter((event) => !isConference(event)), ...conferenceEvents];
    refresh();
    window.dispatchEvent(new CustomEvent('csc:store-rendered'));
  }
  async function fetchConferenceBookings(authenticated = Boolean(session()?.access_token)) {
    const response = await fetch(`${supabaseUrl()}/rest/v1/conference_room_bookings?select=*&order=start_time.asc`, {
      headers: dbReadHeaders(authenticated)
    });
    const payload = response.status === 204 ? [] : await response.json().catch(() => []);
    if (!response.ok) throw new Error(payload?.message || payload?.error || `Conference room bookings fetch failed (${response.status})`);
    return Array.isArray(payload) ? payload : [];
  }
  async function fetchCalendarItemConferenceBookings(authenticated = Boolean(session()?.access_token)) {
    const params = new URLSearchParams({
      select: '*',
      record_type: 'eq.schedule',
      schedule_type: 'eq.conference_room_booking',
      order: 'start_time.asc'
    });
    const response = await fetch(`${supabaseUrl()}/rest/v1/calendar_items?${params.toString()}`, {
      headers: dbReadHeaders(authenticated)
    });
    const payload = response.status === 204 ? [] : await response.json().catch(() => []);
    if (!response.ok) throw new Error(payload?.message || payload?.error || `Conference room calendar-items fetch failed (${response.status})`);
    return Array.isArray(payload) ? payload : [];
  }
  async function fetchAllConferenceBookings(authenticated = Boolean(session()?.access_token)) {
    const [bookings, calendarItems] = await Promise.allSettled([
      fetchConferenceBookings(authenticated),
      fetchCalendarItemConferenceBookings(authenticated)
    ]);
    const rows = [
      ...(bookings.status === 'fulfilled' ? bookings.value : []),
      ...(calendarItems.status === 'fulfilled' ? calendarItems.value : [])
    ];
    const byId = new Map();
    rows.forEach((row) => {
      if (!row?.id) return;
      byId.set(row.id, mergeConferenceRows(byId.get(row.id), row));
    });
    if (!rows.length) {
      const reason = bookings.reason || calendarItems.reason;
      if (reason) throw reason;
    }
    return [...byId.values()];
  }
  async function refreshBookingsFromDatabase() {
    if (!supabaseUrl() || !supabaseKey()) return;
    try {
      mergeDatabaseBookings(await fetchAllConferenceBookings(true));
    } catch (error) {
      try {
        await window.CSC_RELOAD_MAIN_DASHBOARD_STORE?.();
        refresh();
      } catch {}
      try {
        mergeDatabaseBookings(await fetchAllConferenceBookings(false));
      } catch (fallbackError) {
        console.warn('Conference room bookings could not be fetched:', fallbackError || error);
      }
    }
  }
  async function deleteBookingFromDatabase(booking) {
    if (!booking?.id) throw new Error('Conference room booking id is missing.');
    if (!supabaseUrl() || !supabaseKey()) throw new Error('Supabase config is missing for conference room booking.');
    const response = await fetch(bookingSaveUrl(booking.id, true), {
      method: 'DELETE',
      headers: dbHeaders()
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(supabaseErrorMessage(payload, response.status));
    }
    fetch(`${supabaseUrl()}/rest/v1/calendar_items?id=eq.${encodeURIComponent(booking.id)}`, {
      method: 'DELETE',
      headers: dbHeaders()
    }).catch((error) => console.warn('Conference room calendar_items mirror delete failed:', error));
  }
  function removeLocalBooking(id) {
    const currentStore = store();
    if (!currentStore || !Array.isArray(currentStore.events)) return;
    currentStore.events = currentStore.events.filter((event) => event.id !== id);
    state()?.calendar?.getEventById?.(id)?.remove?.();
    state()?.calendar?.refetchEvents?.();
    state()?.calendar?.render?.();
    window.dispatchEvent(new CustomEvent('csc:store-rendered'));
  }
  async function databaseBookingConflict(startTime, endTime, ignoreId = '', statuses = ['pending', 'approved']) {
    if (!supabaseUrl() || !supabaseKey()) return null;
    const params = new URLSearchParams({
      select: 'id,title,organization_name,start_time,end_time,occurrences,approval_status,event_status,venue,schedule_type',
      record_type: 'eq.schedule',
      approval_status: `in.(${statuses.join(',')})`,
      limit: '1000'
    });
    const response = await fetch(`${supabaseUrl()}/rest/v1/conference_room_bookings?${params.toString()}`, {
      headers: dbHeaders()
    });
    if (!response.ok) return null;
    const rows = await response.json().catch(() => []);
    const candidates = Array.isArray(startTime) ? startTime : [{ start_time: startTime, end_time: endTime }];
    return (Array.isArray(rows) ? rows : []).find((event) =>
      event.id !== ignoreId
      && isConference(event)
      && active(event)
      && statuses.includes(bookingStatus(event))
      && candidates.some((candidate) => bookingOccurrences(event).some((occurrence) => overlaps(candidate.start_time, candidate.end_time, occurrence.start_time, occurrence.end_time)))
    ) || null;
  }
  async function databaseReservedConflict(startTime, endTime, ignoreId = '') {
    return databaseBookingConflict(startTime, endTime, ignoreId, ['pending', 'approved']);
  }
  async function databaseApprovedConflict(startTime, endTime, ignoreId = '') {
    return databaseBookingConflict(startTime, endTime, ignoreId, ['approved']);
  }
  async function notificationService() {
    try {
      const service = await import('./notification-service.js?v=20260819-duplex-notifications-v1');
      service.configureNotifications({
        storeProvider: () => store(),
        userProvider: () => user(),
        isAdminProvider: () => canApproveConferenceBookings()
      });
      return service;
    } catch (error) {
      console.warn('Conference notifications unavailable:', error.message);
      return null;
    }
  }
  async function notifyAdmins(booking = {}) {
    const service = await notificationService();
    return service?.notifyAdmins({
      notification_type: 'conference_submitted',
      reference_table: 'conference_room_bookings',
      reference_id: booking.id || '',
      title: 'New Conference Room Booking',
      message: `${bookingOrganizationName(booking)} submitted a conference room booking.`
    });
  }
  async function notifyBookingOwner(booking = {}, status = 'approved', remarks = '') {
    const service = await notificationService();
    return service?.notifyOrganization(booking, {
      notification_type: status === 'approved' ? 'conference_approved' : 'conference_rejected',
      reference_table: 'conference_room_bookings',
      reference_id: booking.id || '',
      title: `Conference Room Booking ${status === 'approved' ? 'Approved' : 'Rejected'}`,
      message: `Your conference room booking was ${status}.${remarks ? ` Remarks: ${remarks}` : ''}`
    });
  }
  function bookingTitle() {
    return BOOKING_TITLE;
  }
  function organizationNameForAccount(current = user()) {
    const direct = clean(current.organization_name || current.organizationName || current.organization || current.org_name || current.orgName);
    if (direct) return direct;
    const hasAccountValue = clean(current.id || current.full_name || current.name || current.email || current.username || current.organization_id);
    if (!hasAccountValue) return '';
    const byId = (store()?.organizations || []).find((org) => String(org.id || '') === String(current.organization_id || ''));
    return clean(byId?.organization_name || byId?.name || current.full_name || current.name || accountLoginEmail(current)) || 'Organization';
  }
  function bookingOrganizationName(booking = {}) {
    const direct = clean(booking.organization_name || booking.organizationName || booking.organization);
    if (direct) return direct;
    const current = user();
    if (booking.created_by === current.id) return organizationNameForAccount(current);
    const creator = creatorForBooking(booking);
    return organizationNameForAccount(creator) || clean(booking.title) || 'Organization';
  }
  function authenticatedProfileId(current = user()) {
    return String(session()?.user?.id || current?.id || '').trim();
  }
  function adminContactCache(current = user()) {
    try {
      const cache = JSON.parse(localStorage.getItem('csc-admin-profile-contact-cache') || '{}');
      return cache[authenticatedProfileId(current)] || cache[accountLoginEmail(current)] || null;
    } catch {
      return null;
    }
  }
  function accountMessenger(current = user()) {
    const cached = adminContactCache(current);
    return clean(cached?.messenger_account || current.messenger_account || current.messengerAccount || current.messenger || current.full_name || organizationNameForAccount(current));
  }
  function accountPhone(current = user()) {
    const cached = adminContactCache(current);
    const digits = String(cached?.contact_number || current.contact_number || current.phone_number || '').replace(/\D/g, '');
    return digits ? digits.padEnd(11, '0').slice(0, 11) : '00000000000';
  }
  function creatorForBooking(booking = {}) {
    return (store()?.users || []).find((item) => String(item.id || '') === String(booking.created_by || '')) || {};
  }
  function bookingContactPerson(booking = {}) {
    const current = user();
    if (booking.created_by === current.id) return accountMessenger(current);
    const creator = creatorForBooking(booking);
    const stored = clean(booking.contact_person);
    const creatorMessenger = clean(creator.messenger_account || creator.messengerAccount || creator.messenger);
    const fallbackNames = new Set([
      bookingTitle().toLowerCase(),
      bookingOrganizationName(booking).toLowerCase(),
      clean(creator.full_name).toLowerCase(),
      clean(creator.name).toLowerCase()
    ].filter(Boolean));
    if (stored && !fallbackNames.has(stored.toLowerCase())) return stored;
    return creatorMessenger || stored || clean(creator.full_name || creator.name);
  }
  function bookingContactInfo(booking = {}) {
    const current = user();
    if (booking.created_by === current.id) return accountPhone(current);
    const creator = creatorForBooking(booking);
    const stored = String(booking.contact_info || '').replace(/\D/g, '');
    const creatorPhone = String(creator.contact_number || creator.phone_number || '').replace(/\D/g, '');
    const digits = stored && !/^0{11}$/.test(stored) ? stored : creatorPhone;
    return digits ? digits.padEnd(11, '0').slice(0, 11) : '';
  }
  function bookingAttendees(booking = {}) {
    const source = booking.attendee_names || booking.attendees || [];
    if (Array.isArray(source)) return source.map(clean).filter(Boolean).slice(0, 30);
    if (typeof source === 'string') {
      try {
        const parsed = JSON.parse(source);
        if (Array.isArray(parsed)) return parsed.map(clean).filter(Boolean).slice(0, 30);
      } catch {}
      return source.split(/\r?\n|,/).map(clean).filter(Boolean).slice(0, 30);
    }
    return [];
  }
  function attendeeInputs(form = document.getElementById(FORM_ID)) {
    return Array.from(form?.querySelectorAll('[data-attendee-input]') || []);
  }
  function formAttendees(form = document.getElementById(FORM_ID)) {
    return attendeeInputs(form).map((input) => clean(input.value)).filter(Boolean).slice(0, 30);
  }
  function updateAttendeeCount(form = document.getElementById(FORM_ID)) {
    const counter = form?.querySelector('[data-attendee-count]');
    if (counter) counter.textContent = `${formAttendees(form).length}/30`;
    const addButton = form?.querySelector('[data-add-attendee]');
    if (addButton) addButton.disabled = attendeeInputs(form).length >= 30;
  }
  function addAttendeeRow(value = '') {
    const form = document.getElementById(FORM_ID);
    const list = form?.querySelector('[data-attendees-list]');
    if (!form || !list || attendeeInputs(form).length >= 30) return;
    const row = document.createElement('div');
    row.className = 'conference-attendee-row';
    row.innerHTML = `<input type="text" data-attendee-input maxlength="80" placeholder="Student name"><button type="button" class="secondary-button" data-remove-attendee aria-label="Remove attendee">Remove</button>`;
    const input = row.querySelector('[data-attendee-input]');
    input.value = value;
    input.addEventListener('input', () => updateAttendeeCount(form));
    row.querySelector('[data-remove-attendee]')?.addEventListener('click', () => {
      row.remove();
      if (!attendeeInputs(form).length) addAttendeeRow();
      updateAttendeeCount(form);
    });
    list.appendChild(row);
    updateAttendeeCount(form);
  }
  function resetAttendeeRows(values = []) {
    const form = document.getElementById(FORM_ID);
    const list = form?.querySelector('[data-attendees-list]');
    if (!list) return;
    list.innerHTML = '';
    const names = values.map(clean).filter(Boolean).slice(0, 30);
    (names.length ? names : ['']).forEach((name) => addAttendeeRow(name));
    updateAttendeeCount(form);
  }
  function toggleActivityOther(form = document.getElementById(FORM_ID)) {
    const field = form?.querySelector('[data-activity-other-field]');
    const input = form?.elements?.activity_description_other;
    const isOther = form?.elements?.activity_description?.value === 'Others';
    if (!field || !input) return;
    field.hidden = !isOther;
    input.required = !!isOther;
    if (!isOther) input.value = '';
  }
  function bookingActivityDescription(booking = {}) {
    const selected = clean(booking.activity_description || booking.category_name || booking.public_description || booking.purpose);
    if (selected === 'Others') return clean(booking.activity_description_other) || 'Others';
    return selected || 'Meeting';
  }
  function attendeeListText(booking = {}) {
    const attendees = bookingAttendees(booking);
    return attendees.length ? attendees.join(', ') : `${Math.max(1, Number.parseInt(booking.expected_attendees, 10) || 1)} attendee(s)`;
  }
  function buildBooking(form) {
    const current = user();
    const startTime = localIso(form.start.value);
    const endTime = localIso(form.end.value);
    const repeatRule = clean(form.repeat_rule?.value || 'none');
    const repeatUntil = dateOnly(form.repeat_until?.value || defaultRepeatUntil(startTime, repeatRule));
    const occurrences = buildOccurrences(startTime, endTime, repeatRule, repeatUntil);
    const organizationName = organizationNameForAccount(current);
    const attendees = formAttendees(form);
    const activityDescription = clean(form.activity_description.value);
    const activityDescriptionOther = clean(form.activity_description_other.value);
    const resolvedActivityDescription = activityDescription === 'Others' ? activityDescriptionOther : activityDescription;
    const autoApproved = canApproveConferenceBookings();
    const organizationId = isAdmin()
      ? (store()?.organizations || []).find((org) => org.organization_name === organizationName)?.id || current.organization_id || ''
      : current.organization_id || '';
    const now = new Date().toISOString();
    const source = autoApproved ? 'admin' : 'organization';
    const booking = {
      id: createId(),
      record_type: 'schedule',
      schedule_schema_version: 2,
      schedule_source: source,
      created_by_role: source,
      requires_approval: !autoApproved,
      approval_status: autoApproved ? 'approved' : 'pending',
      approval_date: autoApproved ? now : '',
      approved_by: autoApproved ? current.id : '',
      reviewed_by: autoApproved ? current.id : '',
      event_status: 'planned',
      privacy_level: 'internal',
      revision_of: '',
      created_by: current.id,
      organization_id: organizationId,
      organization_name: organizationName,
      title: organizationName,
      category_id: 'meeting',
      category_name: 'Meeting',
      venue: ROOM_VENUE,
      schedule_type: 'conference_room_booking',
      event_type: 'Conference Room Booking',
      start_time: occurrences[0]?.start_time || startTime,
      end_time: occurrences[0]?.end_time || endTime,
      occurrences,
      repeat_rule: repeatRule,
      repeat_until: repeatRule === 'none' ? '' : repeatUntil,
      expected_attendees: Math.max(1, attendees.length),
      attendee_names: attendees,
      activity_description: activityDescription,
      activity_description_other: activityDescriptionOther,
      contact_person: accountMessenger(current),
      contact_info: accountPhone(current),
      public_description: resolvedActivityDescription,
      purpose: resolvedActivityDescription,
      private_notes: resolvedActivityDescription,
      created_at: now,
      updated_at: now
    };
    booking.title = organizationName;
    return booking;
  }
  function renderEvents() {
    return visibleBookings().flatMap((booking) => bookingOccurrences(booking).map((occurrence, index) => ({
      id: `${booking.id}:${occurrence.id || index}`,
      title: bookingOrganizationName(booking) || 'Organization',
      start: occurrence.start_time,
      end: occurrence.end_time,
      backgroundColor: booking.approval_status === 'approved' ? '#2563eb' : '#d97706',
      borderColor: booking.approval_status === 'approved' ? '#1d4ed8' : '#b45309',
      editable: bookingOccurrences(booking).length === 1 && (booking.created_by === user().id || canApproveConferenceBookings()),
      extendedProps: { booking, occurrence }
    })));
  }
  function refresh() {
    if (!calendar) return;
    calendar.removeAllEvents();
    renderEvents().forEach((event) => calendar.addEvent(event));
  }
  function openForm(range) {
    selectedRange = range;
    ensureFormValues(range);
    document.getElementById('conferenceRoomDialog')?.showModal?.();
  }
  function closeForm() {
    document.getElementById('conferenceRoomDialog')?.close?.();
    selectedRange = null;
  }
  function ensureFormValues(range) {
    const form = document.getElementById(FORM_ID);
    if (!form) return;
    const current = user();
    form.organization_name.value = organizationNameForAccount(current);
    form.organization_name.readOnly = true;
    form.start.value = localInput(range?.start || new Date());
    form.end.value = localInput(range?.end || new Date(Date.now() + 60 * 60 * 1000));
    if (form.repeat_rule) form.repeat_rule.value = 'none';
    if (form.repeat_until) {
      form.repeat_until.value = '';
      form.repeat_until.disabled = true;
      form.repeat_until.required = false;
    }
    form.activity_description.value = '';
    form.activity_description_other.value = '';
    toggleActivityOther(form);
    resetAttendeeRows();
  }
  async function submitBooking(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const attendees = formAttendees(form);
    if (!attendees.length) return api().showToast?.('Add at least one attendee.', 'error');
    if (attendees.length > 30) return api().showToast?.('Only up to 30 attendees are allowed.', 'error');
    if (!clean(form.activity_description.value)) return api().showToast?.('Activity description is required.', 'error');
    if (form.activity_description.value === 'Others' && !clean(form.activity_description_other.value)) {
      return api().showToast?.('Please specify the activity description.', 'error');
    }
    const booking = buildBooking(event.currentTarget);
    if (!booking.organization_name) return api().showToast?.('Organization name is required.', 'error');
    if (!booking.start_time || !booking.end_time || new Date(booking.end_time) <= new Date(booking.start_time)) {
      return api().showToast?.('End time must be later than start time.', 'error');
    }
    if (!booking.occurrences.length) return api().showToast?.('Choose a valid repeat date range.', 'error');
    const conflict = reservedConflict(booking.occurrences);
    if (conflict) return api().showToast?.('The conference room already has a pending or approved booking for this time.', 'error');
    const databaseConflict = await databaseReservedConflict(booking.occurrences);
    if (databaseConflict) return api().showToast?.('The conference room already has a pending or approved booking for this time.', 'error');
    try {
      await saveBookingToDatabase(booking);
      await saveBookingMirrorToCalendarItems(booking);
    } catch (error) {
      api().showToast?.(`Conference room booking could not be saved to database: ${error.message}`, 'error');
      return;
    }
    upsertLocalBooking(booking);
    window.setTimeout(refreshBookingsFromDatabase, 800);
    if (booking.approval_status === 'pending') notifyAdmins(booking);
    api().log?.('conference_room_booking_created', `${user().full_name} created a conference room booking.`, api().scheduleAuditSnapshot?.(booking) || booking);
    api().showToast?.(booking.approval_status === 'pending' ? 'Conference room booking submitted for approval.' : 'Conference room booking saved.', 'success');
    closeForm();
    refresh();
  }
  function detailRow(label, value) {
    const text = value == null || String(value).trim() === '' ? 'Not provided' : String(value);
    return `<div class="conference-room-detail-row"><dt>${esc(label)}</dt><dd>${esc(text)}</dd></div>`;
  }
  function openBookingDetails(booking, occurrence = null) {
    if (!booking) return;
    ensureUi();
    const dialog = document.getElementById(DETAILS_ID);
    if (!dialog) return;
    const canReview = canApproveConferenceBookings() && booking.approval_status === 'pending' && booking.created_by !== user().id;
    const canCancel = booking.created_by === user().id || canApproveConferenceBookings();
    dialog.dataset.bookingId = booking.id;
    dialog.querySelector('[data-conference-title]').textContent = bookingOrganizationName(booking);
    dialog.querySelector('[data-conference-status]').textContent = cap(booking.approval_status || 'pending');
    dialog.querySelector('[data-conference-status]').className = `status-pill ${String(booking.approval_status || 'pending').toLowerCase()}`;
    dialog.querySelector('[data-conference-details]').innerHTML = [
      detailRow('Organization', bookingOrganizationName(booking)),
      detailRow('Venue', ROOM_VENUE),
      detailRow('Activity Description', bookingActivityDescription(booking)),
      detailRow('Start', dateTime(occurrence?.start_time || booking.start_time)),
      detailRow('End', dateTime(occurrence?.end_time || booking.end_time)),
      detailRow('Repeat', repeatLabel(booking)),
      detailRow('Repeat Until', repeatUntilLabel(booking)),
      detailRow('List of Attendees', attendeeListText(booking)),
      detailRow('Contact Person', bookingContactPerson(booking)),
      detailRow('Contact Info', bookingContactInfo(booking)),
      detailRow('Submitted', dateTime(booking.created_at)),
      detailRow('Reviewed', dateTime(booking.approval_date)),
      detailRow('Remarks', booking.rejection_reason || booking.admin_recommendation)
    ].join('');
    const remarks = dialog.querySelector('[name="conference_room_remarks"]');
    if (remarks) remarks.value = booking.rejection_reason || booking.admin_recommendation || '';
    dialog.querySelector('[data-conference-remarks-field]').hidden = !canReview;
    dialog.querySelector('[data-conference-approve]').hidden = !canReview;
    dialog.querySelector('[data-conference-reject]').hidden = !canReview;
    dialog.querySelector('[data-conference-cancel]').hidden = !canCancel;
    dialog.showModal?.();
  }
  function closeBookingDetails() {
    document.getElementById(DETAILS_ID)?.close?.();
  }
  function pendingConflictSummary(booking) {
    const candidates = bookingOccurrences(booking);
    return (store()?.events || [])
      .filter((event) => event.id !== booking.id && isConference(event) && active(event) && event.approval_status === 'pending' && candidates.some((candidate) => bookingOccurrences(event).some((occurrence) => overlaps(candidate.start_time, candidate.end_time, occurrence.start_time, occurrence.end_time))))
      .slice(0, 4)
      .map((event) => `${event.organization_name || event.title || 'Organization'} (${dateTime(event.start_time)} - ${dateTime(event.end_time)})`)
      .join('\n');
  }
  async function reviewBooking(status) {
    const dialog = document.getElementById(DETAILS_ID);
    const booking = (store()?.events || []).find((event) => event.id === dialog?.dataset.bookingId);
    if (!booking || !canApproveConferenceBookings() || booking.approval_status !== 'pending' || booking.created_by === user().id) return;
    const remarks = clean(dialog.querySelector('[name="conference_room_remarks"]')?.value || '');
    if (status === 'rejected' && !remarks) return api().showToast?.('Remarks are required when rejecting a reservation.', 'error');
    if (status === 'approved') {
      const conflict = approvedConflict(bookingOccurrences(booking), '', booking.id);
      if (conflict) return api().showToast?.('The conference room is already approved for this time.', 'error');
      const databaseConflict = await databaseApprovedConflict(bookingOccurrences(booking), '', booking.id);
      if (databaseConflict) return api().showToast?.('The conference room is already approved for this time.', 'error');
      const pending = pendingConflictSummary(booking);
      if (pending && !confirm(`Conflict warning: pending conference room reservations overlap this schedule.\n\n${pending}\n\nApprove this reservation anyway?`)) return;
    }
    const previousBooking = { ...booking };
    const now = new Date().toISOString();
    booking.approval_status = status;
    booking.approval_date = now;
    booking.reviewed_by = user().id;
    booking.approved_by = status === 'approved' ? user().id : '';
    booking.admin_recommendation = remarks;
    booking.rejection_reason = status === 'rejected' ? remarks : '';
    booking.notification_status = 'unread';
    booking.updated_at = now;
    try {
      await saveBookingToDatabase(booking);
      await saveBookingMirrorToCalendarItems(booking);
    } catch (error) {
      Object.assign(booking, previousBooking);
      api().showToast?.(`Conference room booking review could not be saved to database: ${error.message}`, 'error');
      return;
    }
    upsertLocalBooking(booking);
    api().log?.(`conference_room_booking_${status}`, `${user().full_name} ${status} a conference room booking.`, api().scheduleAuditSnapshot?.(booking) || booking);
    void notifyBookingOwner(booking, status, remarks);
    api().showToast?.(`Conference room booking ${status}.`, 'success');
    closeBookingDetails();
    refresh();
  }
  async function cancelBooking(booking) {
    if (!booking || (!canApproveConferenceBookings() && booking.created_by !== user().id)) return;
    if (!confirm(`Delete conference room booking for ${booking.organization_name || booking.title}?`)) return;
    try {
      await deleteBookingFromDatabase(booking);
    } catch (error) {
      api().showToast?.(`Conference room booking could not be deleted from database: ${error.message}`, 'error');
      return;
    }
    removeLocalBooking(booking.id);
    api().log?.('conference_room_booking_deleted', `${user().full_name} deleted a conference room booking.`, api().scheduleAuditSnapshot?.(booking) || booking);
    api().showToast?.('Conference room booking deleted.', 'success');
    refresh();
  }
  function resetConferenceRoomRuntime() {
    calendar?.destroy?.();
    calendar = null;
    selectedRange = null;
    [PAGE_ID, 'conferenceRoomDialog', DETAILS_ID, 'conference-room-booking-style'].forEach((id) => document.getElementById(id)?.remove());
    const button = document.getElementById(BUTTON_ID);
    if (button) {
      const replacement = button.cloneNode(true);
      replacement.dataset.conferenceRoomRuntime = RUNTIME_VERSION;
      replacement.dataset.conferenceRoomWired = '';
      button.replaceWith(replacement);
    }
  }
  function ensureUi() {
    const sidebar = document.querySelector('.sidebar nav,.sidebar,.app-sidebar nav,#sidebar nav,#sidebar');
    const reference = document.getElementById('eventRequestsButton')
      || document.getElementById('concernsButton')
      || document.getElementById('personalCalendarButton');
    let button = document.getElementById(BUTTON_ID);
    if (!button) {
      button = document.createElement('button');
      button.id = BUTTON_ID;
      button.type = 'button';
      button.className = reference?.className || 'nav-item';
      button.innerHTML = '<span>Conference Room</span>';
      if (reference?.parentElement) reference.parentElement.insertBefore(button, reference.nextSibling);
      else sidebar?.appendChild(button);
    }
    if (button.dataset.conferenceRoomRuntime !== RUNTIME_VERSION) {
      const replacement = button.cloneNode(true);
      replacement.dataset.conferenceRoomRuntime = RUNTIME_VERSION;
      replacement.dataset.conferenceRoomWired = '';
      button.replaceWith(replacement);
      button = replacement;
    }
    if (!button.dataset.conferenceRoomWired) {
      button.addEventListener('click', openPage);
      button.dataset.conferenceRoomWired = '1';
    }
    if (document.getElementById(PAGE_ID)) return;

    document.body.insertAdjacentHTML('beforeend', `
      <section class="modal admin-tab-page conference-room-page" id="${PAGE_ID}" hidden>
        <div class="modal-card conference-room-card">
          <header class="modal-header conference-room-header">
            <button type="button" class="secondary-button portal-tab-back" id="conferenceRoomBack" aria-label="Back to Calendar View"></button>
            <div><h3>Conference Room Booking</h3></div>
            <div class="conference-room-tools">
              <button type="button" class="icon-button conference-room-nav-button" id="conferenceRoomPrev" aria-label="Previous week">&#8249;</button>
              <button type="button" class="icon-button conference-room-nav-button" id="conferenceRoomNext" aria-label="Next week">&#8250;</button>
              <button type="button" class="secondary-button conference-room-notifications" id="conferenceRoomNotifications" aria-label="Notifications">&#128276;</button>
            </div>
          </header>
          <div class="conference-room-body"><div id="${CALENDAR_ID}"></div></div>
        </div>
      </section>
      <dialog class="conference-room-dialog" id="conferenceRoomDialog">
        <form id="${FORM_ID}" method="dialog">
          <header><h3>Book Conference Room</h3><button type="button" id="conferenceRoomClose" aria-label="Close">x</button></header>
          <label>Organization<input name="organization_name" required readonly></label>
          <div class="form-grid two">
            <label>Start<input name="start" type="datetime-local" required></label>
            <label>End<input name="end" type="datetime-local" required></label>
          </div>
          <div class="form-grid two">
            <label>Repeat
              <select name="repeat_rule">
                <option value="none">Does not repeat</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </label>
            <label>Repeat Until<input name="repeat_until" type="date" disabled></label>
          </div>
          <label>Activity Description
            <select name="activity_description" required>
              <option value="">Select activity</option>
              <option value="Meeting">Meeting</option>
              <option value="Worship">Worship</option>
              <option value="Rehearsal">Rehearsal</option>
              <option value="Study Group">Study Group</option>
              <option value="Others">Others</option>
            </select>
          </label>
          <label data-activity-other-field hidden>Specify Activity<input name="activity_description_other" maxlength="120"></label>
          <section class="conference-attendees-field">
            <div class="conference-attendees-header"><strong>List of Attendees</strong><span data-attendee-count>0/30</span></div>
            <div class="conference-attendees-list" data-attendees-list></div>
            <button type="button" class="secondary-button conference-add-attendee" data-add-attendee>Add Student</button>
          </section>
          <footer><button type="button" class="secondary-button" id="conferenceRoomCancel">Cancel</button><button type="submit" class="primary-button">Save Booking</button></footer>
        </form>
      </dialog>
      <dialog class="conference-room-dialog conference-room-details-dialog" id="${DETAILS_ID}">
        <form method="dialog">
          <header><div><h3 data-conference-title>Conference Room Reservation</h3><span data-conference-status class="status-pill pending">Pending</span></div><button type="button" id="conferenceRoomDetailsClose" aria-label="Close">x</button></header>
          <dl class="conference-room-detail-list" data-conference-details></dl>
          <label data-conference-remarks-field>Remarks<textarea name="conference_room_remarks" rows="4" placeholder="Add remarks for rejection"></textarea></label>
          <footer>
            <button type="button" class="secondary-button" id="conferenceRoomDetailsCancel" data-conference-cancel>Cancel Reservation</button>
            <span></span>
            <button type="button" class="danger-button" id="conferenceRoomReject" data-conference-reject>Reject</button>
            <button type="button" class="primary-button" id="conferenceRoomApprove" data-conference-approve>Approve</button>
          </footer>
        </form>
      </dialog>
    `);
    document.getElementById('conferenceRoomBack')?.addEventListener('click', closePage);
    document.getElementById('conferenceRoomPrev')?.addEventListener('click', () => { calendar?.prev(); });
    document.getElementById('conferenceRoomNext')?.addEventListener('click', () => { calendar?.next(); });
    document.getElementById('conferenceRoomNotifications')?.addEventListener('click', () => document.getElementById('notificationsButton')?.click());
    document.getElementById('conferenceRoomClose')?.addEventListener('click', closeForm);
    document.getElementById('conferenceRoomCancel')?.addEventListener('click', closeForm);
    document.getElementById(FORM_ID)?.addEventListener('submit', submitBooking);
    document.getElementById(FORM_ID)?.elements?.activity_description?.addEventListener('change', (event) => toggleActivityOther(event.currentTarget.form));
    document.getElementById(FORM_ID)?.elements?.repeat_rule?.addEventListener('change', (event) => {
      const form = event.currentTarget.form;
      const enabled = event.currentTarget.value !== 'none';
      form.repeat_until.disabled = !enabled;
      form.repeat_until.required = enabled;
      form.repeat_until.value = enabled ? (form.repeat_until.value || defaultRepeatUntil(form.start.value, event.currentTarget.value)) : '';
    });
    document.getElementById(FORM_ID)?.elements?.start?.addEventListener('change', (event) => {
      const form = event.currentTarget.form;
      if (form.repeat_rule?.value && form.repeat_rule.value !== 'none') {
        form.repeat_until.value = defaultRepeatUntil(form.start.value, form.repeat_rule.value);
      }
    });
    document.getElementById(FORM_ID)?.querySelector('[data-add-attendee]')?.addEventListener('click', () => addAttendeeRow());
    document.getElementById('conferenceRoomDetailsClose')?.addEventListener('click', closeBookingDetails);
    document.getElementById('conferenceRoomDetailsCancel')?.addEventListener('click', () => {
      const booking = (store()?.events || []).find((event) => event.id === document.getElementById(DETAILS_ID)?.dataset.bookingId);
      closeBookingDetails();
      cancelBooking(booking);
    });
    document.getElementById('conferenceRoomReject')?.addEventListener('click', () => reviewBooking('rejected'));
    document.getElementById('conferenceRoomApprove')?.addEventListener('click', () => reviewBooking('approved'));
  }
  function style() {
    if (document.getElementById('conference-room-booking-style')) return;
    const css = document.createElement('style');
    css.id = 'conference-room-booking-style';
    css.textContent = `
      #conferenceRoomModal.conference-room-page[hidden]{display:none!important;pointer-events:none!important;visibility:hidden!important;}
      #conferenceRoomModal.conference-room-page{border-radius:0!important;}
      #conferenceRoomModal.conference-room-page.is-active{background:#f8fafc!important;border-radius:0!important;display:block!important;height:100dvh!important;inset:0!important;left:0!important;margin:0!important;max-height:none!important;max-width:none!important;min-height:100dvh!important;min-width:100dvw!important;overflow:hidden!important;padding:0!important;position:fixed!important;right:0!important;top:0!important;transform:none!important;width:100dvw!important;z-index:2147483500!important;}
      #conferenceRoomModal .conference-room-card{box-sizing:border-box!important;display:grid!important;grid-template-rows:auto minmax(0,1fr)!important;height:100dvh!important;max-height:none!important;max-width:none!important;min-height:100dvh!important;min-width:100dvw!important;width:100dvw!important;margin:0!important;padding:0!important;border:0!important;border-radius:0!important;box-shadow:none!important;overflow:hidden!important;}
      #conferenceRoomModal .conference-room-header{box-sizing:border-box!important;display:grid!important;grid-template-columns:auto minmax(0,1fr) auto!important;align-items:center!important;gap:12px!important;background:linear-gradient(135deg,#facc15 0%,#eab308 62%,#ca8a04 100%)!important;border-bottom:1px solid #2563eb!important;border-radius:0!important;margin:0!important;min-height:58px!important;padding:12px 18px!important;width:100dvw!important;}
      .conference-room-header h3{margin:0!important;font-size:clamp(1.05rem,1.6vw,1.35rem)!important;}
      .conference-room-tools{display:flex!important;gap:10px!important;align-items:center!important;}
      .conference-room-tools button,.conference-room-header .portal-tab-back{min-height:40px!important;border-radius:999px!important;}
      .conference-room-nav-button{align-items:center!important;aspect-ratio:1/1!important;background:#fff!important;border:1px solid #e2e8f0!important;color:#0f172a!important;display:inline-flex!important;font-size:1.65rem!important;font-weight:800!important;height:40px!important;justify-content:center!important;line-height:1!important;min-width:40px!important;padding:0!important;width:40px!important;}
      .conference-room-notifications{width:40px!important;min-width:40px!important;padding:0!important;}
      .conference-room-header #conferenceRoomBack{align-items:center!important;color:#0f172a!important;display:inline-flex!important;font-family:Arial,Helvetica,sans-serif!important;font-size:0!important;font-weight:900!important;height:40px!important;justify-content:center!important;line-height:1!important;min-height:40px!important;min-width:40px!important;overflow:hidden!important;padding:0!important;text-indent:0!important;width:40px!important;}
      .conference-room-header #conferenceRoomBack::before{content:none!important;display:none!important;}
      .conference-room-header #conferenceRoomBack::after{color:#0f172a!important;content:'\\2190'!important;display:block!important;font-family:Arial,Helvetica,sans-serif!important;font-size:22px!important;font-weight:900!important;line-height:1!important;text-indent:0!important;}
      #conferenceRoomModal .conference-room-body{box-sizing:border-box!important;height:calc(100dvh - 58px)!important;min-height:0!important;overflow:hidden!important;padding:10px!important;background:#f8fafc!important;width:100dvw!important;}
      #conferenceRoomCalendar{box-sizing:border-box!important;display:block!important;height:calc(100dvh - 78px)!important;min-height:320px!important;max-height:calc(100dvh - 78px)!important;max-width:none!important;width:100%!important;background:#fff!important;border:1px solid #dbe4ef!important;border-radius:14px!important;overflow:hidden!important;}
      #conferenceRoomCalendar .fc,
      #conferenceRoomCalendar .fc-view-harness,
      #conferenceRoomCalendar .fc-view-harness-active,
      #conferenceRoomCalendar .fc-scrollgrid{box-sizing:border-box!important;height:100%!important;max-height:100%!important;max-width:none!important;min-height:0!important;width:100%!important;}
      .conference-room-dialog{border:0;border-radius:22px;padding:0;max-width:min(560px,calc(100vw - 24px));width:560px;box-shadow:0 24px 80px rgba(15,23,42,.22);}
      .conference-room-dialog::backdrop{background:rgba(15,23,42,.42);}
      .conference-room-dialog form{display:grid;gap:14px;max-height:min(86vh,720px);overflow:auto;padding:18px;}
      .conference-room-dialog header,.conference-room-dialog footer{display:flex;align-items:center;justify-content:space-between;gap:10px;}
      .conference-room-dialog h3{margin:0;}
      .conference-room-dialog label{display:grid;gap:6px;font-weight:800;color:#111827;}
      .conference-room-dialog input,.conference-room-dialog select{border:1px solid #cbd5e1;border-radius:14px;min-height:46px;padding:10px 12px;font:inherit;background:#fff;}
      .conference-room-dialog input[readonly]{background:#f8fafc;color:#0f172a;font-weight:800;}
      .conference-room-dialog textarea{border:1px solid #cbd5e1;border-radius:14px;min-height:96px;padding:10px 12px;font:inherit;resize:vertical;}
      .conference-room-dialog .form-grid.two{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
      .conference-attendees-field{display:grid;gap:10px;border:1px solid #e2e8f0;border-radius:16px;padding:12px;}
      .conference-attendees-header{align-items:center;display:flex;justify-content:space-between;gap:10px;color:#111827;}
      .conference-attendees-header span{color:#475569;font-size:.9rem;font-weight:800;}
      .conference-attendees-list{display:grid;gap:8px;max-height:240px;overflow:auto;padding-right:2px;}
      .conference-attendee-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;}
      .conference-attendee-row .secondary-button{min-height:42px;padding:8px 12px;}
      .conference-add-attendee{justify-self:start;}
      .conference-room-details-dialog header>div{display:grid;gap:6px;}
      .conference-room-detail-list{display:grid;grid-template-columns:1fr 1fr;gap:0 14px;margin:0;}
      .conference-room-detail-row{display:grid;grid-template-columns:minmax(108px,.45fr) minmax(0,1fr);gap:8px;border-bottom:1px solid #e2e8f0;padding:9px 0;}
      .conference-room-detail-row dt{color:#334155;font-size:.76rem;font-weight:900;text-transform:uppercase;}
      .conference-room-detail-row dd{color:#111827;margin:0;overflow-wrap:anywhere;}
      .conference-room-details-dialog footer{display:grid;grid-template-columns:auto 1fr auto auto;}
      @media(max-width:720px){#conferenceRoomModal .conference-room-header{grid-template-columns:40px minmax(0,1fr) auto!important;padding:9px 10px!important;}#conferenceRoomModal .conference-room-header h3{font-size:1rem!important;}.conference-room-tools{gap:6px!important;}.conference-room-tools .conference-room-nav-button,.conference-room-tools .conference-room-notifications{height:36px!important;min-height:36px!important;min-width:36px!important;padding:0!important;width:36px!important;}.conference-room-tools .conference-room-nav-button{font-size:1.45rem!important;}#conferenceRoomModal .conference-room-body{height:calc(100dvh - 54px)!important;padding:8px!important;}#conferenceRoomCalendar{height:calc(100dvh - 70px)!important;max-height:calc(100dvh - 70px)!important;min-height:300px!important;}.conference-room-dialog .form-grid.two,.conference-room-detail-list{grid-template-columns:1fr;}.conference-room-details-dialog footer{grid-template-columns:1fr;}.conference-room-details-dialog footer span{display:none;}}
    `;
    document.head.appendChild(css);
  }
  function openPage() {
    ensureUi();
    const page = document.getElementById(PAGE_ID);
    page.hidden = false;
    page.classList.add('is-active');
    document.body.classList.add('admin-tab-page-open');
    try { sessionStorage.setItem('csc_active_dashboard_tab_org', BUTTON_ID); } catch {}
    try { sessionStorage.setItem(ACTIVE_KEY, '1'); } catch {}
    initCalendar();
    resizeCalendarSoon();
    refreshBookingsFromDatabase();
  }
  function closePage() {
    const page = document.getElementById(PAGE_ID);
    if (page) {
      page.hidden = true;
      page.classList.remove('is-active');
    }
    document.body.classList.remove('admin-tab-page-open');
    try { sessionStorage.setItem('csc_active_dashboard_tab_org', 'mainCalendar'); } catch {}
    try { sessionStorage.removeItem(ACTIVE_KEY); } catch {}
    state()?.calendar?.updateSize?.();
  }
  function initCalendar() {
    if (calendar) return;
    const target = document.getElementById(CALENDAR_ID);
    if (!window.FullCalendar || !target) {
      setTimeout(initCalendar, 80);
      return;
    }
    calendar = new FullCalendar.Calendar(target, {
      initialView: 'timeGridWeek',
      headerToolbar: false,
      selectable: true,
      editable: true,
      nowIndicator: true,
      slotMinTime: '06:00:00',
      slotMaxTime: '24:00:00',
      allDaySlot: false,
      height: '100%',
      select: (info) => openForm({ start: info.start, end: info.end }),
      eventClick: (info) => openBookingDetails(info.event.extendedProps.booking, info.event.extendedProps.occurrence),
      eventDrop: async (info) => moveBooking(info),
      eventResize: async (info) => moveBooking(info),
      events: renderEvents()
    });
    calendar.render();
    resizeCalendarSoon();
  }
  function resizeCalendarSoon() {
    const run = () => {
      if (!calendar && document.getElementById(PAGE_ID)?.classList.contains('is-active')) initCalendar();
      calendar?.updateSize?.();
      refresh();
    };
    requestAnimationFrame(() => {
      run();
      requestAnimationFrame(run);
    });
    setTimeout(run, 80);
    setTimeout(run, 260);
  }
  async function moveBooking(info) {
    const booking = info.event.extendedProps.booking;
    if (!booking || (!canApproveConferenceBookings() && booking.created_by !== user().id)) {
      info.revert();
      return;
    }
    const startTime = localIso(info.event.start);
    const endTime = localIso(info.event.end);
    const conflict = reservedConflict(startTime, endTime, booking.id);
    if (conflict) {
      api().showToast?.('The conference room already has a pending or approved booking for this time.', 'error');
      info.revert();
      return;
    }
    const databaseConflict = await databaseReservedConflict(startTime, endTime, booking.id);
    if (databaseConflict) {
      api().showToast?.('The conference room already has a pending or approved booking for this time.', 'error');
      info.revert();
      return;
    }
    const previousBooking = { ...booking, occurrences: Array.isArray(booking.occurrences) ? [...booking.occurrences] : [] };
    booking.start_time = startTime;
    booking.end_time = endTime;
    booking.occurrences = [{ id: booking.occurrences?.[0]?.id || createId(), date: startTime.slice(0, 10), start_time: startTime, end_time: endTime }];
    booking.repeat_rule = 'none';
    booking.repeat_until = '';
    booking.updated_at = new Date().toISOString();
    try {
      await saveBookingToDatabase(booking);
      await saveBookingMirrorToCalendarItems(booking);
    } catch (error) {
      Object.assign(booking, previousBooking);
      api().showToast?.(`Conference room booking update could not be saved to database: ${error.message}`, 'error');
      info.revert();
      return;
    }
    upsertLocalBooking(booking);
    api().showToast?.('Conference room booking updated.', 'success');
    refresh();
  }
  function init() {
    resetConferenceRoomRuntime();
    style();
    ensureUi();
    window.addEventListener('csc:store-rendered', refresh);
    restorePageAfterReload();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else queueMicrotask(init);
})();

