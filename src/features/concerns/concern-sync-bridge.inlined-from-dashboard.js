
(() => {
  if (window.__cscConcernsDatabaseBridgeV1) return;
  window.__cscConcernsDatabaseBridgeV1 = true;

  const SESSION_KEY = 'core_supabase_auth_session';
  const REFRESH_MS = 1500;
  let refreshTimer = 0;
  let isBusy = false;

  function session() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
  }

  function hasActiveSession() {
    return Boolean(session()?.access_token);
  }

  function sessionExpiresSoon(value = session()) {
    const expiresAt = Number(value?.expires_at || 0);
    return Boolean(expiresAt && Date.now() / 1000 > expiresAt - 60);
  }

  async function refreshSession() {
    const key = window.SUPABASE_CONFIG?.publishableKey || window.SUPABASE_CONFIG?.anonKey || window.SUPABASE_CONFIG?.apiKey || window.SUPABASE_CONFIG?.apikey || '';
    const refreshToken = session()?.refresh_token;
    if (!window.SUPABASE_CONFIG?.url || !key || !refreshToken) throw new Error('Session refresh is unavailable.');
    const response = await fetch(`${window.SUPABASE_CONFIG.url}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ refresh_token: refreshToken })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.access_token) {
      sessionStorage.removeItem(SESSION_KEY);
      throw new Error(payload?.message || payload?.error_description || 'Session refresh failed.');
    }
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(payload));
    return payload;
  }

  async function ensureFreshSession() {
    const value = session();
    if (value?.refresh_token && (!value.access_token || sessionExpiresSoon(value))) await refreshSession();
  }

  function store() {
    return window.CONNECT_STATE?.store || window.CONNECT_BOOTSTRAP_STORE || null;
  }

  function currentUser() {
    const s = store();
    const uid = s?.currentUserId || session()?.user?.id || '';
    const email = String(session()?.user?.email || '').toLowerCase();
    return (s?.users || []).find((user) => user.id === uid)
      || (s?.users || []).find((user) => String(user.email || '').toLowerCase() === email)
      || window.CONNECT_AUTHENTICATED_USER
      || session()?.user
      || {};
  }

  function currentUserId() {
    return store()?.currentUserId || currentUser().id || session()?.user?.id || '';
  }

  function dashboardReadSet() {
    try {
      const values = JSON.parse(localStorage.getItem(`csc_read_notification_groups_${currentUserId() || 'anonymous'}`) || '[]');
      return new Set(Array.isArray(values) ? values : []);
    } catch {
      return new Set();
    }
  }

  function saveDashboardReadSet(values) {
    try { localStorage.setItem(`csc_read_notification_groups_${currentUserId() || 'anonymous'}`, JSON.stringify([...values].slice(-1000))); } catch {}
  }

  function dashboardTextKey(value = '') {
    return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function dashboardNotificationKey(notice = {}) {
    return notice.user_id && notice.notification_type && notice.reference_id
      ? [notice.user_id, notice.notification_type, notice.reference_id].join('|')
      : `id:${notice.notification_id || notice.id || ''}`;
  }

  function dashboardNotificationContentKey(notice = {}) {
    return [notice.title, notice.message, String(notice.created_at || '').slice(0, 16)].map(dashboardTextKey).join('|');
  }

  function notificationReadCutoff() {
    const value = Number(localStorage.getItem(`csc_read_notification_cutoff_${currentUserId() || 'anonymous'}`) || 0);
    return Number.isFinite(value) ? value : 0;
  }

  function rememberedNotificationIsRead(notice = {}) {
    const values = dashboardReadSet();
    const time = new Date(notice.created_at || notice.updated_at || 0).getTime();
    const cutoff = notificationReadCutoff();
    return values.has(dashboardNotificationKey(notice))
      || values.has(`content:${dashboardNotificationContentKey(notice)}`)
      || (cutoff > 0 && (!Number.isFinite(time) || !time || time <= cutoff + 1000));
  }

  function rememberDashboardNotifications(notices = []) {
    const values = dashboardReadSet();
    notices.forEach((notice) => {
      const key = dashboardNotificationKey(notice);
      if (key && key !== 'id:') values.add(key);
      const content = dashboardNotificationContentKey(notice);
      if (content !== '||') values.add(`content:${content}`);
    });
    saveDashboardReadSet(values);
  }

  function isAdmin(user = currentUser()) {
    return user.role === 'super_admin'
      || user.account_type === 'CSC'
      || user.account_type === 'OIC'
      || Boolean(user.permissions?.manageAccounts)
      || Boolean(user.permissions?.approveEvents);
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
    await ensureFreshSession();
    const { skipRefresh, ...fetchOptions } = options;
    const response = await fetch(`${url}${path}`, {
      ...fetchOptions,
      headers: { ...authHeaders(prefer), ...(options.headers || {}) }
    });
    const text = await response.text();
    let payload = null;
    if (text) {
      try { payload = JSON.parse(text); } catch { payload = text; }
    }
    if (response.status === 401 && session()?.refresh_token && !skipRefresh) {
      await refreshSession();
      return rest(path, { ...fetchOptions, skipRefresh: true }, prefer);
    }
    if (!response.ok) {
      const message = payload?.message || payload?.error || `Supabase request failed (${response.status})`;
      throw new Error(message);
    }
    return payload;
  }

  function createId() {
    return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[char]));
  }

  function formatDate(value) {
    if (!value) return '';
    return new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  function normalizeConcern(row = {}) {
    return {
      id: row.id,
      organization_id: row.organization_id || '',
      organization_name: row.organization_name || '',
      title: row.title || '',
      category: row.category || 'Other concerns',
      priority: row.priority || 'normal',
      description: row.description || '',
      status: row.status || 'pending',
      admin_response: row.admin_response || '',
      created_by: row.created_by || '',
      resolved_by: row.resolved_by || '',
      resolved_at: row.resolved_at || '',
      created_at: row.created_at || new Date().toISOString(),
      updated_at: row.updated_at || row.created_at || new Date().toISOString()
    };
  }

  function normalizeNotification(row = {}) {
    return {
      notification_id: row.notification_id || row.id || createId(),
      user_id: row.user_id || '',
      notification_type: row.notification_type || 'general',
      reference_id: row.reference_id || '',
      title: row.title || 'Notification',
      message: row.message || '',
      is_read: Boolean(row.is_read),
      created_at: row.created_at || new Date().toISOString()
    };
  }

  function upsertById(list, item, key = 'id') {
    const index = list.findIndex((entry) => entry[key] === item[key]);
    if (index >= 0) list[index] = { ...list[index], ...item };
    else list.unshift(item);
  }

  function syncStoreConcerns(rows) {
    const s = store();
    if (!s) return;
    if (!Array.isArray(s.concerns)) s.concerns = [];
    rows.map(normalizeConcern).forEach((concern) => upsertById(s.concerns, concern));
    window.dispatchEvent(new CustomEvent('csc:concerns-updated'));
  }

  function syncStoreNotifications(rows) {
    const s = store();
    if (!s) return;
    if (!Array.isArray(s.notifications)) s.notifications = [];
    rows.map(normalizeNotification).forEach((notice) => {
      if (rememberedNotificationIsRead(notice)) notice.is_read = true;
      upsertById(s.notifications, notice, 'notification_id');
    });
  }

  function organizationName(user = currentUser()) {
    const s = store();
    const org = (s?.organizations || []).find((item) => item.id === user.organization_id);
    return user.organization_name || org?.organization_name || org?.name || 'Student Organization';
  }

  function adminRecipients() {
    const users = store()?.users || [];
    return users.filter((user) => user.role === 'super_admin' && user.is_enabled !== false && user.id);
  }

  function organizationRecipients(concern) {
    const users = store()?.users || [];
    const recipients = users.filter((user) => {
      if (!user.id) return false;
      return user.id === concern.created_by || (concern.organization_id && user.organization_id === concern.organization_id);
    });
    if (!recipients.length && concern.created_by) recipients.push({ id: concern.created_by });
    return recipients;
  }

  async function insertNotifications(rows) {
    return [];
  }

  async function loadConcerns() {
    if (!hasActiveSession()) {
      renderConcerns();
      return;
    }
    try {
      const rows = await rest('/rest/v1/concerns?select=*&order=created_at.desc', {}, 'return=minimal');
      if (Array.isArray(rows)) syncStoreConcerns(rows);
    } catch (error) {
      console.warn('Concerns could not be loaded for this session:', error.message || error);
    }
    renderConcerns();
  }

  async function loadNotifications() {
    renderNotifications();
  }

  function visibleConcerns() {
    const s = store();
    const user = currentUser();
    const rows = (s?.concerns || []).map(normalizeConcern);
    if (isAdmin(user)) return rows;
    return rows.filter((concern) => concern.created_by === user.id || (user.organization_id && concern.organization_id === user.organization_id));
  }

  function concernDetails(concern) {
    const rows = [
      ['Organization', concern.organization_name],
      ['Category', concern.category],
      ['Priority', concern.priority],
      ['Status', concern.status === 'resolved' ? 'Solved' : concern.status],
      ['Description', concern.description],
      ['Admin Response', concern.admin_response],
      ['Submitted', formatDate(concern.created_at)],
      ['Solved', formatDate(concern.resolved_at)]
    ];
    return rows
      .filter(([, value]) => value != null && String(value).trim() !== '')
      .map(([label, value]) => `<p data-ui-label="${escapeHtml(label)}"><span>${escapeHtml(value)}</span></p>`)
      .join('');
  }

  function renderConcerns() {
    if (!document.getElementById('concernsModal')?.open) return;
    window.dispatchEvent(new CustomEvent('csc:store-rendered'));
  }

  function notificationsForCurrentUser() {
    return [];
  }

  function notificationGroupKey(notice) {
    return [
      notice?.user_id || '',
      notice?.notification_type || '',
      notice?.reference_id || notice?.notification_id || ''
    ].join('|');
  }

  function isConcernNotification(notice) {
    return String(notice?.notification_type || '').startsWith('concern_');
  }

  function sameNotificationGroup(notice, target) {
    if (!notice || !target) return false;
    if (notice.notification_id && target.notification_id && notice.notification_id === target.notification_id) return true;
    return notificationGroupKey(notice) === notificationGroupKey(target);
  }

  function dedupeNotifications(notices) {
    const byKey = new Map();
    notices.forEach((notice) => {
      const key = notificationGroupKey(notice);
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, notice);
        return;
      }
      const existingTime = new Date(existing.created_at || 0).getTime();
      const noticeTime = new Date(notice.created_at || 0).getTime();
      if ((existing.is_read && !notice.is_read) || (existing.is_read === notice.is_read && noticeTime >= existingTime)) {
        byKey.set(key, notice);
      }
    });
    return [...byKey.values()];
  }

  function removeRenderedConcernNotifications(list, notices) {
    const titles = new Set(notices.map((notice) => String(notice.title || '').trim()).filter(Boolean));
    const messages = new Set(notices.map((notice) => String(notice.message || '').trim()).filter(Boolean));
    [...list.children].forEach((card) => {
      if (!card.matches('.activity-item')) return;
      const strong = card.querySelector('strong');
      const title = String(strong?.childNodes?.[0]?.textContent || strong?.textContent || '').trim();
      const paragraphs = [...card.querySelectorAll('p')].map((item) => item.textContent.trim());
      if (card.dataset.concernNotification === '1' || titles.has(title) || paragraphs.some((text) => messages.has(text))) {
        card.remove();
      }
    });
  }

  function updateNotificationBadge() {
    const badge = document.getElementById('notificationBadge');
    if (badge) { badge.textContent = '0'; badge.hidden = true; }
  }

  function renderNotifications() {
    updateNotificationBadge();
  }

  async function submitConcern(event) {
    const form = event.target;
    if (form?.id !== 'concernForm' || isAdmin()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (isBusy) return;
    const user = currentUser();
    const title = document.getElementById('concernTitle')?.value.trim() || '';
    const category = document.getElementById('concernCategory')?.value || 'Other concerns';
    const priority = document.getElementById('concernPriority')?.value || 'normal';
    const description = document.getElementById('concernDescription')?.value.trim() || '';
    if (!title || !description) {
      alert('Concern title and description are required.');
      return;
    }
    isBusy = true;
    try {
      const now = new Date().toISOString();
      const payload = {
        organization_id: user.organization_id || null,
        organization_name: organizationName(user),
        title,
        category,
        priority,
        description,
        status: 'pending',
        created_by: user.id || session()?.user?.id,
        created_at: now,
        updated_at: now
      };
      const saved = await rest('/rest/v1/concerns', { method: 'POST', body: JSON.stringify(payload) });
      const concern = normalizeConcern(Array.isArray(saved) ? saved[0] : { ...payload, id: createId() });
      syncStoreConcerns([concern]);
      form.reset();
      renderConcerns();
    } catch (error) {
      console.error('Concern submit failed:', error);
      alert(`Could not submit concern: ${error.message}`);
    } finally {
      isBusy = false;
    }
  }

  async function resolveConcern(button) {
    if (!isAdmin() || !button?.dataset.id || isBusy) return;
    const concern = (store()?.concerns || []).find((item) => item.id === button.dataset.id);
    if (!concern) return;
    const note = prompt('Resolution note for the organization (optional):', concern.admin_response || '');
    if (note === null) return;
    isBusy = true;
    try {
      const now = new Date().toISOString();
      const update = {
        status: 'resolved',
        admin_response: String(note || '').trim(),
        resolved_by: currentUser().id || session()?.user?.id,
        resolved_at: now,
        updated_at: now
      };
      const saved = await rest(`/rest/v1/concerns?id=eq.${encodeURIComponent(concern.id)}`, { method: 'PATCH', body: JSON.stringify(update) });
      const resolved = normalizeConcern(Array.isArray(saved) ? saved[0] : { ...concern, ...update });
      syncStoreConcerns([resolved]);
      renderConcerns();
      alert('Concern marked as solved.');
    } catch (error) {
      console.error('Concern resolve failed:', error);
      alert(`Could not mark concern as solved: ${error.message}`);
    } finally {
      isBusy = false;
    }
  }

  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(async () => {
      try {
        await loadConcerns();
        await loadNotifications();
      } catch (error) {
        console.warn('Concern refresh skipped:', error.message);
      } finally {
        scheduleRefresh();
      }
    }, REFRESH_MS);
  }

  function init() {
    document.addEventListener('submit', submitConcern, true);
    document.addEventListener('click', (event) => {
      const resolveButton = event.target.closest('[data-action="concern-resolve-live"]');
      if (resolveButton) {
        event.preventDefault();
        event.stopImmediatePropagation();
        resolveConcern(resolveButton);
      }
    }, true);
    document.addEventListener('click', (event) => {
      if (event.target.closest('#concernsButton,#notificationsButton')) {
        setTimeout(() => { renderConcerns(); renderNotifications(); }, 120);
        setTimeout(renderNotifications, 600);
      }
    });
    window.addEventListener('csc:notifications-open', () => {
      renderConcerns();
      renderNotifications();
    });
    setTimeout(async () => {
      try {
        await loadConcerns();
        await loadNotifications();
      } catch (error) {
        console.warn('Concern startup sync skipped:', error.message);
      }
      scheduleRefresh();
    }, 900);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else queueMicrotask(init);
})();
