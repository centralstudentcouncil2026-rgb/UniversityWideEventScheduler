const STATUS_TABLE = 'activity_statuses';
const SESSION_KEY = 'core_supabase_auth_session';
const STATUS_RULES = {
  'cscadmin1@aup.edu.ph': { id: 'oic', account_type: 'OIC', name: 'OIC (Off Campus/In Campus Coordinator)', targets: ['oicStatusValue', 'officeStatusValue'], permission: 'updateOfficeStatus' },
  'cscadmin2@aup.edu.ph': { id: 'csc', account_type: 'CSC', name: 'CSC President', targets: ['cscStatusValue', 'presidentStatusValue'], permission: 'updatePresidentStatus' }
};
const STATUS_TARGETS = {
  oic: ['oicStatusValue', 'officeStatusValue'],
  csc: ['cscStatusValue', 'presidentStatusValue']
};
const STATUS_REFRESH_MS = 3000;

function config() {
  return window.SUPABASE_CONFIG || {};
}

function session() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); }
  catch { return null; }
}

function currentEmail() {
  return String(session()?.user?.email || '').trim().toLowerCase();
}

function currentRule() {
  return STATUS_RULES[currentEmail()] || null;
}

function headers(authenticated = false) {
  const { publishableKey } = config();
  const token = authenticated ? session()?.access_token : publishableKey;
  return {
    apikey: publishableKey,
    Authorization: `Bearer ${token || publishableKey}`,
    'Content-Type': 'application/json'
  };
}

async function rest(endpoint, options = {}, authenticated = false) {
  const { url } = config();
  if (!url || !config().publishableKey) throw new Error('Supabase config is missing.');
  const response = await fetch(`${url}${endpoint}`, { ...options, headers: { ...headers(authenticated), ...options.headers } });
  const payload = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.message || payload?.error || `Status request failed (${response.status})`);
  return payload;
}

function readableStatus(row) {
  return row?.activity_status || row?.status_label || 'Status not posted';
}

function renderStatusRows(rows = []) {
  const byId = new Map(rows.map((row) => [String(row.id || '').toLowerCase(), row]));
  Object.entries(STATUS_TARGETS).forEach(([id, targets]) => {
    const label = readableStatus(byId.get(id));
    targets.forEach((targetId) => {
      const element = document.getElementById(targetId);
      if (element) element.textContent = label;
    });
  });
}

async function refreshActivityStatuses() {
  try {
    const rows = await rest(`/rest/v1/${STATUS_TABLE}?select=*&id=in.(oic,csc)&order=updated_at.desc`, {}, false);
    renderStatusRows(Array.isArray(rows) ? rows : []);
  } catch (error) {
    console.warn('Activity status refresh unavailable:', error.message);
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
  user.permissions = {
    ...(user.permissions || {}),
    updateOfficeStatus: rule.id === 'oic',
    updatePresidentStatus: rule.id === 'csc'
  };
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
  const row = {
    id: rule.id,
    account_id: session()?.user?.id || null,
    account_type: rule.account_type,
    activity_status: status,
    status_label: status,
    updated_by: rule.name,
    created_at: now,
    updated_at: now
  };
  await rest(`/rest/v1/${STATUS_TABLE}?on_conflict=id`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(row)
  }, true);
  renderStatusRows([row]);
}

function bindActivityStatusForm() {
  document.addEventListener('submit', (event) => {
    if (event.target?.id !== 'activityStatusForm') return;
    window.setTimeout(() => {
      saveActivityStatusFromForm()
        .then(refreshActivityStatuses)
        .catch((error) => console.warn('Activity status save failed:', error.message));
    }, 0);
  });
}

function initActivityStatusBridge() {
  applyLocalStatusRole();
  applyStatusControls();
  bindActivityStatusForm();
  refreshActivityStatuses();
  window.setInterval(() => {
    applyLocalStatusRole();
    applyStatusControls();
    refreshActivityStatuses();
  }, STATUS_REFRESH_MS);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initActivityStatusBridge);
else queueMicrotask(initActivityStatusBridge);
