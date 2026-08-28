(() => {
  if (window.__cscAccountProfileEditor) return;
  window.__cscAccountProfileEditor = true;

  const SESSION_KEY = 'core_supabase_auth_session';
  const CACHE_KEY = 'csc-admin-profile-contact-cache';
  const STYLE_ID = 'csc-account-profile-editor-style';
  const MODAL_ID = 'accountProfileModal';
  const FORM_ID = 'accountProfileForm';

  function session() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
  }

  function store() {
    return window.CONNECT_STATE?.store || window.CONNECT_BOOTSTRAP_STORE || null;
  }

  function user() {
    const currentStore = store() || {};
    const uid = currentStore.currentUserId || session()?.user?.id || '';
    const email = String(session()?.user?.email || '').trim().toLowerCase();
    return (currentStore.users || []).find((item) => String(item.id || '') === String(uid))
      || (currentStore.users || []).find((item) => String(item.email || item.aup_email || '').trim().toLowerCase() === email)
      || window.CONNECT_AUTHENTICATED_USER
      || session()?.user
      || {};
  }

  function accountEmail(current = user()) {
    return String(current.email || current.aup_email || session()?.user?.email || '').trim().toLowerCase();
  }

  function accountId(current = user()) {
    return String(session()?.user?.id || current.id || '').trim();
  }

  function clean(value) {
    return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function phone(value) {
    return String(value || '').replace(/\D/g, '').slice(0, 20);
  }

  function cache() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') || {}; } catch { return {}; }
  }

  function writeCache(profile) {
    const next = cache();
    const id = String(profile.id || '').trim();
    const email = String(profile.email || '').trim().toLowerCase();
    if (id) next[id] = profile;
    if (email) next[email] = profile;
    localStorage.setItem(CACHE_KEY, JSON.stringify(next));
  }

  function cachedProfile(current = user()) {
    const currentCache = cache();
    return currentCache[accountId(current)] || currentCache[accountEmail(current)] || {};
  }

  function organizationDisplayName(current = user()) {
    const currentStore = store();
    const organization = (currentStore?.organizations || []).find((item) => {
      const orgId = String(item.id || item.organization_id || '').trim();
      return orgId && orgId === String(current.organization_id || '').trim();
    });
    return clean(
      organization?.organization_name
      || organization?.name
      || current.organization_name
      || current.organizationName
      || current.organization
      || current.org_name
      || current.orgName
      || current.raw_user_meta_data?.organization_name
      || current.raw_user_meta_data?.organizationName
      || current.full_name
      || current.name
      || accountEmail(current)
      || 'Account'
    );
  }

  function headers(prefer = 'return=representation') {
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
      headers: { ...headers(prefer), ...(options.headers || {}) }
    });
    const text = await response.text();
    let payload = null;
    if (text) {
      try { payload = JSON.parse(text); } catch { payload = text; }
    }
    if (!response.ok) {
      const error = new Error(payload?.message || payload?.error_description || payload?.error || `Profile save failed (${response.status})`);
      error.status = response.status;
      error.details = payload;
      throw error;
    }
    return payload;
  }

  function toast(message, type = 'success') {
    if (typeof window.showToast === 'function') window.showToast(message, type);
    else if (type === 'error') alert(message);
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #sidebar.sidebar{box-sizing:border-box!important;bottom:0!important;display:flex!important;flex:0 0 min(86vw,320px)!important;flex-direction:column!important;height:100dvh!important;left:0!important;max-height:100dvh!important;max-width:320px!important;min-height:0!important;overflow:hidden!important;position:fixed!important;top:0!important;width:min(86vw,320px)!important;}
      #sidebar .sidebar-scroll-area{box-sizing:border-box!important;flex:1 1 auto!important;min-height:0!important;overflow-x:hidden!important;overflow-y:auto!important;scrollbar-gutter:stable!important;width:100%!important;}
      #sidebar .account-section{box-sizing:border-box!important;flex:0 0 auto!important;margin-top:auto!important;position:static!important;width:100%!important;}
      #sidebarAccountAvatar{cursor:pointer!important;}
      #sidebarAccountAvatar:focus{outline:3px solid rgba(37,99,235,.35)!important;outline-offset:3px!important;}
      #${MODAL_ID}.modal::backdrop{background:rgba(15,23,42,.42);}
      #${MODAL_ID} .modal-card{max-width:min(520px,calc(100vw - 24px));width:520px;}
      #${MODAL_ID} .account-profile-body{display:grid;gap:14px;padding:18px 22px;}
      #${MODAL_ID} label{display:grid;gap:7px;font-weight:800;color:#111827;}
      #${MODAL_ID} input{border:1px solid #cbd5e1;border-radius:12px;font:inherit;min-height:46px;padding:10px 12px;}
      #${MODAL_ID} .profile-save-message{color:#64748b;font-size:.9rem;min-height:1.2em;}
    `;
    document.head.appendChild(style);
  }

  function ensureModal() {
    if (document.getElementById(MODAL_ID)) return;
    document.body.insertAdjacentHTML('beforeend', `
      <dialog class="modal" id="${MODAL_ID}">
        <form class="modal-card" id="${FORM_ID}" method="dialog">
          <div class="modal-header">
            <div><h3>Account Profile</h3></div>
            <button type="button" class="icon-button" data-account-profile-close aria-label="Close">&times;</button>
          </div>
          <div class="account-profile-body">
            <label>Full Name<input id="accountProfileFullName" name="full_name" autocomplete="off" maxlength="140" required></label>
            <label>Phone Number<input id="accountProfilePhone" name="contact_number" autocomplete="off" inputmode="tel" maxlength="20" required></label>
            <label>Messenger Account<input id="accountProfileMessenger" name="messenger_account" autocomplete="off" maxlength="160" required></label>
            <div class="profile-save-message" id="accountProfileMessage"></div>
          </div>
          <div class="modal-actions">
            <button type="button" class="secondary-button" data-account-profile-close>Cancel</button>
            <button type="submit" class="primary-button">Save Profile</button>
          </div>
        </form>
      </dialog>
    `);
  }

  function fillModal() {
    const current = user();
    const cached = cachedProfile(current);
    document.getElementById('accountProfileFullName').value = clean(cached.full_name || current.full_name || current.name || '');
    document.getElementById('accountProfilePhone').value = phone(cached.contact_number || current.contact_number || current.phone_number || '');
    document.getElementById('accountProfileMessenger').value = clean(cached.messenger_account || current.messenger_account || current.messengerAccount || current.messenger || '');
    document.getElementById('accountProfileMessage').textContent = '';
  }

  function updateLocalProfile(profile) {
    const currentStore = store();
    const current = user();
    const id = profile.id || accountId(current);
    const email = profile.email || accountEmail(current);
    const target = (currentStore?.users || []).find((item) => String(item.id || '') === String(id))
      || (currentStore?.users || []).find((item) => String(item.email || item.aup_email || '').trim().toLowerCase() === email);
    const patch = {
      full_name: profile.full_name,
      contact_number: profile.contact_number,
      phone_number: profile.contact_number,
      messenger_account: profile.messenger_account,
      messengerAccount: profile.messenger_account,
      updated_at: profile.updated_at
    };
    if (target) Object.assign(target, patch);
    if (window.CONNECT_AUTHENTICATED_USER) Object.assign(window.CONNECT_AUTHENTICATED_USER, patch);
    const displayName = organizationDisplayName(target || window.CONNECT_AUTHENTICATED_USER || current);
    const avatar = document.getElementById('sidebarAccountAvatar');
    const name = document.getElementById('sidebarAccountName');
    if (name) {
      name.textContent = displayName;
      name.title = email ? `${displayName} (${email})` : displayName;
    }
    if (avatar) avatar.textContent = initials(displayName || email || 'A');
  }

  function initials(value) {
    const parts = clean(value).split(' ').filter(Boolean);
    if (!parts.length) return 'A';
    return parts.slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  }

  async function saveProfile(event) {
    event.preventDefault();
    const current = user();
    const id = accountId(current);
    const email = accountEmail(current);
    const profile = {
      id,
      email,
      full_name: clean(document.getElementById('accountProfileFullName').value),
      contact_number: phone(document.getElementById('accountProfilePhone').value),
      messenger_account: clean(document.getElementById('accountProfileMessenger').value),
      updated_at: new Date().toISOString()
    };
    if (!profile.id || !profile.email) return toast('Login session was not found. Please log in again.', 'error');
    if (!profile.full_name || !profile.contact_number || !profile.messenger_account) return toast('Complete all profile fields.', 'error');
    const button = event.submitter || event.target.querySelector('button[type="submit"]');
    const message = document.getElementById('accountProfileMessage');
    button.disabled = true;
    message.textContent = 'Saving profile...';
    try {
      try {
        await rest(`/rest/v1/profiles?id=eq.${encodeURIComponent(profile.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({
            full_name: profile.full_name,
            contact_number: profile.contact_number,
            messenger_account: profile.messenger_account,
            updated_at: profile.updated_at
          })
        });
      } catch (error) {
        if (![401, 403, 404].includes(error.status)) throw error;
      }
      await rest('/rest/v1/admin_profile_contacts?on_conflict=id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(profile)
      });
      writeCache(profile);
      updateLocalProfile(profile);
      try { localStorage.setItem('csc-sync-store-version', String(Date.now())); } catch {}
      document.getElementById(MODAL_ID)?.close();
      toast('Account profile saved.');
    } catch (error) {
      message.textContent = '';
      toast(error.message || 'Profile could not be saved.', 'error');
    } finally {
      button.disabled = false;
    }
  }

  function openModal() {
    ensureStyle();
    ensureModal();
    fillModal();
    document.getElementById(MODAL_ID)?.showModal();
  }

  function bind() {
    ensureStyle();
    ensureModal();
    const avatar = document.getElementById('sidebarAccountAvatar');
    if (avatar && avatar.dataset.profileEditorBound !== '1') {
      avatar.dataset.profileEditorBound = '1';
      avatar.setAttribute('role', 'button');
      avatar.setAttribute('tabindex', '0');
      avatar.setAttribute('title', 'Edit account profile');
      avatar.addEventListener('click', openModal);
      avatar.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openModal();
        }
      });
    }
    document.getElementById(FORM_ID)?.addEventListener('submit', saveProfile);
    document.querySelectorAll('[data-account-profile-close]').forEach((button) => {
      if (button.dataset.profileCloseBound === '1') return;
      button.dataset.profileCloseBound = '1';
      button.addEventListener('click', () => document.getElementById(MODAL_ID)?.close());
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else queueMicrotask(bind);
  window.addEventListener('csc:store-rendered', bind);
})();
