const SESSION_KEY = 'core_supabase_auth_session';
const NOTIFICATION_TABLE = 'notifications';
const MAX_VISIBLE_NOTIFICATIONS = 50;
const READ_STORAGE_PREFIX = 'csc_sync_notification_read_v2';
const REALTIME_TABLES = ['calendar_items', 'announcements', 'concerns', 'conference_room_bookings'];
const REALTIME_REFRESH_DELAY_MS = 180;
const REALTIME_HEARTBEAT_MS = 25000;
const NOTIFICATION_FILTERS = ['all', 'unread', 'schedules', 'concerns', 'announcements'];

let context = {};
let schemaMode = '';
let realtimeSocket = null;
let realtimeRef = 1;
let heartbeatTimer = null;
let realtimeJoined = false;
let refreshTimer = null;
let refreshPromise = null;
let queuedTables = new Set();
let knownNotificationKeys = new Set();
let activeNotificationFilter = 'all';

export function configureNotifications(nextContext = {}) {
  context = { ...context, ...nextContext };
}

export function notificationContext() {
  return {
    user: currentUser(),
    isAdmin: isAdmin(),
    organizationId: currentUser().organization_id || ''
  };
}

export function currentUserNotifications() {
  const user = currentUser();
  const notices = derivedNotifications(user);
  return dedupeNotifications(notices).sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
}

export function unreadNotificationCount() {
  return currentUserNotifications().filter((notice) => !notice.is_read).length;
}

