(() => {
  const SESSION_KEY = 'core_supabase_auth_session';
  const GUARD_FLAG = '__cscCalendarLogicGuardV1';
  if (window[GUARD_FLAG]) return;
  window[GUARD_FLAG] = true;

  function sessionUserId() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null')?.user?.id || ''; }
    catch { return ''; }
  }

  function hex(length) {
    const bytes = new Uint8Array(Math.ceil(length / 2));
    crypto.getRandomValues(bytes);
    return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, length);
  }

  function legacyCalendarId() {
    return `${hex(8)}-${hex(4)}-4${hex(3)}-8${hex(12)}`;
  }

  try {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      Object.defineProperty(window.crypto, 'randomUUID', { value: legacyCalendarId, configurable: true });
    }
  } catch {}

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async function guardedFetch(input, init = {}) {
    const target = typeof input === 'string' ? input : input?.url || '';
    const method = String(init?.method || '').toUpperCase();
    if (method === 'POST' && target.includes('/rest/v1/calendar_items') && init?.body) {
      try {
        const parsed = JSON.parse(init.body);
        const rows = Array.isArray(parsed) ? parsed : [parsed];
        const fixedRows = alignObjectKeys(rows.map(fixCalendarRow));
        init = { ...init, body: JSON.stringify(Array.isArray(parsed) ? fixedRows : fixedRows[0]) };
      } catch (error) {
        console.warn('Calendar payload guard skipped:', error);
      }
    }
    return nativeFetch(input, init);
  };

  function fixCalendarRow(row = {}) {
    if (row.record_type !== 'schedule') return row;
    const occurrences = normalizeOccurrences(row);
    return {
      ...row,
      created_by: row.created_by || sessionUserId() || null,
      occurrences,
      start_time: occurrences[0]?.start_time || row.start_time,
      end_time: occurrences.at(-1)?.end_time || row.end_time
    };
  }

  function normalizeOccurrences(row = {}) {
    const source = Array.isArray(row.occurrences) && row.occurrences.length
      ? row.occurrences
      : [{ id: `${row.id || 'schedule'}-occurrence`, date: dateOnly(row.start_time), start_time: row.start_time, end_time: row.end_time }];
    return source.flatMap((occurrence, index) => expandOccurrence(occurrence, row.id || 'schedule', index))
      .filter((item) => item.date && item.start_time && item.end_time)
      .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
  }

  function expandOccurrence(occurrence = {}, eventId = 'schedule', index = 0) {
    if (!occurrence.start_time || !occurrence.end_time) return [];
    const startDate = occurrence.date || dateOnly(occurrence.start_time);
    const endDate = dateOnly(occurrence.end_time);
    if (!startDate || !endDate || startDate === endDate) {
      return [{ ...occurrence, id: occurrence.id || `${eventId}-occurrence-${index}`, date: startDate }];
    }
    const startTime = utcClock(occurrence.start_time);
    const endTime = utcClock(occurrence.end_time);
    return datesBetween(startDate, endDate).map((date, dayIndex) => ({
      id: dayIndex === 0 ? (occurrence.id || `${eventId}-occurrence-${index}`) : `${occurrence.id || eventId}-${date}`,
      date,
      start_time: `${date}T${startTime}:00.000Z`,
      end_time: `${date}T${endTime}:00.000Z`
    }));
  }

  function alignObjectKeys(rows) {
    const keys = [...rows.reduce((set, row) => {
      Object.keys(row || {}).forEach((key) => set.add(key));
      return set;
    }, new Set())];
    return rows.map((row) => Object.fromEntries(keys.map((key) => [key, row?.[key] === undefined ? null : row[key]])));
  }

  function dateOnly(value) { return String(value || '').slice(0, 10); }
  function utcClock(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '00:00' : date.toISOString().slice(11, 16);
  }
  function datesBetween(startDate, endDate) {
    const dates = [];
    for (let day = new Date(`${startDate}T12:00:00Z`), end = new Date(`${endDate}T12:00:00Z`); day <= end; day.setUTCDate(day.getUTCDate() + 1)) {
      dates.push(day.toISOString().slice(0, 10));
    }
    return dates;
  }

  function injectToastStyle() {
    if (document.getElementById('toast-position-fix-style')) return;
    const style = document.createElement('style');
    style.id = 'toast-position-fix-style';
    style.textContent = `.toast-region{position:fixed!important;right:18px!important;bottom:18px!important;left:auto!important;top:auto!important;z-index:2147483647!important;display:flex!important;flex-direction:column!important;align-items:flex-end!important;gap:10px!important;max-width:min(420px,calc(100vw - 36px))!important;pointer-events:none!important}.toast{width:max-content!important;max-width:min(420px,calc(100vw - 36px))!important;pointer-events:auto!important;box-shadow:0 18px 42px rgba(15,23,42,.22)!important}`;
    document.head.appendChild(style);
  }

  function localDate(date) {
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

  function localClock(date) {
    return date.toTimeString().slice(0, 5);
  }

  function nextLocalDate(dateString) {
    const date = new Date(`${dateString}T12:00:00`);
    date.setDate(date.getDate() + 1);
    return localDate(date);
  }

  function splitVisualEvent(item) {
    if (!item?.start || !item?.end) return [item];
    const start = new Date(item.start);
    const end = new Date(item.end);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [item];
    const startDate = localDate(start);
    const endDate = localDate(end);
    if (startDate === endDate) return [item];
    const dates = datesBetween(startDate, endDate);
    const startClock = localClock(start);
    const endClock = localClock(end);
    return dates.map((date, index) => {
      const allDay = Boolean(item.allDay);
      return {
        ...item,
        id: `${item.id || 'event'}::visual-${date}-${index}`,
        start: allDay ? date : `${date}T${startClock}:00`,
        end: allDay ? nextLocalDate(date) : `${date}T${endClock}:00`,
        allDay,
        extendedProps: {
          ...(item.extendedProps || {}),
          panelDate: date,
          occurrence: {
            ...(item.extendedProps?.occurrence || {}),
            date,
            start_time: allDay ? `${date}T00:00:00` : `${date}T${startClock}:00`,
            end_time: allDay ? `${date}T23:59:59` : `${date}T${endClock}:00`
          }
        }
      };
    });
  }

  function splitVisualEvents(items) {
    return (Array.isArray(items) ? items : []).flatMap(splitVisualEvent);
  }

  function patchFullCalendar() {
    if (!window.FullCalendar?.Calendar || window.FullCalendar.Calendar.__cscCalendarPatched) return Boolean(window.FullCalendar?.Calendar);
    const OriginalCalendar = window.FullCalendar.Calendar;
    class PatchedCalendar extends OriginalCalendar {
      constructor(element, options = {}) {
        super(element, patchCalendarOptions(options));
      }
    }
    PatchedCalendar.__cscCalendarPatched = true;
    Object.getOwnPropertyNames(OriginalCalendar).forEach((key) => {
      if (!(key in PatchedCalendar)) {
        try { PatchedCalendar[key] = OriginalCalendar[key]; } catch {}
      }
    });
    window.FullCalendar.Calendar = PatchedCalendar;
    return true;
  }

  function patchCalendarOptions(options = {}) {
    if (typeof options.events === 'function') {
      const originalEvents = options.events;
      return {
        ...options,
        events(info, success, failure) {
          const wrappedSuccess = (items) => success(splitVisualEvents(items));
          const result = originalEvents.call(this, info, wrappedSuccess, failure);
          if (result && typeof result.then === 'function') return result.then(splitVisualEvents);
          return result;
        }
      };
    }
    if (Array.isArray(options.events)) return { ...options, events: splitVisualEvents(options.events) };
    return options;
  }

  function initGuard() {
    injectToastStyle();
    if (!patchFullCalendar()) setTimeout(initGuard, 40);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectToastStyle);
  else injectToastStyle();
  initGuard();
})();
