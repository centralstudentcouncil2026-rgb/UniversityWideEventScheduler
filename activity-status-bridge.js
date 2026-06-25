const SESSION_KEY = 'core_supabase_auth_session';
const STATUS_RULES = {
  'cscadmin1@aup.edu.ph': { id: 'oic', account_type: 'OIC', name: 'OIC (Off Campus/In Campus Coordinator)', targets: ['oicStatusValue', 'officeStatusValue'], permission: 'updateOfficeStatus' },
  'cscadmin2@aup.edu.ph': { id: 'csc', account_type: 'CSC', name: 'CSC President', targets: ['cscStatusValue', 'presidentStatusValue'], permission: 'updatePresidentStatus' }
};
const STATUS_EMAILS = Object.keys(STATUS_RULES);
const STATUS_TARGETS = {
  oic: ['oicStatusValue', 'officeStatusValue'],
  csc: ['cscStatusValue', 'presidentStatusValue']
};
const STATUS_REFRESH_MS = 3000;
const EMPTY_STATUS = 'Status not posted';
const statusCache = { oic: EMPTY_STATUS, csc: EMPTY_STATUS };
let statusObserver = null;
let renderingStatus = false;

function config() { return window.SUPABASE_CONFIG || {}; }
function session() { try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; } }
function currentEmail() { return String(session()?.user?.email || '').trim().toLowerCase(); }
function currentRule() { return STATUS_RULES[currentEmail()] || null; }
function headers(authenticated = false) {
  const { publishableKey } = config();
  const token = authenticated ? session()?.access_token : publishableKey;
  return { apikey: publishableKey, Authorization: `Bearer ${token || publishableKey}`, 'Content-Type': 'application/json' };
}
async function rest(endpoint, options = {}, authenticated = false) {
  const { url } = config();
  if (!url || !config().publishableKey) throw new Error('Supabase config is missing.');
  const response = await fetch(`${url}${endpoint}`, { ...options, headers: { ...headers(authenticated), ...options.headers } });
  const payload = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.message || payload?.error || `Status request failed (${response.status})`);
  return payload;
}
function profileStatusId(profile = {}) { return STATUS_RULES[String(profile.email || '').trim().toLowerCase()]?.id || ''; }
function readableStatus(profile) { return profile?.activity_status || profile?.status_label || EMPTY_STATUS; }
function setStatusText(id, label) {
  STATUS_TARGETS[id].forEach((targetId) => {
    const element = document.getElementById(targetId);
    if (element && element.textContent !== label) element.textContent = label;
  });
}
function renderCachedStatuses() {
  renderingStatus = true;
  Object.entries(statusCache).forEach(([id, label]) => setStatusText(id, label || EMPTY_STATUS));
  window.setTimeout(() => { renderingStatus = false; }, 0);
}
function renderStatusRows(profiles = []) {
  profiles.forEach((profile) => {
    const id = profileStatusId(profile);
    if (!id) return;
    const label = readableStatus(profile);
    if (label && label !== EMPTY_STATUS) statusCache[id] = label;
    else if (!statusCache[id]) statusCache[id] = EMPTY_STATUS;
  });
  renderCachedStatuses();
}
async function refreshActivityStatuses() {
  try {
    const emailList = STATUS_EMAILS.join(',');
    const select = 'id,email,full_name,account_type,activity_status,status_label,status_updated_at,status_updated_by';
    const rows = await rest(`/rest/v1/profiles?select=${select}&email=in.(${emailList})`, {}, false);
    if (Array.isArray(rows) && rows.length) renderStatusRows(rows);
    else renderCachedStatuses();
  } catch (error) {
    console.warn('Profile status refresh unavailable:', error.message);
    renderCachedStatuses();
  }
}
function applyLocalStatusRole() {
  const rule = currentRule();
  const state = window.CONNECT_STATE;
  const store = state?.store || window.CONNECT_BOOTSTRAP_STORE;
  if (!store || !rule) return;
  const userId = store.currentUserId || session()?.user?.id;
  const user = (store.users || []).find((item) => item.id === userId || String(item.email || '').toLowerCase() === currentEmail());
  if (!user) return;
  user.full_name = rule.name;
  user.account_type = rule.account_type;
  user.permissions = { ...(user.permissions || {}), updateOfficeStatus: rule.id === 'oic', updatePresidentStatus: rule.id === 'csc' };
}
function applyStatusControls() {
  const rule = currentRule();
  const canOic = rule?.id === 'oic';
  const canCsc = rule?.id === 'csc';
  const choose = document.getElementById('chooseActivityStatusButton');
  const office = document.getElementById('updateOfficeStatusButton');
  const president = document.getElementById('updatePresidentStatusButton');
  if (choose) choose.hidden = !(canOic || canCsc);
  if (office) office.hidden = !canOic;
  if (president) president.hidden = !canCsc;
}
async function saveActivityStatusFromForm() {
  const rule = currentRule();
  if (!rule) return;
  const accountTypeField = document.getElementById('activityStatusAccountType');
  const statusField = document.getElementById('activityStatusSelect');
  const status = statusField?.value || '';
  if (!status) return;
  const typedAccount = String(accountTypeField?.value || rule.account_type).toUpperCase();
  if (typedAccount !== rule.account_type) return;
  const now = new Date().toISOString();
  await rest(`/rest/v1/profiles?email=eq.${encodeURIComponent(currentEmail())}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ account_type: rule.account_type, activity_status: status, status_label: status, status_updated_by: rule.name, status_updated_at: now, updated_at: now })
  }, true);
  statusCache[rule.id] = status;
  renderCachedStatuses();
}
function bindActivityStatusForm() {
  document.addEventListener('submit', (event) => {
    if (event.target?.id !== 'activityStatusForm') return;
    window.setTimeout(() => {
      saveActivityStatusFromForm().then(refreshActivityStatuses).catch((error) => console.warn('Profile status save failed:', error.message));
    }, 0);
  });
}
function protectStatusText() {
  if (statusObserver) return;
  const targets = Object.values(STATUS_TARGETS).flat().map((id) => document.getElementById(id)).filter(Boolean);
  if (!targets.length) return;
  statusObserver = new MutationObserver(() => {
    if (renderingStatus) return;
    const stale = targets.some((element) => element.textContent === EMPTY_STATUS);
    if (stale) queueMicrotask(renderCachedStatuses);
  });
  targets.forEach((element) => statusObserver.observe(element, { childList: true, characterData: true, subtree: true }));
}
function initActivityStatusBridge() {
  applyLocalStatusRole();
  applyStatusControls();
  bindActivityStatusForm();
  protectStatusText();
  refreshActivityStatuses();
  window.setInterval(() => {
    applyLocalStatusRole();
    applyStatusControls();
    protectStatusText();
    refreshActivityStatuses();
  }, STATUS_REFRESH_MS);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initActivityStatusBridge);
else queueMicrotask(initActivityStatusBridge);
