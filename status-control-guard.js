const SESSION_KEY = 'core_supabase_auth_session';
const STATUS_CONTROL_EMAILS = new Set(['cscadmin1@aup.edu.ph', 'cscadmin2@aup.edu.ph']);
const OIC_EMAIL = 'cscadmin1@aup.edu.ph';
const CSC_EMAIL = 'cscadmin2@aup.edu.ph';
let guardObserver = null;
let applyingGuard = false;

function statusSessionEmail() {
  try {
    return String(JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null')?.user?.email || '').trim().toLowerCase();
  } catch {
    return '';
  }
}

function forceButton(id, visible) {
  const button = document.getElementById(id);
  if (!button) return;
  button.hidden = !visible;
  button.style.display = visible ? '' : 'none';
  button.setAttribute('aria-hidden', visible ? 'false' : 'true');
  button.tabIndex = visible ? 0 : -1;
}

function applyStatusControlGuard() {
  applyingGuard = true;
  const email = statusSessionEmail();
  forceButton('chooseActivityStatusButton', STATUS_CONTROL_EMAILS.has(email));
  forceButton('updateOfficeStatusButton', email === OIC_EMAIL);
  forceButton('updatePresidentStatusButton', email === CSC_EMAIL);
  window.setTimeout(() => { applyingGuard = false; }, 0);
}

function watchStatusControls() {
  if (guardObserver) return;
  const targets = ['chooseActivityStatusButton', 'updateOfficeStatusButton', 'updatePresidentStatusButton']
    .map((id) => document.getElementById(id))
    .filter(Boolean);
  if (!targets.length) return;
  guardObserver = new MutationObserver(() => {
    if (!applyingGuard) queueMicrotask(applyStatusControlGuard);
  });
  targets.forEach((target) => guardObserver.observe(target, { attributes: true, attributeFilter: ['hidden', 'style', 'class'] }));
}

function initStatusControlGuard() {
  applyStatusControlGuard();
  watchStatusControls();
  window.setInterval(() => {
    applyStatusControlGuard();
    watchStatusControls();
  }, 750);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initStatusControlGuard);
else queueMicrotask(initStatusControlGuard);