export function ensureNotificationStyles() {
  if (document.getElementById('shared-notification-style')) return;
  const style = document.createElement('style');
  style.id = 'shared-notification-style';
  style.textContent = `
    #notificationsModal[open]{padding:0;border:0;background:rgba(15,23,42,.64);max-width:none;max-height:none;width:100vw;height:100vh}
    #notificationsModal[open]::backdrop{background:rgba(15,23,42,.74);backdrop-filter:blur(6px)}
    #notificationsModal[open] .modal-card{width:min(95vw,1100px);max-height:96vh;margin:2vh auto;padding:20px 34px 24px;border-radius:18px;background:#fff;box-shadow:0 24px 70px rgba(15,23,42,.3);overflow:hidden}
    #notificationsModal[open] .modal-header{align-items:flex-start;gap:10px;margin-bottom:8px}
    #notificationsModal[open] .modal-header h3{font-size:1.72rem;line-height:1.05;margin:0;color:#0f172a;letter-spacing:0}
    #notificationsModal[open] .notification-header-actions{align-items:center;gap:10px}
    #notificationsModal[open] #markNotificationsReadButton{border:0;background:transparent;color:#0b63f6;font-weight:700;min-height:38px;padding:0 4px}
    #notificationsModal[open] .modal-header .icon-button{width:40px;height:40px;border-radius:999px;border:1px solid #d8e0ec;background:#fff;color:#0f172a;font-size:1.18rem;box-shadow:0 8px 22px rgba(15,23,42,.08)}
    #notificationsList{display:flex!important;flex-direction:column!important;gap:7px!important;max-height:calc(96vh - 98px);overflow:auto;padding:1px 10px 14px 0;scrollbar-color:#9ca3af transparent}
    #notificationsList .notifications-toolbar{position:sticky;top:0;z-index:2;background:#fff;padding:8px 0 9px 10px;display:grid;gap:8px}
    #notificationsList .notifications-summary{color:#0b63f6;font-size:.9rem;font-weight:800;line-height:1.1}
    #notificationsList .notification-filters{display:flex;gap:7px;flex-wrap:wrap}
    #notificationsList .notification-filter{border:1px solid #d8e0ec;background:#fff;color:#1f2937;border-radius:8px;min-height:28px;padding:0 16px;font-weight:800;font-size:.84rem;box-shadow:0 4px 12px rgba(15,23,42,.04)}
    #notificationsList .notification-filter.active{border-color:#0b63f6;color:#0b63f6;box-shadow:inset 0 -3px 0 #0b63f6}
    #notificationsList .notification-card{display:grid!important;grid-template-columns:52px minmax(0,1fr) 108px!important;gap:12px!important;align-items:center!important;border:1px solid #cfe0f5!important;border-radius:10px!important;background:linear-gradient(90deg,#f7fbff 0%,#fff 100%)!important;padding:9px 13px!important;box-shadow:none!important;min-height:64px!important;position:relative!important;overflow:hidden!important}
    #notificationsList .notification-card{cursor:pointer}
    #notificationsList .notification-card:focus-visible{outline:3px solid rgba(11,99,246,.28);outline-offset:2px}
    #notificationsList .notification-card::before{content:"";position:absolute;inset:0 auto 0 0;width:5px;background:#3b82f6}
    #notificationsList .notification-card:not(.unread-notification){background:#fff!important;border-color:#e1e7f0!important}
    #notificationsList .notification-card:not(.unread-notification)::before{background:#e2e8f0}
    #notificationsList .notification-card.notification-tone-schedules{background:linear-gradient(90deg,#dbeafe 0%,#eff6ff 48%,#fff 100%)!important;border-color:#93c5fd!important}
    #notificationsList .notification-card.notification-tone-schedules::before{background:#2563eb!important}
    #notificationsList .notification-card.notification-tone-concerns{background:linear-gradient(90deg,#fee2e2 0%,#fff1f2 48%,#fff 100%)!important;border-color:#fca5a5!important}
    #notificationsList .notification-card.notification-tone-concerns::before{background:#dc2626!important}
    #notificationsList .notification-card.notification-tone-announcements{background:linear-gradient(90deg,#fef3c7 0%,#fffbeb 48%,#fff 100%)!important;border-color:#fbbf24!important}
    #notificationsList .notification-card.notification-tone-announcements::before{background:#d97706!important}
    #notificationsList .notification-card.notification-tone-accounts{background:linear-gradient(90deg,#ede9fe 0%,#f5f3ff 48%,#fff 100%)!important;border-color:#c4b5fd!important}
    #notificationsList .notification-card.notification-tone-accounts::before{background:#7c3aed!important}
    #notificationsList .notification-card.notification-tone-conference{background:linear-gradient(90deg,#d1fae5 0%,#ecfdf5 48%,#fff 100%)!important;border-color:#6ee7b7!important}
    #notificationsList .notification-card.notification-tone-conference::before{background:#059669!important}
    #notificationsList .notification-card.notification-tone-default{background:linear-gradient(90deg,#e2e8f0 0%,#f8fafc 48%,#fff 100%)!important;border-color:#cbd5e1!important}
    #notificationsList .notification-card.notification-tone-default::before{background:#64748b!important}
    #notificationsList .notification-icon{width:40px;height:40px;border:1px solid #e1e7f0;border-radius:8px;background:#fff;display:grid;place-items:center;color:#0b63f6;box-shadow:0 6px 16px rgba(15,23,42,.07)}
    #notificationsList .notification-icon svg{width:23px;height:23px;stroke:currentColor;stroke-width:2.15;fill:none;stroke-linecap:round;stroke-linejoin:round}
    #notificationsList .notification-copy{min-width:0;display:grid;gap:3px}
    #notificationsList .notification-title{display:flex!important;align-items:center;gap:7px;margin:0;color:#0f172a!important;font-size:.9rem!important;line-height:1.15!important;font-weight:900!important}
    #notificationsList .notification-message{margin:0!important;color:#5b6472!important;line-height:1.22!important;overflow-wrap:anywhere!important;border:0!important;padding:0!important;display:block!important;font-size:.8rem!important}
    #notificationsList .notification-meta{display:grid;gap:5px;justify-items:end;color:#5b6472;font-weight:700}
    #notificationsList .notification-dot{display:inline-block;width:8px;height:8px;border-radius:999px;background:#0b63f6;box-shadow:none;flex:0 0 auto}
    #notificationsList .notification-card:not(.unread-notification) .notification-dot{background:#cbd5e1}
    #notificationsList .notification-time{color:#5b6472;font-size:.78rem;white-space:nowrap}
    #notificationsList .notification-target-button{border:0;background:transparent;color:#0b63f6;font-weight:900;font-size:.86rem;padding:0;min-height:20px}
    #notificationsList .notification-target-button::after{content:"  →"}
    #notificationsList .notification-empty{border:1px dashed #cfe0f5;border-radius:12px;padding:24px;color:#64748b;background:#f8fafc}
    @media (max-width:700px){
      #notificationsModal[open] .modal-card{width:95vw;max-height:96vh;margin:2vh auto;padding:16px 14px 18px}
      #notificationsModal[open] .modal-header h3{font-size:1.45rem}
      #notificationsModal[open] .modal-header .icon-button{width:36px;height:36px}
      #notificationsModal[open] .notification-header-actions{gap:8px}
      #notificationsList{max-height:calc(96vh - 92px);padding:1px 4px 12px 0;gap:6px!important}
      #notificationsList .notifications-toolbar{gap:6px;padding:7px 0 7px 8px}
      #notificationsList .notification-filters{gap:5px}
      #notificationsList .notification-card{grid-template-columns:38px minmax(0,1fr)!important;gap:8px!important;padding:8px 10px!important;min-height:58px!important}
      #notificationsList .notification-icon{width:32px;height:32px}
      #notificationsList .notification-icon svg{width:19px;height:19px}
      #notificationsList .notification-title{font-size:.82rem!important}
      #notificationsList .notification-message{font-size:.74rem!important}
      #notificationsList .notification-meta{grid-column:2;justify-items:start;grid-auto-flow:column;align-items:center;gap:10px}
      #notificationsList .notification-time{font-size:.72rem}
      #notificationsList .notification-target-button{font-size:.78rem}
      #notificationsList .notification-filter{flex:1 1 88px;min-height:27px;padding:0 8px;font-size:.76rem}
    }
  `;
  document.head.appendChild(style);
}

export function updateNotificationBadge() {
  const badge = document.getElementById('notificationBadge');
  if (!badge) return;
  const count = unreadNotificationCount();
  badge.textContent = String(count);
  badge.hidden = count === 0;
}

export async function startNotificationRuntime() {
  stopNotificationRuntime();
  ensureNotificationStyles();
  await mergeConferenceRoomBookings().catch(() => null);
  await requestNotificationRefresh();
  knownNotificationKeys = notificationKeySet();
  subscribeNotifications((payload) => queueRealtimeRefresh(payload));
}

export function stopNotificationRuntime() {
  if (refreshTimer) window.clearTimeout(refreshTimer);
  refreshTimer = null;
  refreshPromise = null;
  queuedTables = new Set();
  knownNotificationKeys = new Set();
  realtimeJoined = false;
  if (heartbeatTimer) window.clearInterval(heartbeatTimer);
  heartbeatTimer = null;
  if (realtimeSocket) {
    try { realtimeSocket.close(1000, 'notification runtime stopped'); } catch {}
  }
  realtimeSocket = null;
}

