(() => {
  if (window.__cscPersonalCalendarAddon) return;
  window.__cscPersonalCalendarAddon = true;

  const SESSION_KEY = 'core_supabase_auth_session';
  const TABLE = 'personal_calendar_items';
  const PERSONAL_RECORD_TYPE = 'personal_schedule';
  const CLASS_CATEGORY = { id: 'class', name: 'Class', color: '#2563eb', active: true };
  const HEADER_SEARCH_FULL_PLACEHOLDER = 'Search public calendars by full name or title';
  const HEADER_SEARCH_COMPACT_PLACEHOLDER = 'Search';
  const RECURRENCE_TYPES = ['none', 'daily', 'weekly', 'monthly', 'yearly'];
  const PERSONAL_EVENTS_CACHE_TTL = 60000;
  let events = [];
  let filteredEvents = [];
  let cachedPersonalRows = [];
  let activeQuery = '';
  let personalMode = false;
  let savedDashboardUi = null;
  let savedMainEvents = null;
  let savedMainCategories = null;
  let savedCalendarCreateHandlers = null;
  let observerRefreshTimer = 0;
  let activePersonalDetailId = '';
  let activePersonalDetailRecord = null;
  let detailsCleanupTimer = 0;
  let detailsObserver = null;
  let applyingPersonalDetails = false;
  let suppressPersonalCalendarOpenUntil = 0;
  let eventsLoadedAt = 0;
  let eventsLoadedQuery = '';
  let eventsLoadPromise = null;
  let searchRequestSeq = 0;
  let searchRefreshTimer = 0;
  let heightSyncFrame = 0;
  let heightSyncTimer = 0;
  let personalCalendar = null;

  function session() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
  }

  function user() {
    const store = window.CONNECT_STATE?.store || window.CONNECT_BOOTSTRAP_STORE || {};
    const uid = store.currentUserId || session()?.user?.id || '';
    const email = String(session()?.user?.email || '').toLowerCase();
    return (store.users || []).find((item) => item.id === uid)
      || (store.users || []).find((item) => String(item.email || '').toLowerCase() === email)
      || window.CONNECT_AUTHENTICATED_USER
      || session()?.user
      || {};
  }

  function authHeaders(prefer = 'return=representation') {
    const key = window.SUPABASE_CONFIG?.publishableKey || window.SUPABASE_CONFIG?.anonKey || window.SUPABASE_CONFIG?.apiKey || window.SUPABASE_CONFIG?.apikey || '';
    return {
      apikey: key,
      Authorization: `Bearer ${session()?.access_token || key}`,
      'Content-Type': 'application/json',
      Prefer: prefer
    };
  }

  async function rest(path, options = {}, prefer) {
    const url = window.SUPABASE_CONFIG?.url;
    if (!url) throw new Error('Supabase URL is missing.');
    const response = await fetch(`${url}${path}`, {
      ...options,
      headers: { ...authHeaders(prefer), ...(options.headers || {}) }
    });
    const text = await response.text();
    let payload = null;
    if (text) {
      try { payload = JSON.parse(text); } catch { payload = text; }
    }
    if (!response.ok) {
      const message = payload?.message || payload?.error_description || payload?.error || `Supabase request failed (${response.status})`;
      throw new Error(message);
    }
    return payload;
  }

  function createId() {
    const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `personal_${id}`;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[char]));
  }

  function datetime(date, time) {
    return `${date}T${time || '00:00'}:00`;
  }

  function addInterval(date, type) {
    const next = new Date(date);
    if (type === 'daily') next.setDate(next.getDate() + 1);
    else if (type === 'weekly') next.setDate(next.getDate() + 7);
    else if (type === 'monthly') next.setMonth(next.getMonth() + 1);
    else if (type === 'yearly') next.setFullYear(next.getFullYear() + 1);
    return next;
  }

  function isoDate(date) {
    return date.toISOString().slice(0, 10);
  }

  function defaultRecurrenceUntil(startDate, recurrenceType) {
    if (!startDate || recurrenceType === 'none') return startDate || '';
    const until = new Date(datetime(startDate, '00:00'));
    until.setFullYear(until.getFullYear() + 1);
    return isoDate(until);
  }

  function buildOccurrences({ startDate, startTime, endDate, endTime, recurrenceType, recurrenceUntil }) {
    if (!startDate || !startTime || !endTime) return [];
    const type = RECURRENCE_TYPES.includes(recurrenceType) ? recurrenceType : 'none';
    const finalDate = endDate || startDate;
    const firstStart = new Date(datetime(startDate, startTime));
    const firstEnd = new Date(datetime(finalDate, endTime));
    const duration = Math.max(30 * 60 * 1000, firstEnd - firstStart);
    if (type === 'none') {
      return [{ id: createId(), date: startDate, start_time: firstStart.toISOString(), end_time: firstEnd.toISOString() }];
    }
    const until = new Date(datetime(recurrenceUntil || startDate, endTime));
    const rows = [];
    let cursor = new Date(firstStart);
    for (let index = 0; index < 730 && cursor <= until; index += 1) {
      const end = new Date(cursor.getTime() + duration);
      rows.push({ id: createId(), date: isoDate(cursor), start_time: cursor.toISOString(), end_time: end.toISOString() });
      cursor = addInterval(cursor, type);
    }
    return rows;
  }

  function recurrenceLabel(value) {
    return ({ none: 'Does not repeat', daily: 'Every day', weekly: 'Every week', monthly: 'Every month', yearly: 'Every year' })[value] || 'Does not repeat';
  }

  function currentUserId() {
    return user().id || session()?.user?.id || '';
  }

  function ownerName() {
    const current = user();
    const meta = session()?.user?.user_metadata || session()?.user?.raw_user_meta_data || {};
    return current.full_name || current.username || current.organization_name || current.organizationName || meta.full_name || meta.name || current.email || session()?.user?.email || 'Calendar User';
  }

  function injectStyle() {
    if (document.getElementById('personal-calendar-addon-style')) return;
    const style = document.createElement('style');
    style.id = 'personal-calendar-addon-style';
    style.textContent = `
      #personalCalendarButton{width:100%;}
      .personal-calendar-section #personalCalendarButton{align-items:center;display:inline-flex;font-size:inherit;justify-content:center;line-height:1.2;min-height:42px;overflow-wrap:anywhere;padding-block:8px;text-align:center;white-space:normal;}
      body.admin-dashboard-shell .personal-calendar-section{background:linear-gradient(180deg,rgba(239,246,255,.96),rgba(255,255,255,.92))!important;border:1px solid rgba(37,99,235,.2)!important;border-radius:14px!important;box-shadow:0 14px 28px rgba(15,23,42,.08)!important;box-sizing:border-box!important;display:grid!important;gap:10px!important;margin:0!important;max-width:100%!important;min-width:0!important;overflow:hidden!important;padding:12px!important;width:100%!important;}
      body.admin-dashboard-shell .personal-calendar-section #personalCalendarButton{align-items:center!important;border-radius:18px!important;box-sizing:border-box!important;display:flex!important;font-size:clamp(13px,3.6vw,16px)!important;font-weight:800!important;justify-content:center!important;line-height:1.18!important;margin:0!important;min-height:48px!important;min-width:0!important;overflow:hidden!important;padding:10px 12px!important;text-align:center!important;text-overflow:ellipsis!important;white-space:nowrap!important;width:100%!important;}
      body.admin-dashboard-shell .personal-calendar-section .section-label{align-items:center!important;background:transparent!important;border:0!important;color:#334155!important;display:flex!important;font-size:clamp(11px,2.8vw,13px)!important;font-weight:900!important;letter-spacing:0!important;line-height:1.16!important;margin:0!important;min-height:0!important;overflow:hidden!important;padding:0!important;text-overflow:ellipsis!important;text-transform:uppercase!important;white-space:nowrap!important;}
      @media (max-width:760px){body.admin-dashboard-shell .personal-calendar-section{border-radius:13px!important;gap:10px!important;padding:12px!important;}body.admin-dashboard-shell .personal-calendar-section #personalCalendarButton{border-radius:16px!important;min-height:44px!important;padding:9px 10px!important;}}
      #personalCalendarHost{display:none!important;}
      body.personal-calendar-perspective #calendar{display:none!important;}
      body.personal-calendar-perspective #personalCalendarHost{display:block!important;}
      body.personal-calendar-perspective .calendar-panel{min-height:0!important;padding:16px!important;}
      body.personal-calendar-perspective #personalCalendarHost{flex:0 0 auto!important;height:var(--personal-calendar-height,520px)!important;min-height:0!important;margin-bottom:0!important;border:1.5px solid rgba(100,116,139,.34)!important;background:rgba(255,255,255,.76)!important;}
      body.personal-calendar-perspective #personalCalendarHost .fc,
      body.personal-calendar-perspective #personalCalendarHost .fc-view-harness,
      body.personal-calendar-perspective #personalCalendarHost .fc-view-harness-active{height:100%!important;min-height:0!important;}
      body.personal-calendar-perspective #personalCalendarHost .fc-scrollgrid,
      body.personal-calendar-perspective #personalCalendarHost .fc-scrollgrid table,
      body.personal-calendar-perspective #personalCalendarHost .fc-daygrid-body,
      body.personal-calendar-perspective #personalCalendarHost .fc-daygrid-body table,
      body.personal-calendar-perspective #personalCalendarHost .fc-daygrid-body-balanced,
      body.personal-calendar-perspective #personalCalendarHost .fc-daygrid-body-unbalanced{width:100%!important;height:100%!important;}
      body.personal-calendar-perspective #personalCalendarHost .fc-scrollgrid,
      body.personal-calendar-perspective #personalCalendarHost .fc-theme-standard td,
      body.personal-calendar-perspective #personalCalendarHost .fc-theme-standard th,
      body.personal-calendar-perspective #personalCalendarHost .fc-scrollgrid td,
      body.personal-calendar-perspective #personalCalendarHost .fc-scrollgrid th{border-color:rgba(100,116,139,.34)!important;border-style:solid!important;}
      body.personal-calendar-perspective #personalCalendarHost .fc-daygrid-day-frame{min-height:0!important;background:rgba(255,255,255,.44)!important;}
      body.personal-calendar-perspective #personalCalendarHost .fc-daygrid-day-number{display:block!important;color:#0f172a!important;font-weight:700!important;}
      body.personal-calendar-perspective #personalCalendarHost .event-month-occurrence,
      body.personal-calendar-perspective #personalCalendarHost .gcal-month-event,
      body.personal-calendar-perspective #personalCalendarHost .event-month-occurrence .fc-event-main,
      body.personal-calendar-perspective #personalCalendarHost .gcal-month-event .fc-event-main,
      body.personal-calendar-perspective #personalCalendarHost .event-month-occurrence .fc-event-main-frame,
      body.personal-calendar-perspective #personalCalendarHost .gcal-month-event .fc-event-main-frame{align-items:center!important;color:#fff!important;display:flex!important;min-width:0!important;overflow:hidden!important;}
      body.personal-calendar-perspective #personalCalendarHost .event-month-occurrence .fc-event-time,
      body.personal-calendar-perspective #personalCalendarHost .event-month-occurrence .fc-event-title,
      body.personal-calendar-perspective #personalCalendarHost .gcal-month-event .fc-event-time,
      body.personal-calendar-perspective #personalCalendarHost .gcal-month-event .fc-event-title{color:#fff!important;display:inline!important;font-size:11px!important;font-weight:800!important;line-height:1.15!important;min-width:0!important;opacity:1!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;}
      body.personal-calendar-perspective #personalCalendarHost .event-month-occurrence .fc-event-title-container,
      body.personal-calendar-perspective #personalCalendarHost .gcal-month-event .fc-event-title-container{display:block!important;min-width:0!important;overflow:hidden!important;}
      body.personal-calendar-perspective #personalCalendarHost .personal-calendar-event-content{align-items:center!important;color:#fff!important;display:flex!important;font-size:11px!important;font-weight:800!important;gap:2px!important;line-height:1.15!important;min-height:14px!important;min-width:0!important;overflow:hidden!important;width:100%!important;}
      body.personal-calendar-perspective #personalCalendarHost .personal-calendar-event-time{color:#fff!important;display:inline!important;flex:0 0 auto!important;font-size:11px!important;line-height:1.15!important;white-space:nowrap!important;}
      body.personal-calendar-perspective #personalCalendarHost .personal-calendar-event-title{color:#fff!important;display:inline!important;flex:1 1 auto!important;font-size:11px!important;line-height:1.15!important;min-width:0!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;}
      body.personal-calendar-perspective #eventForm[data-personal-schedule="1"] label:has(#eventEntryType),
      body.personal-calendar-perspective #eventForm[data-personal-schedule="1"] label:has(#eventScheduleType),
      body.personal-calendar-perspective #eventForm[data-personal-schedule="1"] label:has(#eventCategory),
      body.personal-calendar-perspective #eventForm[data-personal-schedule="1"] label:has(#eventEndDate),
      body.personal-calendar-perspective #eventForm[data-personal-schedule="1"] label:has(#eventContactPerson),
      body.personal-calendar-perspective #eventForm[data-personal-schedule="1"] label:has(#eventContactInfo),
      body.personal-calendar-perspective #eventForm[data-personal-schedule="1"] label:has(#eventPublicDescription),
      body.personal-calendar-perspective #eventForm[data-personal-schedule="1"] label:has(#eventPurpose),
      body.personal-calendar-perspective #eventForm[data-personal-schedule="1"] label:has(#eventAttendees),
      body.personal-calendar-perspective #eventForm[data-personal-schedule="1"] label:has(#eventRecurrenceUntil),
      body.personal-calendar-perspective #eventForm[data-personal-schedule="1"] #deleteEventButton{display:none!important;}
      #detailsModal[data-personal-schedule-details] #detailsDeleteButton,
      #detailsModal[data-personal-schedule-details] #detailsCancelButton,
      #detailsModal[data-personal-schedule-details] #detailsRejectButton,
      #detailsModal[data-personal-schedule-details] #detailsApproveButton,
      #detailsModal[data-personal-schedule-details] #detailsEditButton{display:none!important;}
      #detailsModal[data-personal-schedule-details] .modal-card{display:flex!important;flex-direction:column!important;max-height:min(640px,calc(100dvh - 28px))!important;overflow:hidden!important;}
      #detailsModal[data-personal-schedule-details] .modal-header{flex:0 0 auto!important;}
      #detailsModal[data-personal-schedule-details] #detailsList{flex:1 1 auto!important;overflow:auto!important;}
      #detailsModal[data-personal-schedule-details] .modal-actions{align-items:center!important;background:#fff!important;border-top:1px solid #e2e8f0!important;bottom:0!important;display:flex!important;flex:0 0 auto!important;justify-content:flex-end!important;margin-top:auto!important;padding:14px 18px!important;position:sticky!important;z-index:2!important;}
      #detailsModal[data-personal-schedule-details="readonly"] .modal-actions{display:none!important;}
      #personalDetailsActions{display:flex;gap:10px;justify-content:flex-end;width:100%;}
      #personalDetailsActions[hidden]{display:none!important;}
      #personalDetailsActions button{min-height:42px;border-radius:999px;padding-inline:18px;}
      body.personal-calendar-perspective #headerOrganizationFilter{display:none!important;}
      #personalCalendarHeaderSearch{display:none;}
      body.personal-calendar-perspective #personalCalendarHeaderSearch{display:inline-flex!important;}
      body.personal-calendar-perspective #mobileMenuButton{align-items:center!important;aspect-ratio:1/1!important;border-radius:999px!important;display:inline-flex!important;flex:0 0 auto!important;height:44px!important;justify-content:center!important;min-height:44px!important;min-width:44px!important;padding:0!important;width:44px!important;}
      body.personal-calendar-perspective #mobileMenuButton span{display:none!important;}
      body.personal-calendar-perspective #mobileMenuButton::before{content:'\\2190'!important;font-size:1.3rem!important;font-weight:800!important;line-height:1!important;}
      body.personal-calendar-perspective .sidebar .sidebar-section{display:none!important;}
      body.personal-calendar-perspective .sidebar .admin-action-panel,
      body.personal-calendar-perspective .sidebar .status-card{display:grid!important;}
      body.personal-calendar-perspective .admin-action-panel .section-label,
      body.personal-calendar-perspective .admin-action-panel .secondary-button,
      body.personal-calendar-perspective .admin-action-panel button:not(#createEventButton){display:none!important;}
      body.personal-calendar-perspective .personal-calendar-section{display:none!important;}
      body.personal-calendar-perspective #createEventButton{display:inline-flex!important;align-items:center!important;justify-content:center!important;min-width:0!important;white-space:normal!important;overflow-wrap:anywhere!important;text-align:center!important;}
      body.personal-calendar-perspective #filterOrganization,
      body.personal-calendar-perspective label:has(#filterOrganization){display:none!important;}
      body.personal-calendar-perspective #eventForm[data-personal-schedule="1"] #cancelEventButton{display:none!important;}
      body.personal-calendar-perspective .topbar{gap:12px!important;min-width:0!important;}
      body.personal-calendar-perspective .brand-area{min-width:0!important;}
      body.personal-calendar-perspective .brand-copy{min-width:0!important;}
      body.personal-calendar-perspective .brand-copy h1,
      body.personal-calendar-perspective .brand-copy p{overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;}
      body.personal-calendar-perspective .calendar-nav{align-items:center!important;display:flex!important;flex:1 1 auto!important;flex-wrap:nowrap!important;gap:10px!important;justify-content:flex-end!important;min-width:0!important;position:relative!important;}
      body.personal-calendar-perspective #personalCalendarHeaderSearch{flex:1 1 220px!important;max-width:360px!important;min-width:96px!important;transition:max-width .18s ease,width .18s ease,flex-basis .18s ease,box-shadow .18s ease!important;}
      body.personal-calendar-perspective #viewSelector{flex:0 0 128px!important;min-width:104px!important;}
      body.personal-calendar-perspective .period-controls{display:inline-flex!important;flex:0 0 auto!important;gap:8px!important;}
      body.personal-calendar-perspective .period-controls .icon-button,
      body.personal-calendar-perspective #notificationsButton{flex:0 0 auto!important;}
      .personal-calendar-panel{background:#fff;border:1px solid var(--aup-border,#dbe4ef);border-radius:8px;padding:16px;box-shadow:var(--shadow,0 22px 60px rgba(15,23,42,.18));}
      .personal-calendar-panel h4{margin:0 0 12px;color:#0f172a;}
      .personal-calendar-results{display:grid;gap:10px;}
      .personal-calendar-card{border:1px solid #dbe4ef;border-left:5px solid #2563eb;border-radius:12px;background:#fff;padding:12px;display:grid;gap:6px;}
      .personal-calendar-card strong{color:#0f172a;}
      .personal-calendar-card p{margin:0;color:#475569;line-height:1.4;overflow-wrap:anywhere;}
      @media (max-width: 900px){
        body.personal-calendar-perspective .calendar-panel{padding:10px!important;}
        body.personal-calendar-perspective #personalCalendarHost{height:var(--personal-calendar-height,460px)!important;min-height:0!important;}
        body.personal-calendar-perspective .topbar{align-items:stretch!important;flex-wrap:wrap!important;}
        body.personal-calendar-perspective .brand-area{flex:1 1 280px!important;}
        body.personal-calendar-perspective .calendar-nav{flex:1 1 100%!important;flex-wrap:nowrap!important;justify-content:flex-start!important;}
        body.personal-calendar-perspective #personalCalendarHeaderSearch{max-width:none!important;}
        body.personal-calendar-perspective #viewSelector{flex:0 0 120px!important;}
      }
      @media (max-width: 640px){
        body.personal-calendar-perspective .calendar-panel{padding:8px!important;}
        body.personal-calendar-perspective #personalCalendarHost{height:var(--personal-calendar-height,360px)!important;min-height:0!important;}
        body.personal-calendar-perspective #mobileMenuButton{height:40px!important;min-height:40px!important;min-width:40px!important;width:40px!important;}
        body.personal-calendar-perspective .brand-logo{height:42px!important;width:42px!important;}
        body.personal-calendar-perspective .brand-copy h1{font-size:clamp(1rem,5vw,1.35rem)!important;}
        body.personal-calendar-perspective .brand-copy p{font-size:clamp(.68rem,3vw,.78rem)!important;}
        body.personal-calendar-perspective .calendar-nav{align-items:center!important;display:flex!important;gap:8px!important;justify-content:flex-start!important;overflow:visible!important;width:100%!important;}
        body.personal-calendar-perspective #personalCalendarHeaderSearch{caret-color:transparent!important;color:#111827!important;cursor:pointer!important;flex:1 1 180px!important;font-size:.84rem!important;max-width:40vw!important;min-height:42px!important;min-width:0!important;overflow:hidden!important;padding-inline:12px!important;text-align:left!important;text-overflow:ellipsis!important;white-space:nowrap!important;width:auto!important;}
        body.personal-calendar-perspective #personalCalendarHeaderSearch::placeholder{color:#111827!important;font-size:.84rem!important;opacity:1!important;text-align:left!important;text-overflow:ellipsis!important;}
        body.personal-calendar-perspective #viewSelector{flex:0 0 92px!important;font-size:.84rem!important;max-width:92px!important;min-height:42px!important;min-width:82px!important;overflow:hidden!important;padding-inline:10px!important;text-align:center!important;text-overflow:ellipsis!important;text-align-last:center!important;width:auto!important;}
        body.personal-calendar-perspective .period-controls{display:inline-flex!important;flex:0 0 auto!important;gap:8px!important;margin-left:0!important;}
        body.personal-calendar-perspective .period-controls .icon-button,
        body.personal-calendar-perspective #notificationsButton{flex:0 0 auto!important;height:42px!important;min-height:42px!important;}
        body.personal-calendar-perspective .period-controls .icon-button{aspect-ratio:1!important;border-radius:50%!important;max-width:42px!important;min-width:42px!important;padding:0!important;width:42px!important;}
        body.personal-calendar-perspective #notificationsButton{justify-content:center!important;min-width:48px!important;padding:0 8px!important;width:auto!important;}
        body.personal-calendar-perspective.personal-search-expanded #personalCalendarHeaderSearch{box-shadow:0 16px 34px rgba(15,23,42,.22)!important;caret-color:auto!important;color:#0f172a!important;cursor:text!important;left:0!important;max-width:none!important;min-width:0!important;position:absolute!important;right:0!important;text-align:left!important;top:0!important;width:100%!important;z-index:20!important;}
        body.personal-calendar-perspective.personal-search-expanded #personalCalendarHeaderSearch::placeholder{text-align:left!important;}
        body.personal-calendar-perspective #personalCalendarHost .fc-col-header-cell-cushion{font-size:.74rem!important;padding:2px 1px!important;}
        body.personal-calendar-perspective #personalCalendarHost .fc-daygrid-day-number{font-size:.74rem!important;padding:2px 4px!important;}
        body.personal-calendar-perspective #personalCalendarHost .fc-daygrid-day-frame{padding:0!important;}
        body.personal-calendar-perspective #personalCalendarHost .fc-daygrid-event{font-size:.62rem!important;line-height:1.1!important;margin:0 1px!important;padding:0 2px!important;}
      }
      @media (max-width: 390px){
        body.personal-calendar-perspective .calendar-nav{gap:4px!important;}
        body.personal-calendar-perspective #personalCalendarHeaderSearch{font-size:.76rem!important;min-height:36px!important;min-width:0!important;padding-left:8px!important;padding-right:18px!important;width:auto!important;}
        body.personal-calendar-perspective #personalCalendarHeaderSearch::placeholder{font-size:.76rem!important;}
        body.personal-calendar-perspective #viewSelector{flex-basis:76px!important;font-size:.76rem!important;max-width:76px!important;min-height:36px!important;min-width:70px!important;padding-left:8px!important;padding-right:18px!important;}
        body.personal-calendar-perspective .period-controls{gap:4px!important;}
        body.personal-calendar-perspective .period-controls .icon-button,
        body.personal-calendar-perspective #notificationsButton{height:36px!important;min-height:36px!important;}
        body.personal-calendar-perspective .period-controls .icon-button{flex-basis:36px!important;max-width:36px!important;min-width:36px!important;width:36px!important;}
        body.personal-calendar-perspective #notificationsButton{min-width:42px!important;padding:0 6px!important;}
        body.personal-calendar-perspective.personal-search-expanded #personalCalendarHeaderSearch{max-width:none!important;min-width:0!important;width:100%!important;}
      }
      @media (min-width: 381px) and (max-width: 520px){
        body.personal-calendar-perspective .calendar-nav{gap:6px!important;}
        body.personal-calendar-perspective #personalCalendarHeaderSearch,
        body.personal-calendar-perspective #viewSelector{font-size:13px!important;min-height:40px!important;}
        body.personal-calendar-perspective #personalCalendarHeaderSearch{padding-left:10px!important;padding-right:22px!important;}
        body.personal-calendar-perspective #viewSelector{flex-basis:88px!important;max-width:88px!important;padding-left:10px!important;padding-right:22px!important;}
        body.personal-calendar-perspective .period-controls{gap:6px!important;}
        body.personal-calendar-perspective .period-controls .icon-button{flex-basis:40px!important;height:40px!important;max-width:40px!important;min-height:40px!important;min-width:40px!important;width:40px!important;}
        body.personal-calendar-perspective #notificationsButton{height:40px!important;min-height:40px!important;min-width:46px!important;padding:0 8px!important;}
      }
      @media (max-width: 640px){
        body.personal-calendar-perspective #personalCalendarHeaderSearch{
          background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='%230f172a' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='11' cy='11' r='7'/%3E%3Cpath d='m20 20-3.5-3.5'/%3E%3C/svg%3E")!important;
          background-position:center!important;
          background-repeat:no-repeat!important;
          background-size:18px 18px!important;
          caret-color:transparent!important;
          color:transparent!important;
          display:inline-flex!important;
          flex:0 0 40px!important;
          max-width:40px!important;
          min-height:40px!important;
          min-width:40px!important;
          opacity:1!important;
          overflow:hidden!important;
          padding:0!important;
          position:relative!important;
          width:40px!important;
        }
        body.personal-calendar-perspective #personalCalendarHeaderSearch::placeholder{color:transparent!important;opacity:0!important;}
        body.personal-calendar-perspective.personal-search-expanded #personalCalendarHeaderSearch{
          background-image:none!important;
          caret-color:auto!important;
          color:#0f172a!important;
          flex:1 1 auto!important;
          max-width:none!important;
          min-width:0!important;
          padding:0 14px!important;
          width:100%!important;
        }
        body.personal-calendar-perspective.personal-search-expanded #personalCalendarHeaderSearch::placeholder{color:#64748b!important;opacity:1!important;}
      }
    `;
    document.head.appendChild(style);
  }

  function ensureRecurrenceControls() {
    const scheduleFields = document.getElementById('scheduleFields');
    if (!scheduleFields || document.getElementById('eventRecurrenceType')) return;
    const grid = scheduleFields.closest('.form-grid') || scheduleFields.parentElement;
    if (!grid) return;
    const repeatLabel = document.createElement('label');
    repeatLabel.innerHTML = `
      Repeat
      <select id="eventRecurrenceType">
        <option value="none">Does not repeat</option>
        <option value="daily">Every day</option>
        <option value="weekly">Every week</option>
        <option value="monthly">Every month</option>
        <option value="yearly">Every year</option>
      </select>
    `;
    const untilLabel = document.createElement('label');
    untilLabel.innerHTML = 'Repeat Until<input type="date" id="eventRecurrenceUntil">';
    scheduleFields.insertAdjacentElement('afterend', untilLabel);
    scheduleFields.insertAdjacentElement('afterend', repeatLabel);
  }

  function ensureTab() {
    if (document.getElementById('personalCalendarButton')) return;
    const button = document.createElement('button');
    button.className = 'secondary-button restricted-only';
    button.id = 'personalCalendarButton';
    button.type = 'button';
    button.textContent = 'My Own Calendar';
    const personalSection = document.createElement('section');
    personalSection.className = 'sidebar-section personal-calendar-section restricted-only';
    personalSection.innerHTML = '<span class="section-label">Personal</span>';
    button.classList.remove('restricted-only');
    personalSection.appendChild(button);

    const actionPanel = document.querySelector('.admin-action-panel');
    if (actionPanel) {
      actionPanel.insertAdjacentElement('afterend', personalSection);
      return;
    }

    document.getElementById('sidebar')?.appendChild(personalSection);
  }

  function dashboardCalendar() {
    return personalMode && personalCalendar ? personalCalendar : mainDashboardCalendar();
  }

  function mainDashboardCalendar() {
    return window.CONNECT_STATE?.calendar || null;
  }

  function dashboardStore() {
    return window.CONNECT_STATE?.store || window.CONNECT_BOOTSTRAP_STORE || null;
  }

  function ensurePersonalCalendarHost() {
    let host = document.getElementById('personalCalendarHost');
    if (!host) {
      host = document.createElement('div');
      host.id = 'personalCalendarHost';
      const mainCalendar = document.getElementById('calendar');
      mainCalendar?.insertAdjacentElement('afterend', host);
    }
    return host;
  }

  function showPersonalCalendarHost() {
    const host = ensurePersonalCalendarHost();
    const mainCalendar = document.getElementById('calendar');
    if (mainCalendar) mainCalendar.hidden = true;
    if (host) host.hidden = false;
  }

  function hidePersonalCalendarHost() {
    const host = document.getElementById('personalCalendarHost');
    const mainCalendar = document.getElementById('calendar');
    if (host) host.hidden = true;
    if (mainCalendar) mainCalendar.hidden = false;
    mainDashboardCalendar()?.updateSize?.();
  }

  function initPersonalCalendar() {
    if (personalCalendar) return personalCalendar;
    const host = ensurePersonalCalendarHost();
    if (!window.FullCalendar || !host) {
      window.setTimeout(initPersonalCalendar, 80);
      return null;
    }
    personalCalendar = new FullCalendar.Calendar(host, {
      initialView: 'dayGridMonth',
      firstDay: 0,
      height: '100%',
      expandRows: true,
      nowIndicator: true,
      selectable: true,
      editable: true,
      eventResizableFromStart: true,
      allDaySlot: false,
      slotMinTime: '06:00:00',
      slotMaxTime: '24:00:00',
      scrollTime: '06:00:00',
      headerToolbar: false,
      events: calendarEvents,
      eventContent: renderPersonalCalendarEventContent,
      dateClick: (info) => openPersonalForm(null, personalCalendar?.view?.type === 'dayGridMonth' ? personalMonthOccurrenceRange(localDateInput(info?.date || info?.dateStr)) : String(info?.dateStr || '').slice(0, 10)),
      select: (info) => {
        openPersonalForm(null, personalRangeFromSelection(info));
        personalCalendar?.unselect?.();
      },
      eventClick: openPersonalEventDetails,
      eventDrop: (info) => void persistPersonalCalendarMove(info),
      eventResize: (info) => void persistPersonalCalendarMove(info),
      eventAllow: (_dropInfo, draggedEvent) => canMovePersonalCalendarEvent(draggedEvent)
    });
    personalCalendar.render();
    return personalCalendar;
  }

  function saveMainEventsSnapshot() {
    const store = dashboardStore();
    if (store && !savedMainEvents) savedMainEvents = Array.isArray(store.events) ? [...store.events] : [];
    if (store && !savedMainCategories) savedMainCategories = Array.isArray(store.categories) ? [...store.categories] : [];
  }

  function restoreMainEvents() {
    const store = dashboardStore();
    if (store && savedMainEvents) {
      store.events = savedMainEvents;
      savedMainEvents = null;
    }
    if (store && savedMainCategories) {
      store.categories = savedMainCategories;
      savedMainCategories = null;
    }
    const calendar = mainDashboardCalendar();
    calendar?.refetchEvents?.();
    calendar?.updateSize?.();
  }

  function reloadMainDashboardCalendarItems() {
    const reloadStore = window.CSC_RELOAD_MAIN_DASHBOARD_STORE;
    if (typeof reloadStore !== 'function') return;
    Promise.resolve(reloadStore()).then(() => {
      const calendar = mainDashboardCalendar();
      const mainEvents = window.CSC_MAIN_DASHBOARD_CALENDAR_EVENTS;
      if (calendar && typeof mainEvents === 'function') {
        try { calendar.getEventSources?.().forEach((source) => source?.remove?.()); } catch {}
        calendar.removeAllEvents?.();
        calendar.addEventSource?.(mainEvents);
      }
      calendar?.refetchEvents?.();
      calendar?.rerenderEvents?.();
      calendar?.updateSize?.();
    }).catch((error) => {
      console.warn('Main dashboard schedules could not be reloaded after closing personal calendar:', error);
      mainDashboardCalendar()?.refetchEvents?.();
    });
  }

  function ensureHeaderSearch() {
    let search = document.getElementById('personalCalendarHeaderSearch');
    if (search) return search;
    search = document.createElement('input');
    search.id = 'personalCalendarHeaderSearch';
    search.className = 'view-selector personal-calendar-header-search';
    search.type = 'search';
    search.autocomplete = 'off';
    search.placeholder = HEADER_SEARCH_FULL_PLACEHOLDER;
    search.setAttribute('aria-label', 'Search public personal calendars');
    const organizationFilter = document.getElementById('headerOrganizationFilter');
    if (organizationFilter) organizationFilter.insertAdjacentElement('afterend', search);
    else document.querySelector('.calendar-nav')?.prepend(search);
    syncHeaderSearchMode(search);
    return search;
  }

  function compactHeaderSearchEnabled() {
    return window.matchMedia?.('(max-width: 640px)').matches;
  }

  function syncHeaderSearchMode(search = document.getElementById('personalCalendarHeaderSearch')) {
    if (!search) return;
    const compact = compactHeaderSearchEnabled();
    const expanded = document.body.classList.contains('personal-search-expanded') || document.activeElement === search;
    search.placeholder = compact && !expanded ? HEADER_SEARCH_COMPACT_PLACEHOLDER : HEADER_SEARCH_FULL_PLACEHOLDER;
    search.setAttribute('aria-expanded', String(compact && expanded));
    if (!compact) document.body.classList.remove('personal-search-expanded');
  }

  function expandHeaderSearch() {
    const search = document.getElementById('personalCalendarHeaderSearch');
    if (!search || !compactHeaderSearchEnabled()) return;
    document.body.classList.add('personal-search-expanded');
    search.placeholder = HEADER_SEARCH_FULL_PLACEHOLDER;
    search.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => {
      schedulePersonalCalendarHeightSync();
      search.focus({ preventScroll: true });
    });
  }

  function collapseHeaderSearch() {
    const search = document.getElementById('personalCalendarHeaderSearch');
    if (!search) return;
    document.body.classList.remove('personal-search-expanded');
    syncHeaderSearchMode(search);
    schedulePersonalCalendarHeightSync();
  }

  function ensurePersonalViewOptions() {
    const view = document.getElementById('viewSelector');
    if (!view) return;
    const currentValue = view.value;
    const optionLabels = {
      dayGridMonth: 'Month',
      timeGridWeek: 'Week'
    };
    view.innerHTML = '';
    Object.entries(optionLabels).forEach(([value, label]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      view.appendChild(option);
    });
    view.value = currentValue === 'timeGridWeek' ? 'timeGridWeek' : 'dayGridMonth';
  }

  function ensureClassCategory() {
    const store = dashboardStore();
    if (Array.isArray(store?.categories) && !store.categories.some((category) => category.id === CLASS_CATEGORY.id)) {
      const othersIndex = store.categories.findIndex((category) => category.id === 'others');
      const nextCategories = [...store.categories];
      nextCategories.splice(othersIndex >= 0 ? othersIndex : nextCategories.length, 0, { ...CLASS_CATEGORY });
      store.categories = nextCategories;
    }
    const category = document.getElementById('eventCategory');
    if (!category) return;
    const others = [...category.options].find((item) => item.value === 'others');
    const existing = [...category.options].find((option) => option.value === CLASS_CATEGORY.id);
    if (existing) {
      if (existing.textContent !== CLASS_CATEGORY.name) existing.textContent = CLASS_CATEGORY.name;
      if (existing.dataset.personalOnly) delete existing.dataset.personalOnly;
      if (others && existing.nextElementSibling !== others) category.insertBefore(existing, others);
      return;
    }
    const option = document.createElement('option');
    option.value = CLASS_CATEGORY.id;
    option.textContent = CLASS_CATEGORY.name;
    category.insertBefore(option, others || null);
  }

  function refreshAddonDom() {
    ensureRecurrenceControls();
    ensureHeaderSearch();
    if (personalMode) ensurePersonalViewOptions();
    ensureClassCategory();
    ensureTab();
  }

  function scheduleAddonDomRefresh() {
    clearTimeout(observerRefreshTimer);
    observerRefreshTimer = setTimeout(refreshAddonDom, 80);
  }

  function setDashboardTitle(value) {
    const title = document.getElementById('calendarTitle') || document.querySelector('.calendar-panel-header h2');
    if (title) title.textContent = cleanDashboardTitle(value);
  }

  function cleanDashboardTitle(value) {
    return String(value || 'Calendar')
      .replace(/\u2013|\u2014|\u00e2(?:\u20ac|\u0080)[\u201c\u201d\u0093\u0094]/g, ' - ')
      .replace(/\s+-\s+/g, ' - ')
      .replace(/\s{2,}/g, ' ')
      .trim() || 'Calendar';
  }

  function syncPersonalCalendarHeight() {
    if (!personalMode) return;
    const calendarEl = document.getElementById('personalCalendarHost');
    if (!calendarEl) return;
    const top = calendarEl.getBoundingClientRect().top;
    const viewportHeight = Math.floor(window.visualViewport?.height || window.innerHeight || document.documentElement.clientHeight || 640);
    const bottomGap = window.innerWidth <= 640 ? 8 : 18;
    const minimum = window.innerWidth <= 390 ? 150 : window.innerWidth <= 640 ? 180 : 320;
    const available = Math.floor(viewportHeight - top - bottomGap);
    const height = Math.max(minimum, available);
    calendarEl.style.setProperty('--personal-calendar-height', `${height}px`);
    personalCalendar?.updateSize?.();
  }

  function schedulePersonalCalendarHeightSync(delay = 0) {
    if (!personalMode) return;
    if (heightSyncTimer && delay > 0) clearTimeout(heightSyncTimer);
    const run = () => {
      heightSyncTimer = 0;
      if (heightSyncFrame) cancelAnimationFrame(heightSyncFrame);
      heightSyncFrame = requestAnimationFrame(() => {
        heightSyncFrame = 0;
        syncPersonalCalendarHeight();
      });
    };
    if (delay > 0) heightSyncTimer = window.setTimeout(run, delay);
    else run();
  }

  function installPersonalCalendarCreateHandlers() {
    const calendar = dashboardCalendar();
    if (!calendar?.setOption) return;
    if (savedCalendarCreateHandlers?.calendar === calendar) {
      calendar.setOption('selectable', true);
      calendar.setOption('allDaySlot', false);
      calendar.setOption('slotMinTime', '06:00:00');
      calendar.setOption('slotMaxTime', '24:00:00');
      calendar.setOption('scrollTime', '06:00:00');
      return;
    }
    savedCalendarCreateHandlers = {
      calendar,
      dateClick: typeof calendar.getOption === 'function' ? calendar.getOption('dateClick') : null,
      select: typeof calendar.getOption === 'function' ? calendar.getOption('select') : null,
      eventClick: typeof calendar.getOption === 'function' ? calendar.getOption('eventClick') : null,
      eventDrop: typeof calendar.getOption === 'function' ? calendar.getOption('eventDrop') : null,
      eventResize: typeof calendar.getOption === 'function' ? calendar.getOption('eventResize') : null,
      eventContent: typeof calendar.getOption === 'function' ? calendar.getOption('eventContent') : null,
      eventAllow: typeof calendar.getOption === 'function' ? calendar.getOption('eventAllow') : null,
      editable: typeof calendar.getOption === 'function' ? calendar.getOption('editable') : null,
      eventResizableFromStart: typeof calendar.getOption === 'function' ? calendar.getOption('eventResizableFromStart') : null,
      selectable: typeof calendar.getOption === 'function' ? calendar.getOption('selectable') : null,
      allDaySlot: typeof calendar.getOption === 'function' ? calendar.getOption('allDaySlot') : null,
      slotMinTime: typeof calendar.getOption === 'function' ? calendar.getOption('slotMinTime') : null,
      slotMaxTime: typeof calendar.getOption === 'function' ? calendar.getOption('slotMaxTime') : null,
      scrollTime: typeof calendar.getOption === 'function' ? calendar.getOption('scrollTime') : null,
      events: (typeof calendar.getOption === 'function' ? calendar.getOption('events') : null) || window.CSC_MAIN_DASHBOARD_CALENDAR_EVENTS || null
    };
    calendar.setOption('selectable', true);
    calendar.setOption('editable', true);
    calendar.setOption('eventContent', renderPersonalCalendarEventContent);
    calendar.setOption('eventResizableFromStart', true);
    calendar.setOption('allDaySlot', false);
    calendar.setOption('slotMinTime', '06:00:00');
    calendar.setOption('slotMaxTime', '24:00:00');
    calendar.setOption('scrollTime', '06:00:00');
    calendar.setOption('dateClick', (info) => {
      if (personalMode) {
        const clickedDate = localDateInput(info?.date || info?.dateStr);
        openPersonalForm(null, dashboardCalendar()?.view?.type === 'dayGridMonth' ? personalMonthOccurrenceRange(clickedDate) : String(info?.dateStr || '').slice(0, 10));
        return;
      }
      if (typeof savedCalendarCreateHandlers?.dateClick === 'function') savedCalendarCreateHandlers.dateClick(info);
    });
    calendar.setOption('select', (info) => {
      if (personalMode) {
        openPersonalForm(null, personalRangeFromSelection(info));
        calendar.unselect?.();
        return;
      }
      if (typeof savedCalendarCreateHandlers?.select === 'function') savedCalendarCreateHandlers.select(info);
    });
    calendar.setOption('eventClick', (info) => {
      if (personalMode) {
        openPersonalEventDetails(info);
        return;
      }
      if (typeof savedCalendarCreateHandlers?.eventClick === 'function') savedCalendarCreateHandlers.eventClick(info);
    });
    calendar.setOption('eventDrop', (info) => {
      if (personalMode) {
        void persistPersonalCalendarMove(info);
        return;
      }
      if (typeof savedCalendarCreateHandlers?.eventDrop === 'function') savedCalendarCreateHandlers.eventDrop(info);
    });
    calendar.setOption('eventResize', (info) => {
      if (personalMode) {
        void persistPersonalCalendarMove(info);
        return;
      }
      if (typeof savedCalendarCreateHandlers?.eventResize === 'function') savedCalendarCreateHandlers.eventResize(info);
    });
    calendar.setOption('eventAllow', (dropInfo, draggedEvent) => {
      if (personalMode) return canMovePersonalCalendarEvent(draggedEvent);
      return typeof savedCalendarCreateHandlers?.eventAllow === 'function'
        ? savedCalendarCreateHandlers.eventAllow(dropInfo, draggedEvent)
        : true;
    });
  }

  function restoreCalendarCreateHandlers() {
    const calendar = savedCalendarCreateHandlers?.calendar || dashboardCalendar();
    if (!calendar?.setOption || !savedCalendarCreateHandlers) return;
    const originalEvents = savedCalendarCreateHandlers.events || window.CSC_MAIN_DASHBOARD_CALENDAR_EVENTS || null;
    try { calendar.getEventSources?.().forEach((source) => source?.remove?.()); } catch {}
    calendar.removeAllEvents?.();
    calendar.setOption('dateClick', savedCalendarCreateHandlers.dateClick || null);
    calendar.setOption('select', savedCalendarCreateHandlers.select || null);
    calendar.setOption('eventClick', savedCalendarCreateHandlers.eventClick || null);
    calendar.setOption('eventDrop', savedCalendarCreateHandlers.eventDrop || null);
    calendar.setOption('eventResize', savedCalendarCreateHandlers.eventResize || null);
    calendar.setOption('eventContent', savedCalendarCreateHandlers.eventContent || null);
    calendar.setOption('eventAllow', savedCalendarCreateHandlers.eventAllow || null);
    calendar.setOption('editable', savedCalendarCreateHandlers.editable);
    calendar.setOption('eventResizableFromStart', savedCalendarCreateHandlers.eventResizableFromStart);
    calendar.setOption('selectable', savedCalendarCreateHandlers.selectable);
    calendar.setOption('allDaySlot', savedCalendarCreateHandlers.allDaySlot);
    calendar.setOption('slotMinTime', savedCalendarCreateHandlers.slotMinTime);
    calendar.setOption('slotMaxTime', savedCalendarCreateHandlers.slotMaxTime);
    calendar.setOption('scrollTime', savedCalendarCreateHandlers.scrollTime);
    if (originalEvents) {
      calendar.addEventSource?.(originalEvents);
    }
    calendar.refetchEvents?.();
    calendar.rerenderEvents?.();
    calendar.updateSize?.();
    savedCalendarCreateHandlers = null;
  }

  function renderPersonalCalendarEventContent(arg) {
    const props = arg.event?.extendedProps || {};
    if (!props.personalSchedule && props.type !== 'personal_schedule') return undefined;
    const root = document.createElement('span');
    root.className = 'personal-calendar-event-content';
    const time = formatCompactEventTime(arg.event?.start);
    if (time) {
      const timeNode = document.createElement('span');
      timeNode.className = 'personal-calendar-event-time';
      timeNode.textContent = time;
      root.appendChild(timeNode);
    }
    const titleNode = document.createElement('span');
    titleNode.className = 'personal-calendar-event-title';
    titleNode.textContent = personalScheduleTitle(props.record || props.item || { title: arg.event?.title });
    root.appendChild(titleNode);
    return { domNodes: [root] };
  }

  function formatCompactEventTime(value) {
    const date = value instanceof Date ? value : new Date(value || '');
    if (Number.isNaN(date.getTime())) return '';
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Manila',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).formatToParts(date);
    const hour = parts.find((part) => part.type === 'hour')?.value || '';
    const minute = parts.find((part) => part.type === 'minute')?.value || '';
    const suffix = (parts.find((part) => part.type === 'dayPeriod')?.value || '').toLowerCase();
    return minute && minute !== '00' ? `${hour}:${minute}${suffix}` : `${hour}${suffix}`;
  }

  function enterPersonalPerspective() {
    ensureHeaderSearch();
    if (personalMode) return;
    const menu = document.getElementById('mobileMenuButton');
    const view = document.getElementById('viewSelector');
    const create = document.getElementById('createEventButton');
    const title = document.getElementById('calendarTitle') || document.querySelector('.calendar-panel-header h2');
    const headerOrgFilter = document.getElementById('headerOrganizationFilter');
    const sideOrgFilter = document.getElementById('filterOrganization');
    savedDashboardUi = {
      menuHtml: menu?.innerHTML || '',
      menuLabel: menu?.getAttribute('aria-label') || '',
      menuTitle: menu?.getAttribute('title') || '',
      viewValue: view?.value || '',
      viewOptionsHtml: view?.innerHTML || '',
      createText: create?.textContent || '',
      titleText: title?.textContent || '',
      headerOrgFilterValue: headerOrgFilter?.value || '',
      sideOrgFilterValue: sideOrgFilter?.value || ''
    };
    personalMode = true;
    saveMainEventsSnapshot();
    showPersonalCalendarHost();
    initPersonalCalendar();
    installPersonalCalendarCreateHandlers();
    document.body.classList.add('personal-calendar-perspective');
    ensurePersonalViewOptions();
    syncHeaderSearchMode();
    setDashboardTitle('My Own Calendar');
    if (view) view.value = 'dayGridMonth';
    if (headerOrgFilter) headerOrgFilter.value = 'all';
    if (sideOrgFilter) sideOrgFilter.value = 'all';
    dashboardCalendar()?.changeView?.('dayGridMonth');
    if (create) create.textContent = 'Create Personal Schedule';
    if (menu) {
      menu.setAttribute('aria-label', 'Back to main dashboard calendar');
      menu.setAttribute('title', 'Back to main dashboard calendar');
    }
    window.CSC_SAVE_DASHBOARD_RELOAD_STATE?.();
    schedulePersonalCalendarHeightSync();
    schedulePersonalCalendarHeightSync(120);
  }

  function applyPendingPersonalReloadRestore() {
    const pending = window.CSC_PENDING_PERSONAL_CALENDAR_RESTORE;
    if (!pending) return;
    const calendar = dashboardCalendar();
    const viewSelector = document.getElementById('viewSelector');
    const date = new Date(pending.calendarDate || '');
    if (Number.isFinite(date.getTime())) calendar?.gotoDate?.(date);
    if (pending.view && viewSelector?.querySelector?.(`option[value="${String(pending.view).replace(/"/g, '\\"')}"]`)) {
      viewSelector.value = pending.view;
      calendar?.changeView?.(pending.view);
    }
    window.CSC_PENDING_PERSONAL_CALENDAR_RESTORE = null;
    window.CSC_SAVE_DASHBOARD_RELOAD_STATE?.();
  }

  function openPersonalCalendar() {
    enterPersonalPerspective();
    window.CSC_CLOSE_SIDEBAR?.();
    render();
    applyPendingPersonalReloadRestore();
    schedulePersonalCalendarHeightSync();
    const hasFreshEvents = eventsLoadedQuery === activeQuery && Date.now() - eventsLoadedAt < PERSONAL_EVENTS_CACHE_TTL;
    loadEvents(activeQuery, { force: !hasFreshEvents }).then(() => {
      render();
      applyPendingPersonalReloadRestore();
      schedulePersonalCalendarHeightSync();
      schedulePersonalCalendarHeightSync(120);
    }).catch((error) => renderMessage(error.message));
  }

  function closePersonalCalendar() {
    const hasPersonalUi = document.body.classList.contains('personal-calendar-perspective') || document.body.classList.contains('personal-search-expanded');
    const hasSavedState = Boolean(savedDashboardUi || savedCalendarCreateHandlers || savedMainEvents || savedMainCategories);
    if (!personalMode && !hasPersonalUi && !hasSavedState) return;
    const menu = document.getElementById('mobileMenuButton');
    const view = document.getElementById('viewSelector');
    const create = document.getElementById('createEventButton');
    const headerOrgFilter = document.getElementById('headerOrganizationFilter');
    const sideOrgFilter = document.getElementById('filterOrganization');
    document.body.classList.remove('personal-calendar-perspective', 'personal-search-expanded');
    personalMode = false;
    hidePersonalCalendarHost();
    if (menu) {
      menu.innerHTML = savedDashboardUi?.menuHtml || '<span></span><span></span><span></span>';
      if (savedDashboardUi?.menuLabel) menu.setAttribute('aria-label', savedDashboardUi.menuLabel);
      else menu.removeAttribute('aria-label');
      if (savedDashboardUi?.menuTitle) menu.setAttribute('title', savedDashboardUi.menuTitle);
      else menu.removeAttribute('title');
    }
    if (view && savedDashboardUi?.viewOptionsHtml) view.innerHTML = savedDashboardUi.viewOptionsHtml;
    if (view && savedDashboardUi?.viewValue) view.value = savedDashboardUi.viewValue;
    if (create && savedDashboardUi?.createText) create.textContent = savedDashboardUi.createText;
    if (savedDashboardUi?.titleText) setDashboardTitle(savedDashboardUi.titleText);
    if (headerOrgFilter && savedDashboardUi && 'headerOrgFilterValue' in savedDashboardUi) headerOrgFilter.value = savedDashboardUi.headerOrgFilterValue;
    if (sideOrgFilter && savedDashboardUi && 'sideOrgFilterValue' in savedDashboardUi) sideOrgFilter.value = savedDashboardUi.sideOrgFilterValue;
    closePersonalForm();
    document.getElementById('calendar')?.style.removeProperty('--personal-calendar-height');
    restoreCalendarCreateHandlers();
    restoreMainEvents();
    const restoredView = savedDashboardUi?.viewValue === 'multiMonthYear' ? 'multiMonthYear' : 'dayGridMonth';
    mainDashboardCalendar()?.changeView?.(restoredView);
    mainDashboardCalendar()?.refetchEvents?.();
    mainDashboardCalendar()?.updateSize?.();
    savedDashboardUi = null;
    window.CSC_SAVE_DASHBOARD_RELOAD_STATE?.();
    reloadMainDashboardCalendarItems();
  }

  function clearSavedPersonalCalendarState() {
    window.CSC_PENDING_PERSONAL_CALENDAR_RESTORE = null;
    try {
      for (let index = localStorage.length - 1; index >= 0; index -= 1) {
        const key = localStorage.key(index);
        if (key && key.startsWith('csc_sync_dashboard_reload_state_')) localStorage.removeItem(key);
      }
    } catch {}
  }

  function redirectToMainDashboard() {
    clearSavedPersonalCalendarState();
    const target = new URL('org-dashboard.html', window.location.href);
    target.searchParams.set('dashboard', 'main');
    target.searchParams.set('t', String(Date.now()));
    window.location.replace(target.href);
  }

  function openPersonalForm(item = null, date = '') {
    openNativeScheduleModal(item, date);
  }

  function closePersonalForm() {
    const modal = document.getElementById('eventModal');
    if (modal?.open && document.getElementById('eventForm')?.dataset.personalSchedule === '1') {
      modal.close();
    }
    setPersonalFormMode(false);
  }

  function eventPayload() {
    const startDate = document.getElementById('eventDate').value;
    const endDate = document.getElementById('eventEndDate').value || startDate;
    const startTime = document.getElementById('eventStart').value;
    const endTime = document.getElementById('eventEnd').value;
    const recurrenceType = document.getElementById('eventRecurrenceType')?.value || 'none';
    const recurrenceUntil = document.getElementById('eventRecurrenceUntil')?.value || defaultRecurrenceUntil(startDate, recurrenceType);
    const occurrences = buildOccurrences({ startDate, startTime, endDate, endTime, recurrenceType, recurrenceUntil });
    if (!occurrences.length) throw new Error('Choose a valid date and time.');
    const current = user();
    const privacyValue = document.getElementById('eventPrivacy')?.value || 'basic';
    const isSharedPrivacy = privacyValue === 'basic' || privacyValue === 'public';
    const visibility = isSharedPrivacy ? 'public' : 'private';
    return {
      id: document.getElementById('eventId').value || createId(),
      record_type: PERSONAL_RECORD_TYPE,
      created_by: currentUserId(),
      personal_owner_name: ownerName(),
      personal_owner_email: current.email || session()?.user?.email || '',
      personal_owner_role: current.role || '',
      personal_owner_account_type: current.account_type || current.accountType || '',
      organization_name: current.organization_name || current.organizationName || current.org_name || ownerName(),
      title: document.getElementById('eventTitle').value.trim(),
      category_id: document.getElementById('eventCategory')?.value || 'others',
      venue: document.getElementById('eventVenue')?.value?.trim() || '',
      personal_notes: null,
      visibility,
      privacy_level: isSharedPrivacy ? 'basic' : 'internal',
      recurrence_type: recurrenceType,
      recurrence_until: recurrenceUntil || null,
      occurrences,
      schedule_type: occurrences.length > 1 ? 'multi_day' : 'single_day',
      approval_status: 'approved',
      event_status: 'planned',
      start_time: occurrences[0].start_time,
      end_time: occurrences[occurrences.length - 1].end_time,
      updated_at: new Date().toISOString()
    };
  }

  function validatePersonalFormRequirements(payload = null) {
    const required = [
      ['Event title', document.getElementById('eventTitle')?.value],
      ['Venue', document.getElementById('eventVenue')?.value],
      ['Date', document.getElementById('eventDate')?.value],
      ['Start time', document.getElementById('eventStart')?.value],
      ['End time', document.getElementById('eventEnd')?.value],
      ['Repeat', document.getElementById('eventRecurrenceType')?.value],
      ['Privacy level', document.getElementById('eventPrivacy')?.value]
    ];
    const missing = required.filter(([, value]) => !String(value || '').trim()).map(([label]) => label);
    if (missing.length) throw new Error(`${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} required.`);
    const firstOccurrence = payload?.occurrences?.[0];
    if (firstOccurrence && new Date(firstOccurrence.end_time) <= new Date(firstOccurrence.start_time)) {
      throw new Error('End time must be after start time.');
    }
  }

  function personalRowQuery(id) {
    return `id=eq.${encodeURIComponent(id)}&record_type=eq.${PERSONAL_RECORD_TYPE}&created_by=eq.${encodeURIComponent(currentUserId())}`;
  }

  async function persistPersonalEvent(payload, editing) {
    if (editing) {
      const rows = await rest(`/rest/v1/${TABLE}?${personalRowQuery(payload.id)}`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      }, 'return=representation');
      if (!Array.isArray(rows) || !rows.length) throw new Error('Personal schedule was not updated in the database.');
      return rows[0];
    }
    const rows = await rest(`/rest/v1/${TABLE}`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }, 'return=representation');
    if (!Array.isArray(rows) || !rows.length) throw new Error('Personal schedule was not created in the database.');
    return rows[0];
  }

  async function savePersonalEvent(event) {
    if (event.target?.id !== 'eventForm' || !personalMode) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    try {
      const editing = Boolean(document.getElementById('eventId')?.value);
      validatePersonalFormRequirements();
      const payload = eventPayload();
      validatePersonalFormRequirements(payload);
      await persistPersonalEvent(payload, editing);
      document.getElementById('eventForm').reset();
      closePersonalForm();
      await loadEvents(activeQuery, { force: true });
      render();
    } catch (error) {
      alert(error.message || 'Personal schedule could not be saved.');
    }
  }

  async function loadEvents(query = '', options = {}) {
    const uid = currentUserId();
    if (!uid) throw new Error('Log in to use your personal calendar.');
    const normalizedQuery = String(query || '');
    if (!options.force && eventsLoadedQuery === normalizedQuery && Date.now() - eventsLoadedAt < PERSONAL_EVENTS_CACHE_TTL) {
      return events;
    }
    if (eventsLoadPromise && !options.force && eventsLoadedQuery === normalizedQuery) return eventsLoadPromise;
    eventsLoadPromise = resolvePersonalSearchProfiles(normalizedQuery).then((profileMatches) => loadPersonalRows(uid, profileMatches, normalizedQuery).then((rows) => {
      rememberPersonalRows(rows);
      events = filterPersonalRows(cachedPersonalRows, normalizedQuery, profileMatches);
      filteredEvents = events;
      eventsLoadedQuery = normalizedQuery;
      eventsLoadedAt = Date.now();
      return events;
    })).finally(() => {
      eventsLoadPromise = null;
    });
    return eventsLoadPromise;
  }

  function rememberPersonalRows(rows = []) {
    const byId = new Map(cachedPersonalRows.map((row) => [`${row.record_type || ''}:${row.id || ''}`, row]));
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      if (row?.id) byId.set(`${row.record_type || ''}:${row.id}`, row);
    });
    cachedPersonalRows = [...byId.values()].sort((a, b) => new Date(a.start_time || 0) - new Date(b.start_time || 0));
  }

  function filterPersonalRows(rows = cachedPersonalRows, query = activeQuery, profileMatches = { ids: new Set(), rows: [] }) {
    const uid = currentUserId();
    const term = normalizedSearchTerm(query);
    return (Array.isArray(rows) ? rows : []).filter((item) => {
      if (item.record_type !== PERSONAL_RECORD_TYPE && item.personal_record_type !== PERSONAL_RECORD_TYPE) return false;
      const own = String(item.created_by || '') === String(uid);
      const matches = !term || profileMatches.ids?.has?.(String(item.created_by || '')) || personalScheduleMatchesProfile(item, profileMatches) || personalScheduleMatches(item, term);
      return (!term && own) || (Boolean(term) && personalScheduleVisibleToViewer(item, profileMatches) && matches);
    });
  }

  async function loadPersonalRows(uid, profileMatches = { ids: new Set(), rows: [] }, query = '') {
    const base = `record_type=eq.${PERSONAL_RECORD_TYPE}&select=*&order=start_time.asc`;
    const profileIds = profileMatches?.ids instanceof Set ? profileMatches.ids : new Set();
    const profileRows = Array.isArray(profileMatches?.rows) ? profileMatches.rows : [];
    const term = normalizedSearchTerm(query);
    const encodedTerm = encodeURIComponent(term);
    const directSearchFields = ['title', 'personal_owner_name', 'personal_owner_email', 'organization_name', 'venue'];
    const directSearchQuery = term
      ? [`${base}&or=(${directSearchFields.map((field) => `${field}.ilike.*${encodedTerm}*`).join(',')})`]
      : [];
    const profileValueQueries = profileRows.flatMap((profile) => {
      const values = [
        profile.email,
        profile.full_name,
        profile.username,
        profile.organization_name,
        profile.organizationName,
        profile.contact_number,
        profile.phone_number
      ].map((value) => String(value || '').trim()).filter(Boolean).slice(0, 6);
      return values.flatMap((value) => {
        const encoded = encodeURIComponent(value);
        return [
          `${base}&personal_owner_email=eq.${encoded}`,
          `${base}&personal_owner_name=ilike.*${encoded}*`,
          `${base}&organization_name=ilike.*${encoded}*`
        ];
      });
    });
    const queries = [
      `${base}&created_by=eq.${encodeURIComponent(uid)}`,
      `${base}&visibility=eq.public`,
      ...(currentUserIsAdmin() ? [
        `${base}&visibility=eq.private`,
        `${base}&visibility=eq.internal`,
        `${base}&privacy_level=eq.internal`
      ] : []),
      `${base}&privacy_level=eq.basic`,
      `${base}&privacy_level=eq.public`,
      ...[...profileIds].filter(Boolean).slice(0, 25).map((id) => `${base}&created_by=eq.${encodeURIComponent(id)}`),
      ...directSearchQuery,
      ...profileValueQueries
    ];
    const results = await Promise.all(
      queries.map((query) => rest(`/rest/v1/${TABLE}?${query}`, {}, 'return=minimal').catch(() => []))
    );
    const byId = new Map();
    results.flat().forEach((row) => {
      if (row?.id) byId.set(`${row.record_type || ''}:${row.id}`, row);
    });
    return [...byId.values()].sort((a, b) => new Date(a.start_time || 0) - new Date(b.start_time || 0));
  }

  function isPublicPersonalSchedule(item = {}) {
    const visibility = String(item.visibility || '').trim().toLowerCase();
    const privacy = String(item.privacy_level || '').trim().toLowerCase();
    if (visibility === 'private' || visibility === 'internal') return false;
    return visibility === 'public' || privacy === 'basic' || privacy === 'public';
  }

  function normalizedAccountType(value = '') {
    return String(value || '').trim().toLowerCase();
  }

  function profileIsAdminAccount(profile = {}) {
    const role = normalizedAccountType(profile.role);
    const type = normalizedAccountType(profile.account_type || profile.accountType);
    return role === 'super_admin' || type === 'csc' || type === 'oic';
  }

  function currentUserIsAdmin() {
    return profileIsAdminAccount(user());
  }

  function ownerProfileForRecord(item = {}, profileMatches = {}) {
    const store = window.CONNECT_STATE?.store || window.CONNECT_BOOTSTRAP_STORE || {};
    const profiles = [
      ...(store.users || []),
      ...(Array.isArray(profileMatches?.rows) ? profileMatches.rows : [])
    ];
    const ownerId = String(item.created_by || '');
    const ownerEmail = String(item.personal_owner_email || item.owner_email || item.creator_email || '').toLowerCase();
    return profiles.find((profile) => ownerId && String(profile.id || '') === ownerId)
      || profiles.find((profile) => ownerEmail && String(profile.email || profile.aup_email || '').toLowerCase() === ownerEmail)
      || {};
  }

  function isAdminOwnedPersonalSchedule(item = {}, profileMatches = {}) {
    if (profileIsAdminAccount({
      role: item.personal_owner_role || item.owner_role || item.created_by_role,
      account_type: item.personal_owner_account_type || item.owner_account_type
    })) return true;
    return profileIsAdminAccount(ownerProfileForRecord(item, profileMatches));
  }

  function personalScheduleVisibleToViewer(item = {}, profileMatches = {}) {
    if (isPublicPersonalSchedule(item)) return true;
    return currentUserIsAdmin();
  }

  function personalScheduleTitle(item = {}) {
    return [
      item.title,
      item.event_title,
      item.name,
      item.summary,
      item.subject,
      item.public_description,
      item.purpose
    ].map((value) => String(value || '').trim()).find(Boolean) || 'Personal schedule';
  }

  function personalScheduleMatches(item = {}, term = '') {
    if (!term) return true;
    return personalScheduleSearchValues(item).some((value) => normalizedSearchTerm(value).includes(term));
  }

  function personalScheduleMatchesProfile(item = {}, profileMatches = {}) {
    const profiles = Array.isArray(profileMatches?.rows) ? profileMatches.rows : [];
    if (!profiles.length) return false;
    const itemValues = personalScheduleSearchValues(item).map(normalizedSearchTerm).filter(Boolean);
    return profiles.some((profile) => profileSearchValues(profile).map(normalizedSearchTerm).filter(Boolean).some((profileValue) => {
      return itemValues.some((itemValue) => itemValue === profileValue || itemValue.includes(profileValue) || profileValue.includes(itemValue));
    }));
  }

  async function resolvePersonalSearchProfiles(query = '') {
    const term = normalizedSearchTerm(query);
    const local = matchingLocalProfiles(term);
    if (!term) return { rows: local, ids: new Set(local.map((item) => String(item.id || '')).filter(Boolean)) };
    const remote = await matchingRemoteProfiles(term).catch(() => []);
    const byId = new Map();
    [...local, ...remote].forEach((profile) => {
      if (profile?.id) byId.set(String(profile.id), profile);
    });
    return { rows: [...byId.values()], ids: new Set(byId.keys()) };
  }

  function matchingLocalProfiles(term = '') {
    const store = window.CONNECT_STATE?.store || window.CONNECT_BOOTSTRAP_STORE || {};
    if (!term) return [];
    return (store.users || []).filter((profile) => profileSearchValues(profile).some((value) => normalizedSearchTerm(value).includes(term)));
  }

  async function matchingRemoteProfiles(term = '') {
    if (!term) return [];
    const encoded = encodeURIComponent(term);
    const attempts = [
      {
        select: 'id,email,full_name,username,account_type,role,organization_name,contact_number,phone_number,mobile_number,contact,phone',
        fields: ['full_name', 'username', 'email', 'organization_name', 'contact_number', 'phone_number', 'mobile_number', 'contact', 'phone']
      },
      {
        select: 'id,email,full_name,username,account_type,role,organization_name,contact_number,phone_number',
        fields: ['full_name', 'username', 'email', 'organization_name', 'contact_number', 'phone_number']
      },
      {
        select: 'id,email,full_name,username,account_type,role,organization_name',
        fields: ['full_name', 'username', 'email', 'organization_name']
      }
    ];
    for (const attempt of attempts) {
      const orFilter = attempt.fields.map((field) => `${field}.ilike.*${encoded}*`).join(',');
      const rows = await rest(`/rest/v1/profiles?select=${attempt.select}&or=(${orFilter})&limit=50`, {}, 'return=minimal').catch(() => null);
      if (Array.isArray(rows)) return rows;
    }
    return [];
  }

  function normalizedSearchTerm(value = '') {
    return String(value || '').toLowerCase().replace(/[^a-z0-9@.]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function personalScheduleSearchValues(item = {}) {
    return [
      item.id,
      item.created_by,
      item.title,
      item.event_title,
      item.name,
      item.summary,
      item.subject,
      item.venue,
      item.category_name,
      item.category_id,
      item.public_description,
      item.purpose,
      item.personal_notes,
      item.personal_owner_name,
      item.personal_owner_email,
      item.personal_owner_phone,
      item.personal_owner_contact,
      item.personal_owner_role,
      item.personal_owner_account_type,
      item.organization_name,
      item.created_by_email,
      item.creator_email,
      item.owner_email,
      item.schedule_org_name,
      item.contact_person,
      item.contact_info,
      ...ownerProfileValues(item.created_by)
    ];
  }

  function ownerProfileValues(id) {
    const store = window.CONNECT_STATE?.store || window.CONNECT_BOOTSTRAP_STORE || {};
    const found = (store.users || []).find((item) => item.id === id) || {};
    return profileSearchValues(found);
  }

  function profileSearchValues(found = {}) {
    return [
      found.id,
      found.full_name,
      found.username,
      found.email,
      found.aup_email,
      found.account_type,
      found.role,
      found.organization_name,
      found.organizationName,
      found.contact_number,
      found.phone_number,
      found.mobile_number,
      found.contact,
      found.phone,
      found.telephone,
      found.student_number,
      found.school_id,
      found.id_number,
      found.raw_user_meta_data?.phone_number,
      found.raw_user_meta_data?.contact_number,
      found.raw_user_meta_data?.student_number,
      found.raw_user_meta_data?.school_id
    ];
  }

  function ownerNameForId(id) {
    return ownerProfileValues(id).map((value) => String(value || '').trim()).find(Boolean) || 'Calendar User';
  }

  function ownerPhoneForRecord(record = {}) {
    const direct = String(record.contact_info || '').replace(/\D/g, '');
    if (direct && !/^0+$/.test(direct)) return direct;
    const store = window.CONNECT_STATE?.store || window.CONNECT_BOOTSTRAP_STORE || {};
    const owner = (store.users || []).find((item) => item.id === record.created_by)
      || (store.users || []).find((item) => String(item.email || '').toLowerCase() === String(record.personal_owner_email || '').toLowerCase())
      || {};
    return String(owner.contact_number || owner.phone_number || owner.mobile_number || owner.phone || user().contact_number || user().phone_number || '').replace(/\D/g, '');
  }

  function formatRange(item) {
    const start = new Date(item.start_time);
    const end = new Date(item.end_time);
    return `${start.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} - ${end.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`;
  }

  function renderMessage(message) {
    const list = document.getElementById('personalCalendarResults');
    if (list) {
      list.hidden = false;
      list.innerHTML = `<article class="personal-calendar-card"><p>${escapeHtml(message)}</p></article>`;
    }
  }

  function render() {
    renderPersonalCalendar();
    const list = document.getElementById('personalCalendarResults');
    if (!list) return;
    list.hidden = Boolean(window.FullCalendar);
    const visibleItems = visibleCalendarItems();
    if (!visibleItems.length) {
      renderMessage('No personal schedules found.');
      return;
    }
    const uid = currentUserId();
    list.innerHTML = visibleItems.map((item) => `
      <article class="personal-calendar-card">
        <strong>${escapeHtml(personalScheduleTitle(item))}</strong>
        <p>${escapeHtml(formatRange(item))}</p>
        <p>${escapeHtml(item.personal_owner_name || item.organization_name || ownerNameForId(item.created_by))} - ${escapeHtml(visibilityText(item))} - ${escapeHtml(recurrenceLabel(item.recurrence_type))}</p>
        ${item.personal_notes ? `<p>${escapeHtml(item.personal_notes)}</p>` : ''}
        ${isPersonalScheduleItem(item) && item.created_by === uid ? `<div class="inline-actions"><button class="secondary-button" type="button" data-personal-edit="${escapeHtml(item.id)}">Edit</button><button class="danger-button" type="button" data-personal-delete="${escapeHtml(item.id)}">Delete</button></div>` : ''}
      </article>
    `).join('');
  }

  function calendarEvents() {
    const uid = currentUserId();
    return visibleCalendarItems().flatMap((item) => {
      const record = personalScheduleRecord(item);
      const occurrences = Array.isArray(record.occurrences) && record.occurrences.length
        ? record.occurrences
        : [{ id: record.id, date: String(record.start_time || '').slice(0, 10), start_time: record.start_time, end_time: record.end_time }];
      return occurrences.map((occurrence, index) => ({
        id: `${record.id}::${occurrence.id || index}`,
        groupId: record.id,
        title: personalScheduleTitle(record),
        start: occurrence.start_time,
        end: occurrence.end_time,
        display: 'block',
        editable: item.created_by === uid,
        startEditable: item.created_by === uid,
        durationEditable: item.created_by === uid,
        backgroundColor: item.created_by === uid ? '#2563eb' : '#0f766e',
        borderColor: item.created_by === uid ? '#1d4ed8' : '#0f766e',
        classNames: ['event-month-occurrence', 'gcal-month-event'],
        extendedProps: {
          type: 'personal_schedule',
          personalSchedule: true,
          item,
          record,
          occurrence,
          occurrences
        }
      }));
    });
  }

  function isPersonalScheduleItem(item = {}) {
    return item.record_type === PERSONAL_RECORD_TYPE || item.personal_record_type === PERSONAL_RECORD_TYPE;
  }

  function visibilityText(item = {}) {
    return isPublicPersonalSchedule(item) ? 'public' : 'private';
  }

  function visibleCalendarItems() {
    return filteredEvents;
  }

  function personalScheduleRecord(item) {
    const fallbackStart = item.start_time || item.occurrences?.[0]?.start_time || new Date().toISOString();
    const fallbackEnd = item.end_time || item.occurrences?.[0]?.end_time || fallbackStart;
    const contactInfo = ownerPhoneForRecord(item) || item.contact_info || '00000000000';
    return {
      ...item,
      record_type: 'schedule',
      personal_record_type: PERSONAL_RECORD_TYPE,
      approval_status: 'approved',
      category_id: item.category_id || 'others',
      contact_info: contactInfo,
      contact_person: item.contact_person || item.personal_owner_name || ownerNameForId(item.created_by),
      created_by: item.created_by || currentUserId(),
      created_by_role: 'admin',
      expected_attendees: Number(item.expected_attendees || 1),
      organization_id: item.organization_id || item.created_by || currentUserId() || 'personal',
      organization_name: item.organization_name || item.personal_owner_name || ownerNameForId(item.created_by),
      privacy_level: item.visibility === 'public' || item.privacy_level === 'basic' ? 'basic' : 'internal',
      public_description: item.public_description || item.personal_notes || personalScheduleTitle(item) || '',
      purpose: item.purpose || item.personal_notes || personalScheduleTitle(item) || '',
      schedule_schema_version: item.schedule_schema_version || 2,
      schedule_source: 'admin',
      schedule_type: item.schedule_type || 'single_day',
      requires_approval: false,
      start_time: fallbackStart,
      end_time: fallbackEnd,
      title: personalScheduleTitle(item),
      venue: item.venue || 'Personal',
      occurrences: Array.isArray(item.occurrences) && item.occurrences.length
        ? item.occurrences
        : [{ id: item.id, date: String(fallbackStart).slice(0, 10), start_time: fallbackStart, end_time: fallbackEnd }]
    };
  }

  function renderPersonalCalendar() {
    const calendar = dashboardCalendar();
    if (!calendar) return;
    ensureClassCategory();
    if (calendar.setOption) {
      calendar.setOption('eventContent', renderPersonalCalendarEventContent);
      replacePersonalCalendarEventSource(calendar);
    } else {
      replacePersonalCalendarEventSource(calendar);
    }
    schedulePersonalCalendarHeightSync();
  }

  function replacePersonalCalendarEventSource(calendar) {
    const nextEvents = calendarEvents();
    const apply = () => {
      try { calendar.getEventSources?.().forEach((source) => source?.remove?.()); } catch {}
      calendar.removeAllEvents?.();
      calendar.addEventSource?.(nextEvents);
      calendar.rerenderEvents?.();
      calendar.updateSize?.();
    };
    if (typeof calendar.batchRendering === 'function') calendar.batchRendering(apply);
    else apply();
  }

  function changePersonalView() {
    const value = document.getElementById('viewSelector')?.value || 'dayGridMonth';
    const view = value === 'today' ? 'dayGridMonth' : value;
    const calendar = dashboardCalendar();
    installPersonalCalendarCreateHandlers();
    if (calendar?.view?.type === view && value !== 'today') return;
    calendar?.changeView?.(view);
    if (value === 'today') calendar?.today?.();
    installPersonalCalendarCreateHandlers();
    requestAnimationFrame(() => {
      schedulePersonalCalendarHeightSync();
      if (window.innerWidth <= 640) schedulePersonalCalendarHeightSync(90);
      window.CSC_SAVE_DASHBOARD_RELOAD_STATE?.();
    });
  }

  function localDateInput(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return String(value || '').slice(0, 10);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

  function localTimeInput(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return String(value || '').slice(11, 16);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(11, 16);
  }

  function datePlusMinutes(date, minutes) {
    return new Date(date.getTime() + minutes * 60000);
  }

  function suppressPersonalCalendarOpen(duration = 900) {
    suppressPersonalCalendarOpenUntil = Date.now() + duration;
  }

  function personalCalendarOpenSuppressed() {
    return Date.now() < suppressPersonalCalendarOpenUntil;
  }

  function localIso(date, time) {
    return date && time ? `${date}T${time.length === 5 ? `${time}:00` : time}` : '';
  }

  function addDays(date, days) {
    const value = new Date(date);
    value.setDate(value.getDate() + days);
    return value;
  }

  function dateRange(start, end) {
    const dates = [];
    for (let day = new Date(`${start}T12:00:00`); localDateInput(day) <= end; day = addDays(day, 1)) {
      dates.push(localDateInput(day));
    }
    return dates;
  }

  function occurrenceRange(dates, start, end) {
    return dates.map((date) => ({ id: createId(), date, start_time: localIso(date, start), end_time: localIso(date, end) }));
  }

  function personalMonthOccurrenceRange(startDate, endDate = startDate) {
    return { occurrences: occurrenceRange(dateRange(startDate, endDate), '09:00', '10:00') };
  }

  function personalRangeFromSelection(info = {}) {
    const view = dashboardCalendar()?.view?.type || '';
    if (view === 'dayGridMonth') {
      const startDate = localDateInput(info.start || info.startStr);
      const endDate = localDateInput(datePlusMinutes(info.end || info.endStr || info.start || new Date(), -0.001));
      return personalMonthOccurrenceRange(startDate, endDate || startDate);
    }
    const start = info.start instanceof Date ? info.start : new Date(info.startStr || info.dateStr || Date.now());
    let end = info.end instanceof Date ? info.end : new Date(info.endStr || '');
    if (Number.isNaN(start.getTime())) return String(info?.startStr || info?.dateStr || '').slice(0, 10);
    if (Number.isNaN(end.getTime()) || end <= start) end = datePlusMinutes(start, 60);
    return {
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      schedule_type: localDateInput(start) === localDateInput(end) ? 'single_day' : 'multi_day'
    };
  }

  function canMovePersonalCalendarEvent(calendarEvent) {
    const item = calendarEvent?.extendedProps?.item || {};
    return Boolean(item.id && item.created_by === currentUserId());
  }

  function personalEventProps(info = {}) {
    const props = info.event?.extendedProps || {};
    const recordId = props.record?.id || props.item?.id || String(info.event?.id || '').split('::')[0];
    const item = props.item || events.find((event) => event.id === recordId) || props.record || null;
    const occurrence = props.occurrence || item?.occurrences?.find((row) => `${item.id}::${row.id}` === info.event?.id) || item?.occurrences?.[0] || null;
    return { props, item, occurrence };
  }

  async function persistPersonalCalendarMove(info) {
    suppressPersonalCalendarOpen();
    const { item, occurrence } = personalEventProps(info);
    if (!item?.id || item.created_by !== currentUserId() || !info.event?.start) {
      info.revert?.();
      return;
    }
    const start = info.event.start;
    const originalDuration = occurrence?.end_time && occurrence?.start_time
      ? new Date(occurrence.end_time) - new Date(occurrence.start_time)
      : 60 * 60000;
    const durationMinutes = Number.isFinite(originalDuration) ? Math.max(30, Math.round(originalDuration / 60000)) : 60;
    const fallbackEnd = datePlusMinutes(start, durationMinutes);
    const end = info.event.end || fallbackEnd;
    if (!(end > start)) {
      info.revert?.();
      alert('Personal schedule end time must be after the start time.');
      return;
    }
    const currentOccurrences = Array.isArray(item.occurrences) && item.occurrences.length
      ? item.occurrences
      : [{ id: item.id, date: localDateInput(item.start_time), start_time: item.start_time, end_time: item.end_time }];
    const movedId = occurrence?.id || currentOccurrences[0]?.id || createId();
    const movedOccurrence = {
      ...(currentOccurrences.find((row) => row.id === movedId) || {}),
      id: movedId,
      date: localDateInput(start),
      start_time: start.toISOString(),
      end_time: end.toISOString()
    };
    const nextOccurrences = currentOccurrences.some((row) => row.id === movedId)
      ? currentOccurrences.map((row) => row.id === movedId ? movedOccurrence : row)
      : [movedOccurrence];
    nextOccurrences.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
    const first = nextOccurrences[0];
    const last = nextOccurrences[nextOccurrences.length - 1];
    const spansMultipleDays = nextOccurrences.length > 1 || localDateInput(first.start_time) !== localDateInput(last.end_time);
    const payload = {
      ...item,
      occurrences: nextOccurrences,
      start_time: first.start_time,
      end_time: last.end_time,
      schedule_type: spansMultipleDays ? 'multi_day' : 'single_day',
      updated_at: new Date().toISOString()
    };
    try {
      await persistPersonalEvent(payload, true);
      await loadEvents(activeQuery, { force: true });
      render();
    } catch (error) {
      info.revert?.();
      alert(error.message || 'Personal schedule could not be moved.');
    }
  }

  function openPersonalEventDetails(info) {
    if (personalCalendarOpenSuppressed()) return;
    info.jsEvent?.preventDefault?.();
    info.jsEvent?.stopPropagation?.();
    const { item, occurrence } = personalEventProps(info);
    if (!item) return;
    const record = personalScheduleRecord(item);
    const displayedOccurrence = occurrence || record.occurrences?.[0] || { start_time: record.start_time, end_time: record.end_time };
    activePersonalDetailRecord = record;
    activePersonalDetailId = record.created_by === currentUserId() ? record.id : '';
    const modal = document.getElementById('detailsModal');
    const title = document.getElementById('detailsTitle');
    const meta = document.getElementById('detailsMeta');
    const list = document.getElementById('detailsList');
    const owner = record.created_by === currentUserId();
    if (modal) modal.dataset.personalScheduleDetails = owner ? 'owned' : 'readonly';
    if (title) title.textContent = record.title || 'Personal Schedule';
    if (meta) meta.textContent = `${record.venue || 'Personal'} - ${recurrenceLabel(record.recurrence_type)}`;
    if (list) {
      const rows = {
        'Event Title': record.title || 'Personal Schedule',
        Venue: record.venue || 'Personal',
        Date: localDateInput(displayedOccurrence.start_time || record.start_time),
        'Start Time': localTimeInput(displayedOccurrence.start_time || record.start_time),
        'End Time': localTimeInput(displayedOccurrence.end_time || record.end_time),
        Repeat: recurrenceLabel(record.recurrence_type),
        'Privacy Level': record.privacy_level === 'basic' ? 'Public' : 'Private'
      };
      list.innerHTML = Object.entries(rows)
        .filter(([, value]) => value)
        .map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`)
        .join('');
    }
    cleanPersonalDetailsList(record);
    ensurePersonalDetailsActions(owner);
    showDetailAction(document.getElementById('detailsDeleteButton'), 'Delete', false);
    showDetailAction(document.getElementById('detailsEditButton'), 'Edit', false);
    showDetailAction(document.getElementById('detailsCancelButton'), '', false);
    showDetailAction(document.getElementById('detailsRejectButton'), '', false);
    showDetailAction(document.getElementById('detailsApproveButton'), '', false);
    if (modal) {
      if (typeof modal.showModal === 'function') modal.showModal();
      else modal.setAttribute('open', '');
    }
    window.__calendarGoogleStyleLastOpenedRecord = record;
    document.dispatchEvent(new CustomEvent('calendar-google-style-event-opened', {
      detail: { eventId: record.id || '', record }
    }));
  }

  function movePersonalPeriod(direction) {
    const calendar = dashboardCalendar();
    if (!calendar) return;
    if (direction === 'prev') calendar.prev();
    else calendar.next();
    schedulePersonalCalendarHeightSync();
    window.setTimeout(() => window.CSC_SAVE_DASHBOARD_RELOAD_STATE?.(), 0);
  }

  function searchPublic() {
    activeQuery = document.getElementById('personalCalendarHeaderSearch')?.value || '';
    const seq = ++searchRequestSeq;
    filteredEvents = filterPersonalRows(cachedPersonalRows, activeQuery);
    render();
    if (searchRefreshTimer) window.clearTimeout(searchRefreshTimer);
    searchRefreshTimer = window.setTimeout(async () => {
      await loadEvents(activeQuery, { force: true }).catch((error) => {
        console.warn('Personal calendar search failed:', error);
      });
      if (seq === searchRequestSeq) render();
    }, 80);
  }

  function setValue(id, value) {
    const element = document.getElementById(id);
    if (element) element.value = value == null ? '' : value;
  }

  function ensurePersonalCategoryOption() {
    ensureClassCategory();
  }

  function setPersonalFormMode(enabled) {
    const form = document.getElementById('eventForm');
    if (!form) return;
    const hiddenPersonalFields = [
      'eventEntryType',
      'eventScheduleType',
      'eventCategory',
      'eventEndDate',
      'eventAttendees',
      'eventContactPerson',
      'eventContactInfo',
      'eventPublicDescription',
      'eventPurpose',
      'eventRecurrenceUntil'
    ];
    const requiredPersonalFields = [
      'eventTitle',
      'eventVenue',
      'eventDate',
      'eventStart',
      'eventEnd',
      'eventRecurrenceType',
      'eventPrivacy'
    ];
    [...new Set([...hiddenPersonalFields, ...requiredPersonalFields])].forEach((id) => {
      const field = document.getElementById(id);
      if (!field) return;
      if (enabled) {
        if (!field.dataset.personalWasRequired) field.dataset.personalWasRequired = field.required ? '1' : '0';
        field.required = requiredPersonalFields.includes(id);
      } else if (field.dataset.personalWasRequired) {
        field.required = field.dataset.personalWasRequired === '1';
        delete field.dataset.personalWasRequired;
      }
    });
    form.dataset.personalSchedule = enabled ? '1' : '';
    if (enabled) {
      setValue('eventEntryType', 'schedule');
      setValue('eventScheduleType', 'single_day');
      if (!document.getElementById('eventCategory')?.value) setValue('eventCategory', 'class');
      if (!document.getElementById('eventAttendees')?.value) setValue('eventAttendees', 1);
      syncPersonalScheduleTypeFields();
    }
    if (!enabled) {
      const category = document.getElementById('eventCategory');
      const personalOption = category?.querySelector('option[data-personal-only="1"]');
      if (category?.value === 'class') category.value = category.querySelector('option:not([data-personal-only="1"])')?.value || '';
      personalOption?.remove();
    }
    if (!enabled) delete form.dataset.personalSchedule;
  }

  function syncPersonalScheduleTypeFields() {
    const form = document.getElementById('eventForm');
    if (form?.dataset.personalSchedule !== '1') return;
    const typeField = document.getElementById('eventScheduleType');
    const fields = document.getElementById('scheduleFields');
    const endDateLabel = document.getElementById('eventEndDateLabel');
    const endDate = document.getElementById('eventEndDate');
    const startDate = document.getElementById('eventDate')?.value || '';
    if (typeField) typeField.value = 'single_day';
    fields?.classList.remove('is-multi-day');
    if (endDateLabel) endDateLabel.hidden = true;
    if (endDate) {
      endDate.required = false;
      endDate.value = startDate;
    }
  }

  function openNativeScheduleModal(item = null, date = '') {
    const form = document.getElementById('eventForm');
    const modal = document.getElementById('eventModal');
    if (!form || !modal) return;
    const selectedRange = date && typeof date === 'object' ? date : null;
    const selectedDate = selectedRange ? '' : date;
    const selectedOccurrences = Array.isArray(selectedRange?.occurrences) && selectedRange.occurrences.length ? selectedRange.occurrences : [];
    const firstOccurrence = selectedOccurrences[0] || null;
    const lastOccurrence = selectedOccurrences[selectedOccurrences.length - 1] || firstOccurrence;
    form.reset();
    ensurePersonalCategoryOption();
    setPersonalFormMode(true);
    form.dataset.eventMode = item ? 'edit' : 'create';
    document.getElementById('eventModalTitle').textContent = item ? 'Edit Personal Schedule' : 'Create Personal Schedule';
    setValue('eventId', item?.id || '');
    setValue('eventTitle', item?.title || '');
    setValue('eventCategory', item?.category_id || 'class');
    setValue('eventVenue', item?.venue || '');
    const startValue = item?.start_time || selectedRange?.start_time || firstOccurrence?.start_time || selectedDate || '';
    const endValue = item?.end_time || selectedRange?.end_time || lastOccurrence?.end_time || selectedDate || '';
    setValue('eventScheduleType', 'single_day');
    setValue('eventDate', localDateInput(startValue));
    setValue('eventStart', localTimeInput(startValue));
    setValue('eventEndDate', localDateInput(endValue || startValue));
    setValue('eventEnd', localTimeInput(endValue));
    setValue('eventAttendees', item?.expected_attendees || 1);
    setValue('eventPrivacy', item?.visibility === 'public' || item?.privacy_level === 'basic' ? 'basic' : 'internal');
    setValue('eventContactPerson', item?.contact_person || ownerName());
    setValue('eventContactInfo', item?.contact_info || '');
    setValue('eventPublicDescription', item?.public_description || item?.personal_notes || '');
    setValue('eventPurpose', item?.purpose || item?.personal_notes || '');
    setValue('eventRecurrenceType', item?.recurrence_type || 'none');
    setValue('eventRecurrenceUntil', item?.recurrence_until || '');
    syncPersonalScheduleTypeFields();
    if (typeof modal.showModal === 'function') modal.showModal();
    else modal.setAttribute('open', '');
    window.setTimeout(() => window.CONNECT_STATE?.calendar?.updateSize?.(), 50);
  }

  function editEvent(id, fallback = null) {
    const item = events.find((event) => event.id === id) || (fallback?.id === id ? fallback : null);
    if (!item) {
      alert('Personal schedule could not be loaded for editing. Please refresh and try again.');
      return;
    }
    openPersonalForm(item);
  }

  function isPersonalRecord(record = {}) {
    return record.record_type === PERSONAL_RECORD_TYPE
      || record.personal_record_type === PERSONAL_RECORD_TYPE
      || record.schedule_source === 'personal';
  }

  function closeDetailsModal() {
    const modal = document.getElementById('detailsModal');
    if (!modal) return;
    if (typeof modal.close === 'function' && modal.open) modal.close();
    else modal.removeAttribute('open');
  }

  function showDetailAction(button, label, visible) {
    if (!button) return;
    const nextLabel = label || button.textContent;
    if (button.textContent !== nextLabel) button.textContent = nextLabel;
    if (button.hidden === visible) button.hidden = !visible;
    button.disabled = false;
    const display = visible ? '' : 'none';
    if (button.style.display !== display) button.style.display = display;
    const ariaHidden = String(!visible);
    if (button.getAttribute('aria-hidden') !== ariaHidden) button.setAttribute('aria-hidden', ariaHidden);
    button.classList.toggle('action-hidden', !visible);
  }

  function detailTermText(term) {
    return String(term?.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function removeDetailRows(labels) {
    const list = document.getElementById('detailsList');
    if (!list) return;
    [...list.querySelectorAll('dt')].forEach((term) => {
      const text = detailTermText(term);
      if (!labels.some((label) => text === label || text.includes(label))) return;
      const value = term.nextElementSibling;
      if (value?.tagName === 'DD') value.remove();
      term.remove();
    });
  }

  function setDetailRow(label, value) {
    const list = document.getElementById('detailsList');
    if (!list || !value) return;
    const terms = [...list.querySelectorAll('dt')];
    const found = terms.find((term) => detailTermText(term).includes(label.toLowerCase()));
    if (found) {
      const current = found.nextElementSibling;
      if (current?.tagName === 'DD' && current.textContent !== value) current.textContent = value;
      return;
    }
    const term = document.createElement('dt');
    const description = document.createElement('dd');
    term.textContent = label;
    description.textContent = value;
    list.append(term, description);
  }

  function cleanPersonalDetailsList(record) {
    const list = document.getElementById('detailsList');
    if (!list) return;
    const allowed = new Set(['event title', 'venue', 'date', 'start time', 'end time', 'repeat', 'privacy level']);
    [...list.querySelectorAll('dt')].forEach((term) => {
      if (allowed.has(detailTermText(term))) return;
      const value = term.nextElementSibling;
      if (value?.tagName === 'DD') value.remove();
      term.remove();
    });
  }

  function ensurePersonalDetailsActions(owner) {
    const modal = document.getElementById('detailsModal');
    const card = modal?.querySelector('.modal-card');
    let actions = card?.querySelector(':scope > .modal-actions') || modal?.querySelector('.modal-actions');
    if (!actions && card) {
      actions = document.createElement('div');
      actions.className = 'modal-actions';
      card.appendChild(actions);
    }
    if (!actions) return;
    actions.classList.add('personal-details-footer');
    let personalActions = document.getElementById('personalDetailsActions');
    if (!personalActions) {
      personalActions = document.createElement('div');
      personalActions.id = 'personalDetailsActions';
      personalActions.innerHTML = `
        <button type="button" class="danger-button" id="personalDetailsDeleteButton">Delete</button>
        <button type="button" class="primary-button" id="personalDetailsEditButton">Edit</button>
      `;
      actions.appendChild(personalActions);
    } else if (personalActions.parentElement !== actions) {
      actions.appendChild(personalActions);
    }
    personalActions.hidden = !owner;
  }

  function resetPersonalDetailsActions() {
    const personalActions = document.getElementById('personalDetailsActions');
    if (personalActions) personalActions.hidden = true;
    document.getElementById('detailsModal')?.querySelector('.modal-actions')?.classList.remove('personal-details-footer');
  }

  function applyPersonalDetailsActions(record) {
    if (!personalMode || !isPersonalRecord(record)) return;
    applyingPersonalDetails = true;
    try {
      activePersonalDetailRecord = record;
      const owner = record.created_by === currentUserId();
      activePersonalDetailId = owner ? record.id || '' : '';
      const modal = document.getElementById('detailsModal');
      if (modal) {
        const detailMode = owner ? 'owned' : 'readonly';
        if (modal.dataset.personalScheduleDetails !== detailMode) modal.dataset.personalScheduleDetails = detailMode;
      }
      cleanPersonalDetailsList(record);
      ensurePersonalDetailsActions(owner);
      showDetailAction(document.getElementById('detailsDeleteButton'), 'Delete', false);
      showDetailAction(document.getElementById('detailsEditButton'), 'Edit', false);
      showDetailAction(document.getElementById('detailsCancelButton'), '', false);
      showDetailAction(document.getElementById('detailsRejectButton'), '', false);
      showDetailAction(document.getElementById('detailsApproveButton'), '', false);
    } finally {
      applyingPersonalDetails = false;
    }
  }

  function schedulePersonalDetailsCleanup(record = activePersonalDetailRecord) {
    if (!record) return;
    clearTimeout(detailsCleanupTimer);
    detailsCleanupTimer = window.setTimeout(() => applyPersonalDetailsActions(record), 30);
  }

  function watchDetailsModal() {
    const modal = document.getElementById('detailsModal');
    if (!modal || detailsObserver) return;
    detailsObserver = new MutationObserver(() => {
      if (applyingPersonalDetails) return;
      if (modal.open && activePersonalDetailRecord) schedulePersonalDetailsCleanup();
    });
    detailsObserver.observe(modal, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'hidden', 'style', 'open']
    });
  }

  function calendarDateFromPointer(target, clientX) {
    if (!target || !Number.isFinite(clientX)) return '';
    const calendarEl = target.closest('#personalCalendarHost,#calendar');
    const columns = [...(calendarEl?.querySelectorAll('.fc-timegrid-col[data-date],.fc-col-header-cell[data-date]') || [])];
    const column = columns.find((item) => {
      const rect = item.getBoundingClientRect();
      return clientX >= rect.left && clientX <= rect.right;
    });
    const date = column?.getAttribute('data-date') || '';
    return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '';
  }

  function calendarDateFromTarget(target, clientX) {
    if (!target || target.closest('.fc-event,.fc-popover,.fc-more-link,button,a,input,select,textarea')) return '';
    const dated = target.closest('[data-date]');
    const date = dated?.getAttribute('data-date') || '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
    return calendarDateFromPointer(target, clientX);
  }

  function ensureOpenModalUsesPersonalForm() {
    if (!personalMode) return;
    const form = document.getElementById('eventForm');
    const modal = document.getElementById('eventModal');
    if (!form || !modal?.open || form.dataset.personalSchedule === '1') return;
    ensurePersonalCategoryOption();
    setPersonalFormMode(true);
    const title = document.getElementById('eventModalTitle');
    if (title) title.textContent = form.dataset.eventMode === 'edit' ? 'Edit Personal Schedule' : 'Create Personal Schedule';
    if (!document.getElementById('eventCategory')?.value) setValue('eventCategory', 'class');
    if (!document.getElementById('eventAttendees')?.value) setValue('eventAttendees', 1);
    if (!document.getElementById('eventContactPerson')?.value) setValue('eventContactPerson', ownerName());
    if (!document.getElementById('eventContactInfo')?.value) setValue('eventContactInfo', '00000000000');
    syncPersonalScheduleTypeFields();
  }

  function openPersonalFormFromCalendarTarget(target, event) {
    if (personalCalendarOpenSuppressed()) return false;
    const calendarDate = personalMode && target?.closest?.('#calendar')
      ? calendarDateFromTarget(target, event?.clientX)
      : '';
    if (!calendarDate) return false;
    openPersonalForm(null, calendarDate);
    return true;
  }

  async function deleteEvent(id) {
    if (!confirm('Delete this personal schedule?')) return;
    try {
      const rows = await rest(`/rest/v1/${TABLE}?${personalRowQuery(id)}`, { method: 'DELETE' }, 'return=representation');
      if (!Array.isArray(rows) || !rows.length) throw new Error('Personal schedule was not deleted in the database.');
      closeDetailsModal();
      closePersonalForm();
      activePersonalDetailId = '';
      activePersonalDetailRecord = null;
      await loadEvents(activeQuery, { force: true });
      render();
    } catch (error) {
      alert(error.message || 'Personal schedule could not be deleted.');
    }
  }

  function enhancePostedScheduleSubmit(event) {
    if (event.target?.id !== 'eventForm') return;
    const recurrenceType = document.getElementById('eventRecurrenceType')?.value || 'none';
    if (recurrenceType === 'none') return;
    const title = document.getElementById('eventTitle')?.value?.trim();
    const startDate = document.getElementById('eventDate')?.value;
    const endDate = document.getElementById('eventEndDate')?.value || startDate;
    const startTime = document.getElementById('eventStart')?.value;
    const endTime = document.getElementById('eventEnd')?.value;
    const recurrenceUntil = document.getElementById('eventRecurrenceUntil')?.value || defaultRecurrenceUntil(startDate, recurrenceType);
    const occurrences = buildOccurrences({ startDate, startTime, endDate, endTime, recurrenceType, recurrenceUntil });
    if (!occurrences.length) return;
    window.setTimeout(() => patchRecentSchedule({ title, occurrences, recurrenceType, recurrenceUntil }), 1000);
    window.setTimeout(() => patchRecentSchedule({ title, occurrences, recurrenceType, recurrenceUntil }), 2600);
  }

  async function patchRecentSchedule({ title, occurrences, recurrenceType, recurrenceUntil }) {
    const uid = currentUserId();
    if (!uid || !title) return;
    const encodedTitle = encodeURIComponent(title);
    const rows = await rest(`/rest/v1/${TABLE}?select=id,title,created_by,updated_at&record_type=eq.${PERSONAL_RECORD_TYPE}&title=eq.${encodedTitle}&created_by=eq.${encodeURIComponent(uid)}&order=updated_at.desc&limit=1`, {}, 'return=minimal').catch(() => []);
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row?.id) return;
    await rest(`/rest/v1/${TABLE}?id=eq.${encodeURIComponent(row.id)}&record_type=eq.${PERSONAL_RECORD_TYPE}`, {
      method: 'PATCH',
      body: JSON.stringify({
        schedule_type: occurrences.length > 1 ? 'multi_day' : 'single_day',
        recurrence_type: recurrenceType,
        recurrence_until: recurrenceUntil || null,
        occurrences,
        start_time: occurrences[0].start_time,
        end_time: occurrences[occurrences.length - 1].end_time,
        updated_at: new Date().toISOString()
      })
    }, 'return=minimal').catch(() => {});
    const storeEvent = (window.CONNECT_STATE?.store?.events || []).find((event) => event.id === row.id);
    if (storeEvent) {
      Object.assign(storeEvent, {
        schedule_type: occurrences.length > 1 ? 'multi_day' : 'single_day',
        recurrence_type: recurrenceType,
        recurrence_until: recurrenceUntil || '',
        occurrences,
        start_time: occurrences[0].start_time,
        end_time: occurrences[occurrences.length - 1].end_time
      });
      window.CONNECT_STATE?.calendar?.refetchEvents?.();
    }
  }

  function bind() {
    const modal = document.getElementById('eventModal');
    if (modal && modal.dataset.personalCloseBound !== '1') {
      modal.dataset.personalCloseBound = '1';
      modal.addEventListener('close', () => {
        if (document.getElementById('eventForm')?.dataset.personalSchedule === '1') setPersonalFormMode(false);
      });
    }
    document.addEventListener('click', (event) => {
      if (personalCalendarOpenSuppressed()) {
        if (personalMode && event.target?.closest?.('#calendar')) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
        return;
      }
      if (event.target.closest('#calendarQuickCreateButton')) return;
      if (event.target.closest('#calendar .fc-event, #calendar .fc-more-link, #calendar .fc-popover')) return;
      if (personalMode && event.target?.closest?.('#calendar')) {
        window.setTimeout(ensureOpenModalUsesPersonalForm, 0);
        window.setTimeout(ensureOpenModalUsesPersonalForm, 80);
      }
      if (openPersonalFormFromCalendarTarget(event.target, event)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
    }, true);
    document.addEventListener('click', (event) => {
      const isPersonalUiActive = personalMode || document.body.classList.contains('personal-calendar-perspective');
      if (isPersonalUiActive && event.target.closest('#dashboardButton')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        closePersonalCalendar();
        return;
      }
      if (isPersonalUiActive && event.target.closest('#mobileMenuButton')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        closePersonalCalendar();
        return;
      }
      if (personalMode && event.target.closest('#createEventButton')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        openPersonalForm();
        return;
      }
      if (personalMode && event.target.closest('#prevButton')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        movePersonalPeriod('prev');
        return;
      }
      if (personalMode && event.target.closest('#nextButton')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        movePersonalPeriod('next');
        return;
      }
      if (event.target.closest('#personalCalendarButton')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        openPersonalCalendar();
        return;
      }
      const edit = event.target.closest('[data-personal-edit]');
      if (edit) {
        event.preventDefault();
        event.stopImmediatePropagation();
        editEvent(edit.dataset.personalEdit);
        return;
      }
      const remove = event.target.closest('[data-personal-delete]');
      if (remove) {
        event.preventDefault();
        event.stopImmediatePropagation();
        void deleteEvent(remove.dataset.personalDelete);
        return;
      }
      const personalDetailEdit = event.target.closest('#detailsEditButton');
      const personalDetailDelete = event.target.closest('#detailsDeleteButton');
      const directPersonalEdit = event.target.closest('#personalDetailsEditButton');
      const directPersonalDelete = event.target.closest('#personalDetailsDeleteButton');
      if (personalMode && activePersonalDetailRecord && (personalDetailEdit || directPersonalEdit)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (activePersonalDetailId) {
          closeDetailsModal();
          editEvent(activePersonalDetailId, activePersonalDetailRecord);
        }
        return;
      }
      if (personalMode && activePersonalDetailRecord && (personalDetailDelete || directPersonalDelete)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (activePersonalDetailId) {
          void deleteEvent(activePersonalDetailId);
        }
        return;
      }
      if (personalMode && event.target.closest('#deleteEventButton')) {
        const id = document.getElementById('eventId')?.value;
        if (id) {
          event.preventDefault();
          event.stopImmediatePropagation();
          void deleteEvent(id);
        }
      }
    }, true);
    document.addEventListener('submit', savePersonalEvent, true);
    document.addEventListener('submit', enhancePostedScheduleSubmit, true);
    document.addEventListener('input', (event) => {
      if (personalMode && event.target?.id === 'personalCalendarHeaderSearch') void searchPublic();
    });
    document.addEventListener('focusin', (event) => {
      if (personalMode && event.target?.id === 'personalCalendarHeaderSearch') expandHeaderSearch();
    });
    document.addEventListener('click', (event) => {
      if (personalMode && event.target?.id === 'personalCalendarHeaderSearch') expandHeaderSearch();
    }, true);
    document.addEventListener('focusout', (event) => {
      if (personalMode && event.target?.id === 'personalCalendarHeaderSearch') {
        window.setTimeout(collapseHeaderSearch, 120);
      }
    });
    document.addEventListener('keydown', (event) => {
      if (!personalMode || event.target?.id !== 'personalCalendarHeaderSearch') return;
      if (event.key === 'Enter') {
        event.preventDefault();
        void searchPublic();
        event.target.blur();
        collapseHeaderSearch();
      } else if (event.key === 'Escape') {
        event.target.blur();
        collapseHeaderSearch();
      }
    }, true);
    document.addEventListener('change', (event) => {
      if (personalMode && (event.target?.id === 'eventScheduleType' || event.target?.id === 'eventDate')) {
        syncPersonalScheduleTypeFields();
      }
      if (!personalMode || event.target?.id !== 'viewSelector') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      changePersonalView();
    }, true);
    window.addEventListener('csc:restore-personal-calendar', () => openPersonalCalendar());
    if (window.CSC_PENDING_PERSONAL_CALENDAR_RESTORE) window.setTimeout(openPersonalCalendar, 0);
    window.addEventListener('resize', () => {
      if (!personalMode) return;
      syncHeaderSearchMode();
      schedulePersonalCalendarHeightSync();
    }, { passive: true });
    window.visualViewport?.addEventListener('resize', () => {
      if (!personalMode) return;
      syncHeaderSearchMode();
      schedulePersonalCalendarHeightSync();
    }, { passive: true });
    document.addEventListener('calendar-google-style-event-opened', (event) => {
      const record = event.detail?.record || window.__calendarGoogleStyleLastOpenedRecord || null;
      if (!record) return;
      if (!isPersonalRecord(record)) {
        activePersonalDetailId = '';
        activePersonalDetailRecord = null;
        document.getElementById('detailsModal')?.removeAttribute('data-personal-schedule-details');
        resetPersonalDetailsActions();
        return;
      }
      [0, 60, 160, 360].forEach((delay) => {
        window.setTimeout(() => applyPersonalDetailsActions(record), delay);
      });
    });
    document.getElementById('detailsModal')?.addEventListener('close', () => {
      activePersonalDetailId = '';
      activePersonalDetailRecord = null;
      resetPersonalDetailsActions();
    });
    watchDetailsModal();
  }

  function init() {
    injectStyle();
    refreshAddonDom();
    window.CSC_OPEN_PERSONAL_CALENDAR = openPersonalCalendar;
    window.CSC_CLOSE_PERSONAL_CALENDAR = closePersonalCalendar;
    bind();
    new MutationObserver(scheduleAddonDomRefresh).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
