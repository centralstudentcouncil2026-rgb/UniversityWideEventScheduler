(() => {
  if (window.__calendarGoogleStyleAddon) return;
  window.__calendarGoogleStyleAddon = true;

  const CREATE_BUTTON_ID = 'calendarQuickCreateButton';
  let lastViewType = '';
  let refetchTimer = 0;
  let currentViewMode = 'month';

  function calendarApi() {
    return window.CONNECT_STATE?.calendar || window.calendar || null;
  }

  function resolveViewMode(viewType = calendarApi()?.view?.type || '') {
    const normalized = String(viewType || '').toLowerCase();
    if (normalized === 'timegridday' || normalized === 'day') return 'day';
    if (normalized === 'timegridweek' || normalized === 'week') return 'week';
    if (normalized === 'listweek' || normalized === 'agenda') return 'agenda';
    return 'month';
  }

  function updateCurrentViewMode(viewType = calendarApi()?.view?.type || '') {
    currentViewMode = resolveViewMode(viewType);
    window.__calendarCurrentView = currentViewMode;
    return currentViewMode;
  }

  function formatEventDisplayTime(value, compact = false) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const parts = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: compact ? undefined : '2-digit',
      hour12: true,
      timeZone: 'Asia/Manila'
    }).formatToParts(date);
    const hour = parts.find((part) => part.type === 'hour')?.value || '';
    const minute = parts.find((part) => part.type === 'minute')?.value || '';
    const dayPeriod = parts.find((part) => part.type === 'dayPeriod')?.value || '';
    if (compact) return `${hour}${minute && minute !== '00' ? `:${minute}` : ''}${dayPeriod ? dayPeriod.toLowerCase() : ''}`;
    return minute ? `${hour}:${minute} ${dayPeriod}` : `${hour}:00 ${dayPeriod}`;
  }

  function getStoreSchedules() {
    return Array.isArray(window.CONNECT_STATE?.store?.events) ? window.CONNECT_STATE.store.events : [];
  }

  function resolveEventRecord(eventLike) {
    const info = eventLike || {};
    const props = info?.extendedProps || {};
    const directRecord = props.record || info?.record || null;
    if (directRecord) return directRecord;
    const id = info?.id || '';
    if (!id) return null;
    return getStoreSchedules().find((item) => item.id === String(id).split('::')[0]) || null;
  }

  function createGoogleStyleEventContent(arg) {
    const event = arg?.event;
    const record = resolveEventRecord(event);
    if (!record) return { domNodes: [] };

    const viewMode = updateCurrentViewMode(arg?.view?.type || calendarApi()?.view?.type || '');
    const title = record.title || event?.title || '';
    const start = record.start_time || record.start_at || record.start || event?.start;
    const end = record.end_time || record.end_at || record.end || event?.end;
    const venue = record.venue || record.location || '';
    const timeLabel = start ? formatEventDisplayTime(start, viewMode === 'month') : '';
    const durationLabel = start && end ? `${formatEventDisplayTime(start)} - ${formatEventDisplayTime(end)}` : '';
    const root = document.createElement('div');
    root.className = `google-style-event-content view-${viewMode}`;

    if (viewMode === 'month') {
      const time = document.createElement('span');
      time.className = 'google-style-event-time';
      time.textContent = timeLabel || '';
      const label = document.createElement('span');
      label.className = 'google-style-event-title';
      label.textContent = title;
      root.appendChild(time);
      root.appendChild(label);
    } else if (viewMode === 'agenda') {
      const meta = document.createElement('div');
      meta.className = 'google-style-event-meta';
      meta.textContent = [durationLabel || timeLabel || 'Schedule', title, venue].filter(Boolean).join(' | ');
      const label = document.createElement('div');
      label.className = 'google-style-event-title';
      label.textContent = record.organization_name || record.category_name || '';
      root.appendChild(meta);
      if (label.textContent) root.appendChild(label);
    } else {
      const label = document.createElement('div');
      label.className = 'google-style-event-title';
      label.textContent = title;
      const meta = document.createElement('div');
      meta.className = 'google-style-event-meta';
      meta.textContent = durationLabel || timeLabel || '';
      root.appendChild(label);
      root.appendChild(meta);
    }

    return { domNodes: [root] };
  }

  function patchViewSwitching() {
    if (window.__calendarGoogleStyleViewPatchApplied) return;
    window.__calendarGoogleStyleViewPatchApplied = true;

    const originalPortalSelectorValue = window.portalSelectorValue;
    window.portalSelectorValue = function patchedPortalSelectorValue() {
      const selected = document.getElementById('viewSelector')?.value || '';
      if (selected === 'agenda') return 'agenda';
      if (typeof originalPortalSelectorValue === 'function') return originalPortalSelectorValue.call(window);
      return 'dayGridMonth';
    };

    const originalChangeView = window.changeView;
    window.changeView = function patchedChangeView(view) {
      const requested = String(view || 'dayGridMonth');
      const requestedKey = requested.toLowerCase();
      const viewMap = {
        daygridmonth: 'dayGridMonth',
        month: 'dayGridMonth',
        timegridweek: 'timeGridWeek',
        week: 'timeGridWeek',
        timegridday: 'timeGridDay',
        day: 'timeGridDay',
        multimonthyear: 'multiMonthYear',
        year: 'multiMonthYear',
        listweek: 'listWeek',
        agenda: 'listWeek'
      };
      const normalized = viewMap[requestedKey] || requested || 'dayGridMonth';
      const selector = document.getElementById('viewSelector');
      if (selector) selector.value = requestedKey === 'agenda' ? 'agenda' : normalized;
      if (normalized !== 'listWeek' && typeof originalChangeView === 'function') {
        return originalChangeView.call(window, normalized);
      }
      const calendar = calendarApi();
      if (calendar?.changeView) {
        calendar.changeView(normalized);
        calendar.refetchEvents?.();
      } else if (typeof originalChangeView === 'function') {
        return originalChangeView.call(window, normalized);
      }
      return null;
    };
  }

  function injectStyle() {
    if (document.getElementById('calendar-google-style-addon-style')) return;
    const style = document.createElement('style');
    style.id = 'calendar-google-style-addon-style';
    style.textContent = `
      body.portal-shell #calendar{position:relative!important;}
      body.portal-shell .calendar-panel-header{position:relative!important;}
      body.portal-shell #${CREATE_BUTTON_ID}{
        align-items:center!important;
        background:rgba(15,23,42,.82)!important;
        border:1px solid rgba(255,255,255,.34)!important;
        border-radius:12px!important;
        box-shadow:0 10px 24px rgba(15,23,42,.18)!important;
        color:#fff!important;
        cursor:pointer!important;
        display:inline-flex!important;
        flex:0 0 auto!important;
        font-size:28px!important;
        font-weight:500!important;
        height:46px!important;
        justify-content:center!important;
        line-height:1!important;
        margin:0!important;
        padding:0!important;
        position:static!important;
        transition:transform .14s ease,box-shadow .14s ease,background-color .14s ease!important;
        width:46px!important;
        z-index:3!important;
      }
      body.portal-shell .calendar-panel-header #${CREATE_BUTTON_ID}{
        left:0!important;
        position:absolute!important;
        top:50%!important;
        transform:translateY(-50%)!important;
      }
      body.portal-shell #${CREATE_BUTTON_ID}:hover{
        background:#2563eb!important;
        box-shadow:0 14px 30px rgba(37,99,235,.28)!important;
      }
      body.portal-shell .calendar-panel-header #${CREATE_BUTTON_ID}:hover{
        transform:translateY(calc(-50% - 1px))!important;
      }
      body.portal-shell #${CREATE_BUTTON_ID}:focus-visible{
        outline:3px solid rgba(250,204,21,.58)!important;
        outline-offset:3px!important;
      }
      body.portal-shell #calendar .fc-daygrid-day-events{
        display:grid!important;
        gap:2px!important;
        margin-top:4px!important;
        padding-inline:4px!important;
      }
      body.portal-shell #calendar .fc-daygrid-event-harness{
        margin:0!important;
        min-width:0!important;
      }
      body.portal-shell #calendar .fc-daygrid-event{
        border-radius:5px!important;
        box-shadow:none!important;
        font-size:clamp(10px,.72vw,12px)!important;
        font-weight:700!important;
        line-height:1.2!important;
        min-height:16px!important;
        overflow:hidden!important;
        padding:1px 4px!important;
        white-space:nowrap!important;
      }
      body.portal-shell #calendar .fc-daygrid-dot-event{
        align-items:center!important;
        background:transparent!important;
        border:0!important;
        color:#0f172a!important;
        display:flex!important;
        gap:4px!important;
        padding:0 2px!important;
      }
      body.portal-shell #calendar .fc-daygrid-dot-event .fc-daygrid-event-dot{
        border:0!important;
        background:#3b9ddd!important;
        border-radius:999px!important;
        flex:0 0 7px!important;
        height:7px!important;
        margin:0!important;
        width:7px!important;
      }
      body.portal-shell #calendar .fc-daygrid-dot-event .fc-event-time,
      body.portal-shell #calendar .fc-daygrid-dot-event .fc-event-title{
        overflow:hidden!important;
        text-overflow:ellipsis!important;
        white-space:nowrap!important;
      }
      body.portal-shell #calendar .fc-daygrid-dot-event .fc-event-time{
        flex:0 0 auto!important;
        font-weight:800!important;
      }
      body.portal-shell #calendar .fc-daygrid-dot-event .fc-event-title{
        min-width:0!important;
      }
      body.portal-shell #calendar .fc-daygrid-block-event{
        border:0!important;
        color:#fff!important;
        padding:1px 7px!important;
      }
      body.portal-shell #calendar .fc-timegrid-event,
      body.portal-shell #calendar .fc-timegrid-event-harness .event-blocked,
      body.portal-shell #calendar .fc-timegrid-event-harness .event-super-admin-block{
        border-radius:6px!important;
        min-height:18px!important;
        overflow:hidden!important;
      }
      body.portal-shell #calendar .fc-timegrid-event .fc-event-main{
        align-items:flex-start!important;
        display:flex!important;
        flex-direction:column!important;
        gap:2px!important;
        height:100%!important;
        min-height:0!important;
        overflow:hidden!important;
        padding:3px 5px!important;
      }
      body.portal-shell #calendar .fc-timegrid-event .fc-event-time,
      body.portal-shell #calendar .fc-timegrid-event .fc-event-title{
        display:block!important;
        max-width:100%!important;
        min-width:0!important;
        overflow:hidden!important;
        text-overflow:ellipsis!important;
        white-space:nowrap!important;
      }
      body.portal-shell #calendar .fc-daygrid-more-link{
        border-radius:6px!important;
        color:#0f172a!important;
        display:inline-flex!important;
        font-size:clamp(10px,.72vw,12px)!important;
        font-weight:800!important;
        line-height:1.2!important;
        margin:1px 0 0 2px!important;
        max-width:100%!important;
        overflow:hidden!important;
        padding:1px 4px!important;
        text-overflow:ellipsis!important;
        white-space:nowrap!important;
      }
      body.portal-shell #calendar .fc-daygrid-more-link:hover{
        background:rgba(37,99,235,.1)!important;
        color:#1d4ed8!important;
        text-decoration:none!important;
      }
      body.portal-shell #calendar .google-style-event-content{
        display:flex!important;
        flex-direction:column!important;
        gap:2px!important;
        min-height:100%!important;
        overflow:hidden!important;
      }
      body.portal-shell #calendar .google-style-event-content.view-month{
        font-size:10px!important;
        font-weight:700!important;
        line-height:1.15!important;
      }
      body.portal-shell #calendar .google-style-event-content.view-week,
      body.portal-shell #calendar .google-style-event-content.view-day{
        font-size:11px!important;
        font-weight:700!important;
        line-height:1.2!important;
      }
      body.portal-shell #calendar .google-style-event-content.view-agenda{
        gap:3px!important;
        padding:2px 0!important;
      }
      body.portal-shell #calendar .google-style-event-time,
      body.portal-shell #calendar .google-style-event-meta{
        color:rgba(15,23,42,.84)!important;
        font-size:10px!important;
        font-weight:800!important;
        line-height:1.1!important;
        opacity:.95!important;
      }
      body.portal-shell #calendar .google-style-event-title{
        color:#0f172a!important;
        font-size:inherit!important;
        font-weight:700!important;
        line-height:1.2!important;
        overflow:hidden!important;
        text-overflow:ellipsis!important;
        white-space:nowrap!important;
      }
      body.portal-shell #calendar .fc-popover{
        border:1px solid rgba(148,163,184,.38)!important;
        border-radius:12px!important;
        box-shadow:0 18px 44px rgba(15,23,42,.2)!important;
        overflow:hidden!important;
      }
      @media (max-width:640px){
        body.portal-shell #${CREATE_BUTTON_ID}{
          border-radius:10px!important;
          font-size:24px!important;
          height:40px!important;
          width:40px!important;
        }
        body.portal-shell #calendar .fc-daygrid-day-events{gap:1px!important;padding-inline:2px!important;}
        body.portal-shell #calendar .fc-daygrid-event,
        body.portal-shell #calendar .fc-daygrid-more-link{font-size:10px!important;}
      }
    `;
    document.head.appendChild(style);
  }

  function applyCalendarOptions() {
    const calendar = calendarApi();
    if (!calendar?.setOption) return false;
    if (!calendar.__googleStyleAddonApplied) {
      calendar.__googleStyleAddonApplied = true;
      calendar.setOption('timeZone', 'local');
      calendar.setOption('dayMaxEventRows', true);
      calendar.setOption('dayMaxEvents', true);
      calendar.setOption('moreLinkClick', 'popover');
      calendar.setOption('eventOrder', 'start,-duration,allDay,title');
    }
    calendar.setOption('allDaySlot', false);
    calendar.setOption('slotMinTime', '06:00:00');
    calendar.setOption('slotMaxTime', '24:00:00');
    calendar.setOption('scrollTime', '06:00:00');
    calendar.setOption('slotEventOverlap', false);
    calendar.setOption('lazyFetching', false);
    calendar.setOption('selectable', true);
    calendar.setOption('selectMirror', true);
    calendar.setOption('snapDuration', '00:15:00');
    calendar.setOption('selectAllow', () => calendar.view?.type !== 'multiMonthYear');
    if (!document.body.classList.contains('personal-calendar-perspective')) {
      calendar.setOption('eventContent', createGoogleStyleEventContent);
    }
    ensureCalendarCreateHandlers(calendar);
    ensureViewRefetch(calendar);
    ensureToolbarViews(calendar);
    patchViewSwitching();
    calendar.updateSize?.();
    return true;
  }

  function ensureToolbarViews(calendar) {
    const view = document.getElementById('viewSelector');
    if (!view || view.__googleStyleViewsReady) return;
    const wanted = [
      ['dayGridMonth', 'Month'],
      ['timeGridWeek', 'Week'],
      ['timeGridDay', 'Day'],
      ['listWeek', 'Agenda'],
      ['multiMonthYear', 'Year']
    ];
    const existing = new Set([...view.options].map((option) => option.value));
    wanted.forEach(([value, label]) => {
      if (existing.has(value)) return;
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      view.appendChild(option);
    });
    view.__googleStyleViewsReady = true;
  }

  function ensureViewRefetch(calendar) {
    if (!calendar || calendar.__googleStyleViewRefetchBound) return;
    calendar.__googleStyleViewRefetchBound = true;
    lastViewType = calendar.view?.type || '';
    updateCurrentViewMode(calendar.view?.type || '');
    const originalDatesSet = typeof calendar.getOption === 'function' ? calendar.getOption('datesSet') : null;
    if (typeof originalDatesSet === 'function') {
      calendar.setOption('datesSet', function googleStyleDatesSet(info) {
        const result = originalDatesSet.call(this, info);
        scheduleViewRefetch();
        return result;
      });
    }
    document.addEventListener('change', (event) => {
      if (event.target?.id !== 'viewSelector') return;
      scheduleViewRefetch();
    }, true);
  }

  function scheduleViewRefetch() {
    clearTimeout(refetchTimer);
    refetchTimer = setTimeout(() => {
      const calendar = calendarApi();
      const viewType = calendar?.view?.type || '';
      if (!calendar || viewType === lastViewType) return;
      lastViewType = viewType;
      updateCurrentViewMode(viewType);
      calendar.refetchEvents?.();
      calendar.updateSize?.();
    }, 160);
  }

  function dateInputValue(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function timeInputValue(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  function addMinutes(value, minutes) {
    const date = value instanceof Date ? new Date(value) : new Date(value);
    date.setMinutes(date.getMinutes() + minutes);
    return date;
  }

  function setFieldValue(id, value) {
    const field = document.getElementById(id);
    if (!field || value == null) return;
    field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function normalizeCreateRange(range = {}) {
    const start = range.start instanceof Date ? range.start : new Date(range.start || range.date || Date.now());
    let end = range.end instanceof Date ? range.end : new Date(range.end || start);
    if (Number.isNaN(start.getTime())) return null;
    if (Number.isNaN(end.getTime()) || end <= start) end = addMinutes(start, range.allDay ? 60 : 30);
    return { start, end };
  }

  function prefillScheduleForm(range) {
    const normalized = normalizeCreateRange(range);
    if (!normalized) return;
    const startDate = dateInputValue(normalized.start);
    const endDate = dateInputValue(normalized.end);
    setFieldValue('eventId', '');
    setFieldValue('eventDate', startDate);
    setFieldValue('eventEndDate', endDate);
    setFieldValue('eventStart', timeInputValue(normalized.start) || '09:00');
    setFieldValue('eventEnd', timeInputValue(normalized.end) || '10:00');
    setFieldValue('eventScheduleType', startDate && endDate && startDate !== endDate ? 'multi_day' : 'single_day');
    const form = document.getElementById('eventForm');
    if (form) {
      form.dataset.mode = 'create';
      form.dataset.eventMode = 'create';
      form.dataset.editingScheduleId = '';
    }
  }

  function openCreateSchedule(range = {}) {
    if (!document.body.classList.contains('portal-authenticated')) return false;
    const create = document.getElementById('createEventButton');
    if (create) create.click();
    else {
      const modal = document.getElementById('eventModal');
      const form = document.getElementById('eventForm');
      form?.reset?.();
      if (typeof modal?.showModal === 'function') modal.showModal();
      else modal?.setAttribute('open', '');
    }
    [0, 60, 160].forEach((delay) => window.setTimeout(() => prefillScheduleForm(range), delay));
    return true;
  }

  function ensureCalendarCreateHandlers(calendar) {
    if (!calendar?.setOption || calendar.__googleStyleCreateHandlers) return;
    calendar.__googleStyleCreateHandlers = true;
    const originalDateClick = typeof calendar.getOption === 'function' ? calendar.getOption('dateClick') : null;
    const originalSelect = typeof calendar.getOption === 'function' ? calendar.getOption('select') : null;
    calendar.setOption('dateClick', function googleStyleDateClick(info) {
      if (calendar.view?.type === 'multiMonthYear') return originalDateClick?.call(this, info);
      const opened = openCreateSchedule({
        start: info?.date || info?.dateStr,
        end: addMinutes(info?.date || info?.dateStr || Date.now(), info?.allDay ? 60 : 30),
        allDay: info?.allDay
      });
      if (!opened && typeof originalDateClick === 'function') return originalDateClick.call(this, info);
      info?.jsEvent?.preventDefault?.();
      return null;
    });
    calendar.setOption('select', function googleStyleSelect(info) {
      if (calendar.view?.type === 'multiMonthYear') return originalSelect?.call(this, info);
      const opened = openCreateSchedule({
        start: info?.start || info?.startStr,
        end: info?.end || info?.endStr,
        allDay: info?.allDay
      });
      calendar.unselect?.();
      if (!opened && typeof originalSelect === 'function') return originalSelect.call(this, info);
      info?.jsEvent?.preventDefault?.();
      return null;
    });
  }

  function ensureCreateButton() {
    const header = document.querySelector('.calendar-panel-header');
    const calendarHost = document.getElementById('calendar');
    const host = header || calendarHost;
    if (!host) return false;
    let button = document.getElementById(CREATE_BUTTON_ID);
    if (!button) {
      button = document.createElement('button');
      button.id = CREATE_BUTTON_ID;
      button.type = 'button';
      button.textContent = '+';
      button.title = 'Create schedule';
      button.setAttribute('aria-label', 'Create schedule');
    }
    if (button.parentElement !== host) host.prepend(button);
    const personal = document.body.classList.contains('personal-calendar-perspective');
    button.title = personal ? 'Create personal schedule' : 'Create schedule';
    button.setAttribute('aria-label', button.title);
    button.hidden = !document.body.classList.contains('portal-authenticated');
    return true;
  }

  function triggerCreate(event) {
    const button = event.target.closest(`#${CREATE_BUTTON_ID}`);
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const create = document.getElementById('createEventButton');
    if (create) {
      create.click();
      return;
    }
    const modal = document.getElementById('eventModal');
    if (typeof modal?.showModal === 'function') modal.showModal();
  }

  function refresh() {
    injectStyle();
    applyCalendarOptions();
    ensureCreateButton();
  }

  function scheduleRefresh() {
    clearTimeout(window.__calendarGoogleStyleRefreshTimer);
    window.__calendarGoogleStyleRefreshTimer = setTimeout(refresh, 80);
  }

  function init() {
    refresh();
    document.addEventListener('click', triggerCreate, true);
    new MutationObserver(scheduleRefresh).observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'hidden']
    });
    window.addEventListener('resize', scheduleRefresh, { passive: true });
    const timer = setInterval(() => {
      const ready = applyCalendarOptions() && ensureCreateButton();
      if (ready) clearInterval(timer);
    }, 250);
    setTimeout(() => clearInterval(timer), 8000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