export async function requestNotificationRefresh() {
  updateNotificationBadge();
  return currentUserNotifications();
}

export async function createNotification(payload = {}) {
  await requestNotificationRefresh();
  if (document.getElementById('notificationsModal')?.open) {
    if (typeof context.renderProvider === 'function') context.renderProvider();
    else renderNotifications();
  }
  return [];
}

export function notifyAdmin(payload = {}) {
  return notifyAdmins(payload);
}

export function notifyAdmins(payload = {}) {
  const admins = (store().users || []).filter((user) => isAdminUser(user) && user.id);
  if (!admins.length) return createNotification({ ...payload, recipient_type: 'admin' });
  return createNotification(admins.map((admin) => ({
    ...payload,
    user_id: admin.id,
    recipient_type: 'admin',
    recipient_id: admin.id
  })));
}

export function notifyOrganization(target, payload = {}) {
  const recipientId = typeof target === 'string'
    ? target
    : target?.organization_id || target?.created_by || target?.user_id || target?.id || '';
  if (!recipientId) return Promise.resolve([]);
  return createNotification({
    ...payload,
    user_id: target?.created_by || target?.user_id || recipientId,
    recipient_type: 'organization',
    recipient_id: recipientId
  });
}

export function notifyAllOrganizations(payload = {}) {
  const orgUsers = (store().users || []).filter((user) => isOrgUser(user) && user.id);
  if (!orgUsers.length) return createNotification({ ...payload, recipient_type: 'all_organizations' });
  return createNotification(orgUsers.map((user) => ({
    ...payload,
    user_id: user.id,
    recipient_type: 'organization',
    recipient_id: user.organization_id || user.id
  })));
}

export async function markNotificationRead(id) {
  const notices = rawStoreNotifications();
  const index = notices.findIndex((item) => {
    const notice = normalizeNotification(item);
    return notificationKey(notice) === id || notice.notification_id === id || notice.id === id;
  });
  if (index < 0) {
    rememberRead(id);
    updateNotificationBadge();
    return true;
  }
  notices[index].is_read = true;
  const notice = normalizeNotification(notices[index]);
  if (!notice) return false;
  updateNotificationBadge();
  await updateNotificationRead(notice).catch((error) => console.warn('Notification read save failed:', error.message));
  return true;
}

export async function markAllNotificationsRead() {
  const notices = currentUserNotifications().filter((notice) => !notice.is_read);
  await Promise.all(notices.map((notice) => markNotificationRead(notificationKey(notice)).catch(() => null)));
  return true;
}

