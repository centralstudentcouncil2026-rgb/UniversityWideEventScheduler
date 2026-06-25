(() => {
  if (window.__singleDaySpanFix) return;
  window.__singleDaySpanFix = true;

  function patchWhenReady() {
    if (!window.FullCalendar?.Calendar || window.FullCalendar.Calendar.__singleDaySpanFixed) {
      if (!window.FullCalendar?.Calendar) setTimeout(patchWhenReady, 40);
      return;
    }

    const PreviousCalendar = window.FullCalendar.Calendar;
    class SingleDaySpanFixedCalendar extends PreviousCalendar {
      constructor(element, options = {}) {
        super(element, fixOptions(options));
      }
    }
    Object.getOwnPropertyNames(PreviousCalendar).forEach((key) => {
      if (!(key in SingleDaySpanFixedCalendar)) {
        try { SingleDaySpanFixedCalendar[key] = PreviousCalendar[key]; } catch {}
      }
    });
    SingleDaySpanFixedCalendar.__singleDaySpanFixed = true;
    window.FullCalendar.Calendar = SingleDaySpanFixedCalendar;
  }

  function fixOptions(options = {}) {
    if (typeof options.events !== 'function') return options;
    const original = options.events;
    return {
      ...options,
      events(info, success, failure) {
        return original.call(this, info, (items) => success(mergeSingleDayAllDayClones(items)), failure);
      }
    };
  }

  function mergeSingleDayAllDayClones(items) {
    if (!Array.isArray(items)) return items;
    const seen = new Set();
    return items.filter((item) => {
      if (!item?.allDay) return true;
      const record = item.extendedProps?.record || {};
      if (record.schedule_type === 'multi_day') return true;
      const key = String(record.id || item.id || '').split('::')[0];
      if (!key) return true;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  patchWhenReady();
})();
