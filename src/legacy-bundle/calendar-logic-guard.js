// Extracted from moduleSources in org-dashboard.html.
// Original virtual module name: calendar-logic-guard.js

(() => {
  const SESSION_KEY = 'core_supabase_auth_session';
  const GUARD_FLAG = '__cscCalendarLogicGuardV6';
  const CALENDAR_TIME_ZONE = 'Asia/Manila';
  const DATE_PARTS = new Intl.DateTimeFormat('en-CA', { timeZone: CALENDAR_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
  const TIME_PARTS = new Intl.DateTimeFormat('en-GB', { timeZone: CALENDAR_TIME_ZONE, hour: '2-digit', minute: '2-digit', hour12: false });
  if (window[GUARD_FLAG]) return;
  window[GUARD_FLAG] = true;

  function sessionUserId() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null')?.user?.id || ''; }
    catch { return ''; }
  }
  function hex(length) { const bytes = new Uint8Array(Math.ceil(length / 2)); crypto.getRandomValues(bytes); return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, length); }
  function calendarId() { return `${hex(8)}-${hex(4)}-4${hex(3)}-${['8', '9', 'a', 'b'][Math.floor(Math.random() * 4)]}${hex(3)}-${hex(12)}`; }
  try { if (window.crypto && typeof window.crypto.randomUUID === 'function') Object.defineProperty(window.crypto, 'randomUUID', { value: calendarId, configurable: true }); } catch {}

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async function guardedFetch(input, init = {}) {
    const target = typeof input === 'string' ? input : input?.url || '';
    const method = String(init?.method || 'GET').toUpperCase();
    if (method === 'POST' && target.includes('/rest/v1/calendar_items') && init?.body) {
      try {
        const parsed = JSON.parse(init.body);
        const rows = Array.isArray(parsed) ? parsed : [parsed];
        const fixedRows = alignObjectKeys(rows.map(fixCalendarRow).filter(Boolean));
        init = { ...init, body: JSON.stringify(Array.isArray(parsed) ? fixedRows : fixedRows[0]) };
      } catch (error) { console.warn('Calendar payload guard skipped:', error); }
    }
    const response = await nativeFetch(input, init);
    if (method === 'GET' && target.includes('/rest/v1/calendar_items') && response.ok) return normalizedCalendarResponse(response);
    return response;
  };

  async function normalizedCalendarResponse(response) {
    try {
      const data = await response.clone().json();
      if (!Array.isArray(data)) return response;
      const fixed = data.map(fixLoadedCalendarRow).filter(Boolean);
      return new Response(JSON.stringify(fixed), { status: response.status, statusText: response.statusText, headers: response.headers });
    } catch (error) { console.warn('Calendar read guard skipped:', error); return response; }
  }
  function stripCategoryFields(row = {}) { const { category_name, category_color, category_active, ...clean } = row; return clean; }
  function datesForRow(row = {}, occurrences = []) {
    const first = occurrences[0] || {};
    const last = occurrences.at(-1) || first;
    const start = String(row.start_date || first.date || dateOnly(row.start_time) || '').slice(0, 10);
    const end = String(row.end_date || last.date || dateOnly(row.end_time) || start || '').slice(0, 10);
    return { start_date: start || null, end_date: end || start || null };
  }
  function fixLoadedCalendarRow(row = {}) {
    if (row.record_type === 'category') return null;
    if (row.record_type !== 'schedule') return stripCategoryFields(row);
    const clean = stripCategoryFields(row);
    const occurrences = normalizeOccurrences(clean);
    const dates = datesForRow(clean, occurrences);
    return { ...clean, ...dates, occurrences, start_time: occurrences[0]?.start_time || clean.start_time, end_time: occurrences.at(-1)?.end_time || clean.end_time };
  }
  function fixCalendarRow(row = {}) {
    if (row.record_type === 'category') return null;
    if (row.record_type !== 'schedule') return stripCategoryFields(row);
    const clean = stripCategoryFields(row);
    const occurrences = normalizeOccurrences(clean);
    const dates = datesForRow(clean, occurrences);
    return { ...clean, ...dates, created_by: clean.created_by || sessionUserId() || null, occurrences, start_time: occurrences[0]?.start_time || clean.start_time, end_time: occurrences.at(-1)?.end_time || clean.end_time };
  }
  function normalizeOccurrences(row = {}) {
    const saved = parseOccurrences(row.occurrences);
    const source = saved.length ? saved : [{ id: `${row.id || 'schedule'}-occurrence`, date: row.start_date || dateOnly(row.start_time), start_time: row.start_time, end_time: row.end_time }];
    return source.flatMap((occurrence, index) => expandOccurrence(occurrence, row, index)).filter((item) => item.date && item.start_time && item.end_time).sort((a, b) => a.date.localeCompare(b.date) || new Date(a.start_time) - new Date(b.start_time));
  }
  function parseOccurrences(value) { if (Array.isArray(value)) return value; if (typeof value !== 'string' || !value.trim()) return []; try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; } }
  function expandOccurrence(occurrence = {}, row = {}, index = 0) {
    if (!occurrence.start_time || !occurrence.end_time) return [];
    const eventId = row.id || 'schedule';
    const startDate = String(row.start_date || occurrence.date || '').slice(0, 10) || dateOnly(occurrence.start_time);
    const detectedEndDate = String(row.end_date || '').slice(0, 10) || dateOnly(occurrence.end_time);
    const endDate = row.schedule_type === 'multi_day' && detectedEndDate && detectedEndDate >= startDate ? detectedEndDate : startDate;
    if (!startDate || !endDate || startDate === endDate) return [{ ...occurrence, id: occurrence.id || `${eventId}-occurrence-${index}`, date: startDate, start_time: `${startDate}T${clockOnly(occurrence.start_time)}:00`, end_time: `${startDate}T${clockOnly(occurrence.end_time)}:00` }];
    const startTime = clockOnly(occurrence.start_time); const endTime = clockOnly(occurrence.end_time);
    return datesBetween(startDate, endDate).map((date, dayIndex) => ({ id: dayIndex === 0 ? (occurrence.id || `${eventId}-occurrence-${index}`) : `${occurrence.id || eventId}-${date}`, date, start_time: `${date}T${startTime}:00`, end_time: `${date}T${endTime}:00` }));
  }
  function alignObjectKeys(rows) { const keys = [...rows.reduce((set, row) => { Object.keys(row || {}).forEach((key) => set.add(key)); return set; }, new Set())]; return rows.map((row) => Object.fromEntries(keys.map((key) => [key, row?.[key] === undefined ? null : row[key]]))); }
  function dateOnly(value) {
    if (!value) return '';
    const text = String(value);
    if (!text.endsWith('Z') && !/[+-]\d{2}:?\d{2}$/.test(text) && /^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
    const date = new Date(value); if (Number.isNaN(date.getTime())) return text.slice(0, 10);
    const parts = Object.fromEntries(DATE_PARTS.formatToParts(date).map((part) => [part.type, part.value])); return `${parts.year}-${parts.month}-${parts.day}`;
  }
  function clockOnly(value) {
    const text = String(value || ''); const raw = text.match(/T(\d{2}:\d{2})/) || text.match(/^(\d{2}:\d{2})/);
    if (!text.endsWith('Z') && !/[+-]\d{2}:?\d{2}$/.test(text) && raw) return raw[1];
    const date = new Date(value); if (Number.isNaN(date.getTime())) return raw ? raw[1] : '00:00'; return TIME_PARTS.format(date);
  }
  function datesBetween(startDate, endDate) { const dates = []; for (let day = new Date(`${startDate}T12:00:00`), end = new Date(`${endDate}T12:00:00`); day <= end; day.setDate(day.getDate() + 1)) dates.push(localDate(day)); return dates; }
  function injectToastStyle() { if (document.getElementById('toast-position-fix-style')) return; const style = document.createElement('style'); style.id = 'toast-position-fix-style'; style.textContent = `.toast-region{position:fixed!important;right:18px!important;bottom:18px!important;left:auto!important;top:auto!important;z-index:2147483647!important;display:flex!important;flex-direction:column!important;align-items:flex-end!important;gap:10px!important;max-width:min(420px,calc(100vw - 36px))!important;pointer-events:none!important}.toast{width:max-content!important;max-width:min(420px,calc(100vw - 36px))!important;pointer-events:auto!important;box-shadow:0 18px 42px rgba(15,23,42,.22)!important}`; document.head.appendChild(style); }
  function localDate(date) { return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
  function localClock(date) { return date.toTimeString().slice(0, 5); }
  function splitVisualEvent(item) {
    if (!item?.start || !item?.end) return [item]; if (item.allDay) return [item];
    const start = new Date(item.start); const end = new Date(item.end); if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [item];
    const startDate = localDate(start); const endDate = localDate(end); if (startDate === endDate) return [item];
    const dates = datesBetween(startDate, endDate); const startClock = localClock(start); const endClock = localClock(end);
    return dates.map((date, index) => {
      const segmentStart = index === 0 ? `${date}T${startClock}:00` : `${date}T00:00:00`;
      const segmentEnd = index === dates.length - 1 ? `${date}T${endClock}:00` : `${date}T23:59:00`;
      return { ...item, id: `${item.id || 'event'}::visual-${date}-${index}`, start: segmentStart, end: segmentEnd, allDay: false, extendedProps: { ...(item.extendedProps || {}), panelDate: date, occurrence: { ...(item.extendedProps?.occurrence || {}), date, start_time: segmentStart, end_time: segmentEnd } } };
    });
  }
  function splitVisualEvents(items) { return (Array.isArray(items) ? items : []).flatMap(splitVisualEvent); }
  function patchFullCalendar() {
    if (!window.FullCalendar?.Calendar || window.FullCalendar.Calendar.__cscCalendarPatched) return Boolean(window.FullCalendar?.Calendar);
    const OriginalCalendar = window.FullCalendar.Calendar;
    class PatchedCalendar extends OriginalCalendar { constructor(element, options = {}) { super(element, patchCalendarOptions(options)); } }
    PatchedCalendar.__cscCalendarPatched = true;
    Object.getOwnPropertyNames(OriginalCalendar).forEach((key) => { if (!(key in PatchedCalendar)) { try { PatchedCalendar[key] = OriginalCalendar[key]; } catch {} } });
    window.FullCalendar.Calendar = PatchedCalendar; return true;
  }
  function patchCalendarOptions(options = {}) { if (typeof options.events === 'function') { const originalEvents = options.events; return { ...options, events(info, success, failure) { const wrappedSuccess = (items) => success(splitVisualEvents(items)); const result = originalEvents.call(this, info, wrappedSuccess, failure); if (result && typeof result.then === 'function') return result.then(splitVisualEvents); return result; } }; } if (Array.isArray(options.events)) return { ...options, events: splitVisualEvents(options.events) }; return options; }
  function initGuard() { injectToastStyle(); if (!patchFullCalendar()) setTimeout(initGuard, 40); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectToastStyle); else injectToastStyle(); initGuard();
})();