export function renderNotifications({ onOpenTarget } = {}) {
  ensureNotificationStyles();
  const list = document.getElementById('notificationsList');
  const markButton = document.getElementById('markNotificationsReadButton');
  const allNotices = currentUserNotifications();
  const notices = filteredNotifications(allNotices).slice(0, MAX_VISIBLE_NOTIFICATIONS);
  if (markButton) {
    markButton.hidden = !allNotices.some((notice) => !notice.is_read);
    markButton.textContent = 'Mark all as read';
  }
  if (!list) return notices;
  list.innerHTML = notificationToolbarHtml(allNotices) + (notices.length
    ? notices.map(notificationHtml).join('')
    : `<div class="notification-empty"><strong>No notifications</strong><p>You are all caught up.</p></div>`);
  list.querySelectorAll('[data-notification-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      activeNotificationFilter = button.dataset.notificationFilter || 'all';
      renderNotifications({ onOpenTarget });
    });
  });
  list.querySelectorAll('[data-notification-open]').forEach((trigger) => {
    const open = async () => {
      await markNotificationRead(trigger.dataset.notificationOpen);
      const notice = currentUserNotifications().find((item) => notificationKey(item) === trigger.dataset.notificationOpen);
      document.getElementById('notificationsModal')?.close?.();
      if (onOpenTarget) onOpenTarget(notice);
    };
    trigger.addEventListener('click', async (event) => {
      if (event.target.closest('button') && event.currentTarget !== event.target.closest('button')) return;
      event.stopPropagation();
      await open();
    });
    trigger.addEventListener('keydown', async (event) => {
      if (!['Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      await open();
    });
  });
  updateNotificationBadge();
  return notices;
}

export function subscribeNotifications(onChange = () => {}) {
  if (realtimeSocket) stopRealtimeSocket();
  const config = window.SUPABASE_CONFIG || {};
  const token = session()?.access_token;
  const key = supabaseKey(config);
  if (!config.url || !key || !token || typeof WebSocket === 'undefined') return null;
  const socketUrl = `${String(config.url).replace(/^http/i, 'ws')}/realtime/v1/websocket?apikey=${encodeURIComponent(key)}&vsn=1.0.0`;
  const topic = `realtime:csc-sync-notifications:${currentUser().id || currentUser().organization_id || 'user'}`;
  const postgresChanges = REALTIME_TABLES.map((table) => ({ event: '*', schema: 'public', table }));
  realtimeSocket = new WebSocket(socketUrl);
  realtimeSocket.addEventListener('open', () => {
    realtimeJoined = false;
    sendRealtime(topic, 'phx_join', {
      config: { postgres_changes: postgresChanges },
      access_token: token
    });
    heartbeatTimer = window.setInterval(() => sendRealtime('phoenix', 'heartbeat', {}, String(realtimeRef++)), REALTIME_HEARTBEAT_MS);
  });
  realtimeSocket.addEventListener('message', (event) => {
    const message = parseRealtimeMessage(event.data);
    if (!message) return;
    if (message.event === 'phx_reply' && message.payload?.status === 'ok') realtimeJoined = true;
    if (!realtimeJoined || message.event !== 'postgres_changes') return;
    const payload = message.payload?.data || message.payload || {};
    onChange({
      ...payload,
      table: payload.table || payload?.schema_table || tableFromRealtimePayload(payload),
      eventType: payload.type || payload.eventType || payload.event
    });
  });
  realtimeSocket.addEventListener('close', () => {
    if (heartbeatTimer) window.clearInterval(heartbeatTimer);
    heartbeatTimer = null;
    realtimeJoined = false;
  });
  realtimeSocket.addEventListener('error', (error) => console.warn('Notification realtime unavailable:', error));
  return () => {
    if (realtimeSocket) stopRealtimeSocket();
  };
}

export function openNotificationTarget(notice = {}) {
  if (!notice) return;
  const table = String(notice.reference_table || inferredReferenceTable(notice)).toLowerCase();
  const type = String(notice.notification_type || notice.type || '').toLowerCase();
  const id = String(notice.reference_id || '');
  if (table.includes('conference') || type.includes('conference')) {
    try { sessionStorage.setItem('csc_conference_room_active_org', '1'); } catch {}
    document.getElementById('conferenceRoomButton')?.click();
  }
  else if (table.includes('concern')) document.getElementById('concernsButton')?.click();
  else if (table.includes('announcement')) openAnnouncementSidePanelFromNotification();
  else if (table.includes('profile') || type.includes('account')) clickVisibleTarget(['usersButton', 'personalCalendarButton']);
  else clickVisibleTarget(['eventRequestsButton', 'personalCalendarButton']);
  setTimeout(() => highlightReference(id), 120);
}

function openAnnouncementSidePanelFromNotification() {
  const sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.classList.add('open');
  document.getElementById('mobileScrim')?.classList.add('open');
  document.body.classList.add('sidebar-drawer-open');
  document.getElementById('mobileMenuButton')?.setAttribute('aria-expanded', 'true');
  const target = document.querySelector('#announcementPreview .notice') || document.querySelector('.org-announcement-preview');
  if (!target) return;
  target.scrollIntoView({ block: 'center', behavior: 'smooth' });
  target.classList.add('notification-target-highlight');
  setTimeout(() => target.classList.remove('notification-target-highlight'), 1800);
}

function clickVisibleTarget(ids = []) {
  const button = ids
    .map((id) => document.getElementById(id))
    .find((item) => item && !item.hidden && item.offsetParent !== null && !item.disabled);
  button?.click();
}

async function loadNotifications() {
  const rows = await rest(`/rest/v1/${NOTIFICATION_TABLE}?select=*&order=created_at.desc&limit=100`, {}, true);
  if (Array.isArray(rows) && rows.length && !schemaMode) schemaMode = rows[0].notification_id ? 'legacy' : 'duplex';
  if (Array.isArray(rows)) return rows.map(normalizeNotification);
  return [];
}

async function insertNotifications(rows) {
  const mode = schemaMode || preferredInsertMode(rows);
  const payload = rows.map((row) => mode === 'duplex' ? duplexRow(row) : legacyRow(row));
  try {
    const saved = await rest(`/rest/v1/${NOTIFICATION_TABLE}`, {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(payload)
    }, true);
    schemaMode = mode;
    return Array.isArray(saved) ? saved.map(normalizeNotification) : [];
  } catch (error) {
    if (schemaMode) throw error;
    schemaMode = mode === 'duplex' ? 'legacy' : 'duplex';
    return insertNotifications(rows);
  }
}

async function updateNotificationRead(notice) {
  const id = notice.id || notice.notification_id;
  if (!id) return null;
  const column = notice.id && schemaMode !== 'legacy' ? 'id' : 'notification_id';
  return rest(`/rest/v1/${NOTIFICATION_TABLE}?${column}=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ is_read: true })
  }, true);
}

function normalizeOutgoingRows(row = {}) {
  const now = new Date().toISOString();
  const generatedId = row.id || row.notification_id || createId();
  const type = row.notification_type || row.type || 'system';
  const referenceTable = row.reference_table || inferredReferenceTable({ notification_type: type, type });
  return {
    ...row,
    notification_id: generatedId,
    id: generatedId,
    notification_type: type,
    type,
    reference_table: referenceTable,
    reference_id: row.reference_id || '',
    title: row.title || 'Notification',
    message: row.message || '',
    is_read: Boolean(row.is_read),
    created_at: row.created_at || now,
    sender_type: row.sender_type || (isAdmin() ? 'admin' : 'organization'),
    sender_id: row.sender_id || currentUser().id || null
  };
}

function normalizeNotification(row = {}) {
  return {
    ...row,
    id: row.id || '',
    notification_id: row.notification_id || row.id || createId(),
    user_id: row.user_id || row.recipient_id || '',
    notification_type: row.notification_type || row.type || 'system',
    type: row.type || row.notification_type || 'system',
    recipient_type: row.recipient_type || (row.user_id ? 'organization' : ''),
    recipient_id: row.recipient_id || row.user_id || '',
    reference_table: row.reference_table || inferredReferenceTable(row),
    reference_id: row.reference_id || '',
    title: row.title || 'Notification',
    message: row.message || '',
    is_read: Boolean(row.is_read),
    created_at: row.created_at || new Date().toISOString()
  };
}

function legacyRow(row) {
  return {
    notification_id: row.notification_id || row.id || createId(),
    user_id: row.user_id || row.recipient_id || currentUser().id,
    notification_type: row.notification_type || row.type || 'system',
    reference_id: row.reference_id ? String(row.reference_id) : null,
    title: row.title,
    message: row.message,
    is_read: Boolean(row.is_read),
    created_at: row.created_at
  };
}

function duplexRow(row) {
  return {
    id: row.id || row.notification_id || createId(),
    recipient_type: row.recipient_type || 'organization',
    recipient_id: row.recipient_id || row.user_id || null,
    sender_type: row.sender_type || 'system',
    sender_id: row.sender_id || null,
    title: row.title,
    message: row.message,
    type: row.type || row.notification_type || 'system',
    reference_table: row.reference_table || inferredReferenceTable(row),
    reference_id: row.reference_id || null,
    is_read: Boolean(row.is_read),
    created_at: row.created_at
  };
}

function preferredInsertMode(rows) {
  return rows.some((row) => row.recipient_type === 'all_organizations' || (!row.user_id && row.recipient_type)) ? 'duplex' : 'legacy';
}

function mergeStoreNotifications(rows = []) {
  const s = store();
  if (!s) return;
  if (!Array.isArray(s.notifications)) s.notifications = [];
  rows.map(normalizeNotification).forEach((notice) => {
    const key = notificationKey(notice);
    const index = s.notifications.findIndex((item) => notificationKey(item) === key);
    if (index >= 0) s.notifications[index] = { ...s.notifications[index], ...notice };
    else s.notifications.unshift(notice);
  });
}

function storeNotifications() {
  return Array.isArray(store().notifications) ? store().notifications.map(normalizeNotification) : [];
}

function derivedNotifications(user = currentUser()) {
  const s = store();
  return [
    ...derivedScheduleNotifications(s, user),
    ...derivedAnnouncementNotifications(s, user),
    ...derivedConcernNotifications(s, user)
  ];
}

function derivedScheduleNotifications(s = {}, user = currentUser()) {
  const events = Array.isArray(s.events) ? s.events : [];
  return events.flatMap((event) => {
    if (!event?.id || event.record_type !== 'schedule') return [];
    const status = String(event.approval_status || '').toLowerCase();
    const isConference = isConferenceRoomBooking(event);
    if (isAdmin()) {
      if (status !== 'pending' || !isOrganizationRecord(event)) return [];
      const type = isConference ? 'conference_submitted' : scheduleRequestType(event);
      return [derivedNotice({
        id: `derived:${type}:${event.id}`,
        user_id: user.id,
        recipient_type: 'admin',
        recipient_id: user.id,
        notification_type: type,
        type,
        reference_table: 'calendar_items',
        reference_id: event.id,
        title: isConference ? 'New Conference Room Booking' : scheduleRequestTitle(event),
        message: `${event.organization_name || 'An organization'} submitted "${event.title || (isConference ? 'Conference room booking' : 'Untitled schedule')}".`,
        created_at: event.revision_submitted_at || event.created_at || event.updated_at
      })];
    }
    if (!['approved', 'rejected'].includes(status) || !belongsToUserOrganization(event, user)) return [];
    const type = isConference
      ? (status === 'approved' ? 'conference_approved' : 'conference_rejected')
      : (status === 'approved' ? 'schedule_approved' : 'schedule_rejected');
    const title = isConference
      ? `Conference Room Booking ${status === 'approved' ? 'Approved' : 'Rejected'}`
      : `Schedule ${status === 'approved' ? 'Approved' : 'Rejected'}`;
    const reason = event.admin_recommendation || event.rejection_reason || '';
    return [derivedNotice({
      id: `derived:${type}:${event.id}`,
      user_id: user.id,
      recipient_type: 'organization',
      recipient_id: user.organization_id || user.id,
      notification_type: type,
      type,
      reference_table: 'calendar_items',
      reference_id: event.id,
      title,
      message: isConference
        ? `Your conference room booking was ${status}.${reason ? ` Remarks: ${reason}` : ''}`
        : `Your schedule "${event.title || 'Untitled schedule'}" was ${status}.${reason ? ` Note: ${reason}` : ''}`,
      created_at: event.approval_date || event.updated_at || event.created_at
    })];
  });
}

function derivedAnnouncementNotifications(s = {}, user = currentUser()) {
  if (isAdmin()) return [];
  return (Array.isArray(s.announcements) ? s.announcements : [])
    .filter((item) => item?.id && item.visibility_status !== 'hidden')
    .map((item) => derivedNotice({
      id: `derived:announcement:${item.id}`,
      user_id: user.id,
      recipient_type: 'all_organizations',
      recipient_id: user.organization_id || user.id,
      notification_type: 'announcement',
      type: 'announcement',
      reference_table: 'announcements',
      reference_id: item.id,
      title: 'Announcement',
      message: `${item.source_council || item.posted_by || 'CSC'} posted "${item.title || 'an announcement'}".`,
      created_at: item.updated_at || item.created_at || item.posted_at
    }));
}

function derivedConcernNotifications(s = {}, user = currentUser()) {
  const concerns = Array.isArray(s.concerns) ? s.concerns : [];
  return concerns.flatMap((concern) => {
    if (!concern?.id) return [];
    if (isAdmin() && concern.status === 'pending') {
      return [derivedNotice({
        id: `derived:concern_submitted:${concern.id}`,
        user_id: user.id,
        recipient_type: 'admin',
        recipient_id: user.id,
        notification_type: 'concern_submitted',
        type: 'concern_submitted',
        reference_table: 'concerns',
        reference_id: concern.id,
        title: 'New Concern Submitted',
        message: `${concern.organization_name || 'An organization'} submitted concern "${concern.title || 'Untitled concern'}".`,
        created_at: concern.created_at
      })];
    }
    if (isAdmin() || !belongsToUserOrganization(concern, user) || !concern.admin_response) return [];
    return [derivedNotice({
      id: `derived:concern_replied:${concern.id}`,
      user_id: user.id,
      recipient_type: 'organization',
      recipient_id: user.organization_id || user.id,
      notification_type: 'concern_replied',
      type: 'concern_replied',
      reference_table: 'concerns',
      reference_id: concern.id,
      title: 'Concern Reply',
      message: `Admin replied to "${concern.title || 'your concern'}".`,
      created_at: concern.updated_at || concern.resolved_at || concern.created_at
    })];
  });
}

function derivedNotice(notice) {
  const normalized = normalizeNotification(notice);
  normalized.is_read = readKeys().has(notificationKey(normalized)) || readKeys().has(normalized.id);
  return normalized;
}

function rawStoreNotifications() {
  const s = store();
  if (!Array.isArray(s.notifications)) s.notifications = [];
  return s.notifications;
}

function noticeVisibleToUser(notice, user) {
  if (isAdmin()) return !notice.recipient_type || notice.recipient_type === 'admin' || notice.user_id === user.id;
  if (notice.recipient_type === 'all_organizations') return true;
  if (notice.user_id && notice.user_id === user.id) return true;
  if (notice.recipient_id && (notice.recipient_id === user.id || notice.recipient_id === user.organization_id)) return true;
  return false;
}

function notificationHtml(notice) {
  const key = notificationKey(notice);
  const unreadClass = notice.is_read ? '' : ' unread-notification';
  const toneClass = notificationToneClass(notice);
  return `<article class="notification-card ${toneClass}${unreadClass}" data-notification-id="${escapeHtml(key)}" data-notification-type="${escapeHtml(notificationCategory(notice))}" data-notification-open="${escapeHtml(key)}" role="button" tabindex="0"><div class="notification-icon" aria-hidden="true">${notificationIcon(notice)}</div><div class="notification-copy"><strong class="notification-title">${escapeHtml(notice.title)}${notice.is_read ? '' : '<span class="notification-dot" aria-hidden="true"></span>'}</strong><p class="notification-message">${escapeHtml(notice.message)}</p></div><div class="notification-meta"><span class="notification-time">${escapeHtml(formatRelativeDate(notice.created_at))}</span><button type="button" class="notification-target-button" data-notification-open="${escapeHtml(key)}">${notificationActionLabel(notice)}</button></div></article>`;
}

function notificationKey(notice = {}) {
  return [notice.notification_id || notice.id || '', notice.user_id || notice.recipient_id || '', notice.notification_type || notice.type || '', notice.reference_id || ''].join('|');
}

function notificationToolbarHtml(notices = []) {
  const unread = notices.filter((notice) => !notice.is_read).length;
  return `<div class="notifications-toolbar"><div class="notifications-summary">${unread} unread</div><div class="notification-filters">${NOTIFICATION_FILTERS.map((filter) => `<button type="button" class="notification-filter${activeNotificationFilter === filter ? ' active' : ''}" data-notification-filter="${filter}">${filterLabel(filter)}</button>`).join('')}</div></div>`;
}

function filteredNotifications(notices = []) {
  return notices.filter((notice) => {
    if (activeNotificationFilter === 'unread') return !notice.is_read;
    if (activeNotificationFilter === 'schedules') return notificationCategory(notice) === 'schedules';
    if (activeNotificationFilter === 'concerns') return notificationCategory(notice) === 'concerns';
    if (activeNotificationFilter === 'announcements') return notificationCategory(notice) === 'announcements';
    return true;
  });
}

function notificationCategory(notice = {}) {
  const table = String(notice.reference_table || inferredReferenceTable(notice)).toLowerCase();
  const type = String(notice.notification_type || notice.type || '').toLowerCase();
  if (table.includes('profile') || table.includes('account') || type.includes('account')) return 'accounts';
  if (table.includes('conference') || type.includes('conference')) return 'conference';
  if (table.includes('concern') || type.includes('concern')) return 'concerns';
  if (table.includes('announcement') || type.includes('announcement')) return 'announcements';
  return 'schedules';
}

function notificationToneClass(notice = {}) {
  const category = notificationCategory(notice);
  return `notification-tone-${['schedules', 'concerns', 'announcements', 'accounts', 'conference'].includes(category) ? category : 'default'}`;
}

function filterLabel(filter) {
  return ({ all: 'All', unread: 'Unread', schedules: 'Schedules', concerns: 'Concerns', announcements: 'Announcements' })[filter] || filter;
}

function notificationIcon(notice = {}) {
  const type = String(notice.notification_type || notice.type || '').toLowerCase();
  if (type.includes('concern')) return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a8 8 0 0 1-8 8H7l-4 3v-6a8 8 0 1 1 18-5Z"/><path d="M8 12h.01M12 12h.01M16 12h.01"/></svg>';
  if (type.includes('announcement')) return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 11 18-5v12L3 13v-2Z"/><path d="M7 14v5a2 2 0 0 0 2 2h1"/></svg>';
  if (type.includes('revision') || type.includes('edit')) return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4 11.5-11.5Z"/></svg>';
  if (type.includes('conference')) return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18H6z"/><path d="M9 21v-5h6v5"/><path d="M9 7h.01M12 7h.01M15 7h.01M9 11h.01M12 11h.01M15 11h.01"/></svg>';
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3v4M17 3v4M4 9h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z"/><path d="M8 13h3v3H8z"/></svg>';
}

function notificationActionLabel(notice = {}) {
  return String(notice.notification_type || notice.type || '').toLowerCase().includes('conference') ? 'Open' : 'View';
}

async function queueRealtimeRefresh(payload = {}) {
  const table = String(payload.table || tableFromRealtimePayload(payload) || '').trim();
  if (table) queuedTables.add(table);
  if (refreshTimer) window.clearTimeout(refreshTimer);
  return new Promise((resolve) => {
    refreshTimer = window.setTimeout(() => {
      refreshTimer = null;
      const tables = [...queuedTables];
      queuedTables = new Set();
      refreshPromise = runRealtimeRefresh(tables, payload).finally(() => { refreshPromise = null; });
      refreshPromise.then(resolve).catch(resolve);
    }, REALTIME_REFRESH_DELAY_MS);
  });
}

async function runRealtimeRefresh(tables = [], payload = {}) {
  const beforeKeys = knownNotificationKeys.size ? knownNotificationKeys : notificationKeySet();
  try {
    if (typeof context.refreshProvider === 'function') await context.refreshProvider({ tables, payload });
  } catch (error) {
    console.warn('Notification realtime refresh failed:', error);
  }
  if (tables.includes('conference_room_bookings')) await mergeConferenceRoomBookings(payload).catch((error) => console.warn('Conference room notification refresh failed:', error));
  const notices = await requestNotificationRefresh();
  const afterKeys = notificationKeySet(notices);
  const newKeys = [...afterKeys].filter((key) => !beforeKeys.has(key));
  knownNotificationKeys = afterKeys;
  if (newKeys.length && typeof context.onNewNotifications === 'function') {
    context.onNewNotifications(newKeys.map((key) => notices.find((notice) => notificationKey(notice) === key)).filter(Boolean));
  }
  if (document.getElementById('notificationsModal')?.open) {
    if (typeof context.renderProvider === 'function') context.renderProvider();
    else renderNotifications();
  }
  return notices;
}

function notificationKeySet(notices = currentUserNotifications()) {
  return new Set(notices.map((notice) => notificationKey(notice)));
}

async function mergeConferenceRoomBookings(payload = {}) {
  const s = store();
  if (!s || !Array.isArray(s.events)) return;
  const rows = await rest('/rest/v1/conference_room_bookings?select=*&order=start_time.asc', {}, Boolean(session()?.access_token))
    .catch(() => rest('/rest/v1/conference_room_bookings?select=*&order=start_time.asc', {}, false))
    .catch(() => []);
  const conferenceEvents = (Array.isArray(rows) ? rows : []).filter((row) => row && row.id).map(conferenceBookingEvent);
  s.events = [...s.events.filter((event) => !isConferenceRoomBooking(event)), ...conferenceEvents];
  document.dispatchEvent(new CustomEvent('conference-room-bookings-updated', { detail: { payload } }));
}

function conferenceBookingEvent(row = {}) {
  return {
    ...row,
    record_type: 'schedule',
    schedule_source: row.schedule_source || row.created_by_role || (row.requires_approval === false ? 'admin' : 'organization'),
    created_by_role: row.created_by_role || row.schedule_source || (row.requires_approval === false ? 'admin' : 'organization'),
    requires_approval: row.requires_approval !== false,
    schedule_type: row.schedule_type || 'conference_room_booking',
    event_type: row.event_type || row.booking_type || 'Conference Room Booking',
    venue: row.venue || 'Conference Room',
    title: row.title || row.organization_name || 'Conference Room Booking',
    approval_status: row.approval_status || 'pending',
    event_status: row.event_status || 'planned',
    privacy_level: row.privacy_level || 'internal',
    occurrences: Array.isArray(row.occurrences) ? row.occurrences : [{ date: String(row.start_time || '').slice(0, 10), start_time: row.start_time || '', end_time: row.end_time || '' }],
    updated_at: row.updated_at || row.created_at || new Date().toISOString()
  };
}

function dedupeNotifications(notices) {
  const byKey = new Map();
  notices.forEach((notice) => {
    const key = notice.reference_id && (notice.notification_type || notice.type)
      ? [notice.user_id || notice.recipient_id || '', notice.notification_type || notice.type || '', notice.reference_table || '', notice.reference_id || ''].join('|')
      : notificationKey(notice);
    const existing = byKey.get(key);
    if (!existing || new Date(notice.created_at || 0) >= new Date(existing.created_at || 0)) byKey.set(key, notice);
  });
  return [...byKey.values()];
}

function isOrganizationRecord(event = {}) {
  return String(event.schedule_source || event.created_by_role || '').toLowerCase() === 'organization'
    || Boolean(event.requires_approval)
    || Boolean(event.organization_id);
}

function isConferenceRoomBooking(event = {}) {
  const values = [event.schedule_type, event.venue, event.title, event.event_type, event.booking_type, event.category_id, event.category]
    .map((value) => String(value || '').trim().toLowerCase());
  return values.includes('conference_room_booking') || values.includes('conference room');
}

function belongsToUserOrganization(record = {}, user = currentUser()) {
  if (record.created_by && record.created_by === user.id) return true;
  if (record.user_id && record.user_id === user.id) return true;
  if (record.organization_id && user.organization_id && record.organization_id === user.organization_id) return true;
  const recordOrg = String(record.organization_name || '').trim().toLowerCase();
  const userOrg = String(user.organization_name || '').trim().toLowerCase();
  return Boolean(recordOrg && userOrg && recordOrg === userOrg);
}

function scheduleRequestType(event = {}) {
  if (event.revision_of || event.original_schedule_id || event.revision_submitted_at) return 'schedule_revision';
  if (event.pending_action === 'remove' || event.revision_status === 'cancel_pending' || event.event_status === 'cancellation_requested') return 'schedule_removed';
  return 'schedule_submitted';
}

function scheduleRequestTitle(event = {}) {
  const type = scheduleRequestType(event);
  if (type === 'schedule_revision') return 'Schedule Edit Request';
  if (type === 'schedule_removed') return 'Schedule Removal Request';
  return 'New Schedule Request';
}

function rememberRead(id) {
  if (!id) return;
  const keys = readKeys();
  keys.add(id);
  try { localStorage.setItem(readStorageKey(), JSON.stringify([...keys].slice(-500))); } catch {}
}

function readKeys() {
  try {
    const parsed = JSON.parse(localStorage.getItem(readStorageKey()) || '[]');
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function readStorageKey() {
  return `${READ_STORAGE_PREFIX}:${currentUser().id || currentUser().organization_id || 'public'}`;
}

function inferredReferenceTable(notice = {}) {
  const type = String(notice.notification_type || notice.type || '').toLowerCase();
  if (type.includes('concern')) return 'concerns';
  if (type.includes('announcement')) return 'announcements';
  if (type.includes('account')) return 'profiles';
  return 'calendar_items';
}

function highlightReference(id) {
  if (!id) return;
  const selector = `[data-id="${CSS.escape(id)}"],[data-event-id="${CSS.escape(id)}"],[data-concern-id="${CSS.escape(id)}"],[data-announcement-id="${CSS.escape(id)}"]`;
  const target = document.querySelector(selector);
  if (!target) return;
  target.scrollIntoView({ block: 'center', behavior: 'smooth' });
  target.classList.add('notification-target-highlight');
  setTimeout(() => target.classList.remove('notification-target-highlight'), 1800);
}

async function rest(endpoint, options = {}, authenticated = false) {
  const config = window.SUPABASE_CONFIG || {};
  const key = supabaseKey(config);
  const token = authenticated ? session()?.access_token : key;
  if (!config.url || !key || !token) throw new Error('Supabase notification config is missing.');
  const response = await fetch(`${config.url}${endpoint}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  const payload = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.message || payload?.error || `Notification request failed (${response.status})`);
  return payload;
}

function supabaseKey(config = window.SUPABASE_CONFIG || {}) {
  return String(config.publishableKey || config.anonKey || config.apiKey || config.apikey || '').trim();
}

function sendRealtime(topic, event, payload, ref = String(realtimeRef++)) {
  if (!realtimeSocket || realtimeSocket.readyState !== WebSocket.OPEN) return;
  realtimeSocket.send(JSON.stringify({ topic, event, payload, ref }));
}

function stopRealtimeSocket() {
  if (heartbeatTimer) window.clearInterval(heartbeatTimer);
  heartbeatTimer = null;
  realtimeJoined = false;
  try { realtimeSocket?.close(1000, 'notification realtime replaced'); } catch {}
  realtimeSocket = null;
}

function parseRealtimeMessage(data) {
  try { return JSON.parse(data); } catch { return null; }
}

function tableFromRealtimePayload(payload = {}) {
  return payload.table || payload.relation || payload?.record?.table || payload?.old_record?.table || '';
}

function store() {
  return context.storeProvider?.() || window.CONNECT_STATE?.store || window.CONNECT_BOOTSTRAP_STORE || { users: [], notifications: [] };
}

function currentUser() {
  return context.userProvider?.() || {};
}

function isAdmin() {
  return Boolean(context.isAdminProvider?.());
}

function isAdminUser(user = {}) {
  return user.role === 'super_admin' || ['CSC', 'OIC'].includes(user.account_type);
}

function isOrgUser(user = {}) {
  return user.role === 'organization_manager' || user.account_type === 'org';
}

function session() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); }
  catch { return null; }
}

function createId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function formatRelativeDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const elapsedMs = Date.now() - date.getTime();
  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;
  if (elapsedMs >= 0 && elapsedMs < minuteMs) return 'Just now';
  if (elapsedMs >= 0 && elapsedMs < hourMs) return `${Math.max(1, Math.floor(elapsedMs / minuteMs))} min ago`;
  if (elapsedMs >= 0 && elapsedMs < dayMs) return `${Math.floor(elapsedMs / hourMs)} hr ago`;
  if (elapsedMs >= 0 && elapsedMs < 2 * dayMs) return 'Yesterday';
  if (elapsedMs >= 0 && elapsedMs < 7 * dayMs) return `${Math.floor(elapsedMs / dayMs)} days ago`;
  return formatDate(value);
}
