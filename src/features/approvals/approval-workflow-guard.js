
(() => {
  if (window.__cscApprovalWorkflowGuard) return;
  window.__cscApprovalWorkflowGuard = true;

  const SESSION_KEY = 'core_supabase_auth_session';
  const FOCUS_CLASS = 'workflow-focus-pulse';
  const ENABLE_CONCERN_EDIT_REQUESTS = false;
  let decorateTimer = 0;
  let editRequestLoadTimer = 0;
  let busy = false;

  const SCHEDULE_FIELDS = [
    ['Title', 'title'],
    ['Category', 'category_id', categoryName],
    ['Venue', 'venue'],
    ['Schedule', 'schedule', scheduleText],
    ['Attendees', 'expected_attendees'],
    ['Privacy Level', 'privacy_level'],
    ['Description', 'public_description'],
    ['Purpose', 'purpose'],
    ['Person in charge', 'contact_person'],
    ['Phone Number', 'contact_info']
  ];
  const CONCERN_FIELDS = [
    ['Title', 'title'],
    ['Category', 'category'],
    ['Priority', 'priority'],
    ['Description', 'description']
  ];

  function session() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
  }

  function store() {
    return window.CONNECT_STATE?.store || window.CONNECT_BOOTSTRAP_STORE || null;
  }

  function currentUser() {
    const s = store();
    const uid = s?.currentUserId || session()?.user?.id || '';
    return (s?.users || []).find((user) => user.id === uid)
      || window.CONNECT_AUTHENTICATED_USER
      || session()?.user
      || {};
  }

  function isAdmin(user = currentUser()) {
    return user.role === 'super_admin'
      || user.account_type === 'CSC'
      || user.account_type === 'OIC'
      || Boolean(user.permissions?.approveEvents)
      || Boolean(user.permissions?.manageAccounts);
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
    const body = await response.text();
    let payload = null;
    if (body) {
      try { payload = JSON.parse(body); } catch { payload = body; }
    }
    if (!response.ok) throw new Error(payload?.message || payload?.error || `Supabase request failed (${response.status})`);
    return payload;
  }

  function html(value = '') {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));
  }

  function clean(value = '') {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
  }

  function cssEscape(value = '') {
    if (window.CSS?.escape) return CSS.escape(String(value));
    return String(value).replace(/["\\]/g, '\\$&');
  }

  function createId() {
    return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function dateText(value) {
    const date = new Date(value);
    return Number.isFinite(date.getTime())
      ? date.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
      : clean(value);
  }

  function occurrenceList(event = {}) {
    return Array.isArray(event.occurrences) && event.occurrences.length
      ? event.occurrences
      : [{ start_time: event.start_time, end_time: event.end_time }];
  }

  function scheduleText(event = {}) {
    return occurrenceList(event)
      .map((item) => `${dateText(item.start_time)} to ${dateText(item.end_time)}`)
      .join('; ');
  }

  function categoryName(event = {}) {
    return (store()?.categories || []).find((item) => item.id === event.category_id)?.name
      || event.category_name
      || event.category_id
      || '';
  }

  function fieldValue(event, field) {
    const formatter = field[2];
    return clean(formatter ? formatter(event) : event[field[1]]);
  }

  function scheduleById(id) {
    return (store()?.events || []).find((event) => String(event.id || '') === String(id || '')) || null;
  }

  function concernById(id) {
    return (store()?.concerns || []).find((concern) => String(concern.id || '') === String(id || '')) || null;
  }

  function upsert(list, item, key = 'request_id') {
    const index = list.findIndex((entry) => String(entry[key] || '') === String(item[key] || ''));
    if (index >= 0) list[index] = { ...list[index], ...item };
    else list.unshift(item);
  }

  async function loadConcernEditRequests() {
    if (!ENABLE_CONCERN_EDIT_REQUESTS) return;
    if (!store() || editRequestLoadTimer) return;
    editRequestLoadTimer = window.setTimeout(() => { editRequestLoadTimer = 0; }, 3500);
    try {
      const rows = await rest('/rest/v1/concern_edit_requests?select=*&order=created_at.desc', {}, 'return=minimal');
      if (!Array.isArray(rows)) return;
      if (!Array.isArray(store().concernEditRequests)) store().concernEditRequests = [];
      rows.forEach((row) => upsert(store().concernEditRequests, row));
    } catch (error) {
      if (!/does not exist|schema cache/i.test(String(error.message || ''))) console.warn('Concern edit request load skipped:', error.message);
    }
  }

  function pendingConcernEdit(concernId) {
    if (!ENABLE_CONCERN_EDIT_REQUESTS) return null;
    return (store()?.concernEditRequests || []).find((request) =>
      String(request.concern_id || '') === String(concernId || '')
      && String(request.status || 'pending') === 'pending'
    ) || null;
  }

  function concernStatusLabel(status = '') {
    const normalized = String(status || 'pending').toLowerCase();
    if (normalized === 'resolved') return 'Solved';
    if (normalized === 'in_review') return 'In Review';
    if (normalized === 'pending_edit') return 'Pending Edit';
    return normalized.replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function requestKind(event = {}) {
    if (event.pending_action === 'remove' || event.revision_status === 'cancel_pending' || event.event_status === 'cancellation_requested') return 'Removal Request';
    if (event.revision_of || event.pending_action === 'edit' || event.revision_submitted_at) return 'Schedule Edit Request';
    return 'New Schedule Request';
  }

  function changeRows(original, requested) {
    return SCHEDULE_FIELDS.map((field) => {
      const current = fieldValue(original, field);
      const proposed = fieldValue(requested, field);
      return {
        label: field[0],
        current,
        proposed,
        changed: current !== proposed
      };
    });
  }

  function scheduleInlineChangeCount(original, requested) {
    if (!original || !requested) return 0;
    return changeRows(original, requested).filter((row) => row.changed).length;
  }

  function scheduleDetailRow(card, label) {
    const wanted = clean(label).toLowerCase();
    return [...card.querySelectorAll('.er-detail-row')].find((row) => {
      const term = clean(row.querySelector('dt')?.textContent || '').toLowerCase();
      return term === wanted;
    }) || null;
  }

  function annotateScheduleRequest(card, original, requested) {
    if (!card || !original || !requested) return;
    card.querySelectorAll('.workflow-change-summary:not(.workflow-concern-change-summary)').forEach((node) => node.remove());
    card.querySelectorAll('.workflow-edited-field').forEach((node) => node.classList.remove('workflow-edited-field'));
    const changedCount = scheduleInlineChangeCount(original, requested);
    const header = card.querySelector('.er-card-header h3, .er-card-head strong, h3, strong');
    if (header) {
      header.textContent = requested.title || original.title || 'Untitled Schedule';
      header.classList.add('workflow-edit-request-title');
      if (!header.querySelector('.workflow-request-kind-label')) {
        const label = document.createElement('span');
        label.className = 'workflow-request-kind-label';
        label.textContent = 'Edit Request';
        header.appendChild(label);
      }
    }
    const headerMeta = card.querySelector('.er-card-header p');
    if (headerMeta) {
      const requestedMeta = `${categoryName(requested)} - ${requested.venue || 'No venue'}`;
      headerMeta.textContent = requestedMeta;
      if (clean(`${categoryName(original)} - ${original.venue || 'No venue'}`) !== clean(requestedMeta)) headerMeta.classList.add('workflow-edited-field');
    }
    changeRows(original, requested).forEach((row) => {
      const detailRow = scheduleDetailRow(card, row.label);
      const valueCell = detailRow?.querySelector('dd') || detailRow?.querySelector('span:last-child');
      if (valueCell) valueCell.textContent = row.proposed || 'Not set';
      if (row.changed) {
        detailRow?.classList.add('workflow-edited-field');
        valueCell?.classList.add('workflow-edited-field');
      }
    });
    card.querySelector('.workflow-inline-note')?.remove();
    if (clean(original.title) !== clean(requested.title)) {
      header?.classList.add('workflow-edited-field');
    }
  }

  function concernComparisonHtml(concern, request) {
    if (!concern || !request) return '';
    const original = request.original_values || concern;
    const requested = request.requested_values || {};
    const rows = CONCERN_FIELDS.map(([label, key]) => {
      const current = clean(original[key] ?? concern[key]);
      const proposed = clean(requested[key] ?? original[key] ?? concern[key]);
      return { label, current, proposed, changed: current !== proposed };
    });
    const changedCount = rows.filter((row) => row.changed).length;
    return `
      <section class="workflow-change-summary workflow-concern-change-summary" aria-label="Requested concern changes">
        <strong>Concern Edit Request</strong>
        <p>${changedCount ? `${changedCount} field${changedCount === 1 ? '' : 's'} changed` : 'No visible field changes detected.'}</p>
        <div class="workflow-change-grid">
          <span>Field</span><span>Current</span><span>Requested</span>
          ${rows.map((row) => `
            <span class="${row.changed ? 'changed' : ''}">${html(row.label)}</span>
            <span class="${row.changed ? 'changed' : ''}">${html(row.current || 'Not set')}</span>
            <span class="${row.changed ? 'changed' : ''}">${html(row.proposed || 'Not set')}</span>
          `).join('')}
        </div>
      </section>`;
  }

  function cardRequestId(card) {
    return card?.dataset?.requestId
      || card?.querySelector('[data-id]')?.dataset?.id
      || '';
  }

  function decorateScheduleRequests() {
    if (!isAdmin()) return;
    document.querySelectorAll('#eventRequestsList .event-request-detail-card, #eventRequestsList .activity-item').forEach((card) => {
      const id = cardRequestId(card);
      if (!id) return;
      const request = scheduleById(id);
      if (!request) return;
      card.dataset.workflowRequestId = id;
      card.classList.toggle('workflow-reviewed-request', request.approval_status !== 'pending');
      card.querySelectorAll('[data-action="event-approve"],[data-action="event-reject"]').forEach((button) => {
        const canReview = request.approval_status === 'pending' && request.created_by !== currentUser().id;
        button.hidden = !canReview;
        button.disabled = !canReview;
      });
      if (!request.revision_of) return;
      const original = scheduleById(request.revision_of);
      if (!original) return;
      const decorationKey = `${id}:${request.updated_at || ''}:${original.updated_at || ''}`;
      if (card.dataset.workflowRequestDecorated === decorationKey) return;
      card.dataset.workflowRequestDecorated = decorationKey;
      annotateScheduleRequest(card, original, request);
    });
  }

  function matchConcernCard(card) {
    const existingId = card.dataset.concernId || card.querySelector('[data-id]')?.dataset?.id || '';
    if (existingId) return concernById(existingId);
    const title = clean(card.querySelector('strong')?.childNodes?.[0]?.textContent || card.querySelector('strong')?.textContent || '');
    const concern = (store()?.concerns || []).find((item) => clean(item.title) === title);
    if (concern) card.dataset.concernId = concern.id;
    return concern || null;
  }

  function concernActionHtml(concern) {
    if (!isAdmin()) {
      const owner = concern.created_by === currentUser().id || (concern.organization_id && concern.organization_id === currentUser().organization_id);
      const editable = ENABLE_CONCERN_EDIT_REQUESTS && owner && !['approved', 'resolved', 'rejected'].includes(String(concern.status || '').toLowerCase()) && !pendingConcernEdit(concern.id);
      return editable
        ? `<div class="inline-actions workflow-concern-actions"><button class="secondary-button" type="button" data-action="workflow-concern-request-edit" data-id="${html(concern.id)}">Request Edit</button></div>`
        : '';
    }
    const status = String(concern.status || 'pending').toLowerCase();
    const editRequest = pendingConcernEdit(concern.id);
    if (editRequest) {
      return `
        <div class="inline-actions workflow-concern-actions">
          <button class="danger-button" type="button" data-action="workflow-concern-edit-reject" data-id="${html(editRequest.request_id)}">Reject Edit</button>
          <button class="primary-button" type="button" data-action="workflow-concern-edit-approve" data-id="${html(editRequest.request_id)}">Approve Edit</button>
        </div>`;
    }
    if (['approved', 'resolved', 'rejected'].includes(status)) return '';
    return `
      <div class="inline-actions workflow-concern-actions">
        <button class="secondary-button" type="button" data-action="workflow-concern-update" data-id="${html(concern.id)}">Update</button>
        <button class="danger-button" type="button" data-action="workflow-concern-reject" data-id="${html(concern.id)}">Reject</button>
        <button class="primary-button" type="button" data-action="workflow-concern-approve" data-id="${html(concern.id)}">Approve</button>
      </div>`;
  }

  function decorateConcerns() {
    document.querySelectorAll('#concernsList .activity-item').forEach((card) => {
      const concern = matchConcernCard(card);
      if (!concern) return;
      card.dataset.concernId = concern.id;
      card.dataset.workflowStatus = concern.status || 'pending';
      const badge = card.querySelector('strong span');
      if (badge) badge.textContent = concernStatusLabel(concern.status);
      card.querySelector('[data-action="concern-resolve-live"]')?.closest('.inline-actions')?.remove();
      if (card.dataset.workflowConcernDecorated === `${concern.id}:${concern.status}:${concern.updated_at}`) return;
      const editRequest = pendingConcernEdit(concern.id);
      card.dataset.workflowConcernDecorated = `${concern.id}:${concern.status}:${concern.updated_at}:${editRequest?.request_id || ''}:${editRequest?.updated_at || ''}`;
      card.querySelector('.workflow-concern-actions')?.remove();
      card.querySelector('.workflow-concern-change-summary')?.remove();
      if (editRequest) card.insertAdjacentHTML('beforeend', concernComparisonHtml(concern, editRequest));
      const actionHtml = concernActionHtml(concern);
      if (actionHtml) card.insertAdjacentHTML('beforeend', actionHtml);
    });
  }

  function highlightElement(element) {
    if (!element) return false;
    element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    element.classList.remove(FOCUS_CLASS);
    void element.offsetWidth;
    element.classList.add(FOCUS_CLASS);
    setTimeout(() => element.classList.remove(FOCUS_CLASS), 2600);
    return true;
  }

  function focusScheduleRequest(id) {
    if (!id) return false;
    const cleanId = String(id).split(':review:')[0].split(':announcement:')[0];
    decorateScheduleRequests();
    return highlightElement(
      document.querySelector(`#eventRequestsList [data-request-id="${cssEscape(cleanId)}"]`)
      || document.querySelector(`#eventRequestsList [data-workflow-request-id="${cssEscape(cleanId)}"]`)
      || document.querySelector(`#eventRequestsList [data-id="${cssEscape(cleanId)}"]`)?.closest('.activity-item, .event-request-detail-card')
    );
  }

  function focusConcern(id) {
    if (!id) return false;
    decorateConcerns();
    const cleanId = String(id).split(':')[0];
    return highlightElement(
      document.querySelector(`#concernsList [data-concern-id="${cssEscape(cleanId)}"]`)
      || document.querySelector(`#concernsList [data-id="${cssEscape(cleanId)}"]`)?.closest('.activity-item')
    );
  }

  function notifyOrgFallback() {}

  function notifyAdminsFallback() {}

  async function reviewConcern(id, action) {
    if (busy || !isAdmin()) return;
    const concern = concernById(id);
    if (!concern) return;
    const actionText = action === 'approve' ? 'approval / resolution note' : action === 'reject' ? 'rejection reason' : 'status update';
    const note = prompt(`Enter ${actionText} for "${concern.title}":`, concern.admin_response || '');
    if (note === null) return;
    const now = new Date().toISOString();
    const status = action === 'approve' ? 'resolved' : action === 'reject' ? 'rejected' : 'in_review';
    const update = {
      status,
      admin_response: clean(note),
      resolved_by: action === 'approve' ? (currentUser().id || session()?.user?.id || null) : concern.resolved_by || null,
      resolved_at: action === 'approve' ? now : concern.resolved_at || null,
      updated_at: now
    };
    busy = true;
    try {
      const saved = await rest(`/rest/v1/concerns?id=eq.${encodeURIComponent(concern.id)}`, {
        method: 'PATCH',
        body: JSON.stringify(update)
      });
      const next = Array.isArray(saved) ? saved[0] : { ...concern, ...update };
      Object.assign(concern, next);
      notifyOrgFallback(
        concern,
        action === 'approve' ? 'Concern Solved' : action === 'reject' ? 'Concern Rejected' : 'Concern Status Updated',
        action === 'approve'
          ? `CSC admin approved "${concern.title}".${update.admin_response ? ` Response: ${update.admin_response}` : ''}`
          : action === 'reject'
            ? `CSC admin rejected "${concern.title}".${update.admin_response ? ` Reason: ${update.admin_response}` : ''}`
            : `CSC admin updated "${concern.title}".${update.admin_response ? ` Response: ${update.admin_response}` : ''}`,
        action === 'approve' ? 'concern_resolved' : action === 'reject' ? 'concern_rejected' : 'concern_update'
      );
      decorateConcerns();
      alert(action === 'approve' ? 'Concern marked solved.' : action === 'reject' ? 'Concern rejected.' : 'Concern updated.');
    } catch (error) {
      alert(`Could not update concern: ${error.message}`);
    } finally {
      busy = false;
    }
  }

  async function submitConcernEditRequest(id) {
    if (!ENABLE_CONCERN_EDIT_REQUESTS) return;
    if (busy) return;
    const concern = concernById(id);
    if (!concern) return;
    const nextTitle = prompt('Requested title:', concern.title || '');
    if (nextTitle === null) return;
    const nextCategory = prompt('Requested category:', concern.category || 'Other concerns');
    if (nextCategory === null) return;
    const nextPriority = prompt('Requested priority:', concern.priority || 'normal');
    if (nextPriority === null) return;
    const nextDescription = prompt('Requested description:', concern.description || '');
    if (nextDescription === null) return;
    const originalValues = {
      title: concern.title || '',
      category: concern.category || 'Other concerns',
      priority: concern.priority || 'normal',
      description: concern.description || ''
    };
    const requestedValues = {
      title: clean(nextTitle),
      category: clean(nextCategory) || 'Other concerns',
      priority: clean(nextPriority) || 'normal',
      description: clean(nextDescription)
    };
    if (!requestedValues.title || !requestedValues.description) {
      alert('Concern title and description are required.');
      return;
    }
    const changed = CONCERN_FIELDS.some(([, key]) => clean(originalValues[key]) !== clean(requestedValues[key]));
    if (!changed) {
      alert('No changes were requested.');
      return;
    }
    busy = true;
    try {
      const now = new Date().toISOString();
      const payload = {
        concern_id: concern.id,
        original_values: originalValues,
        requested_values: requestedValues,
        status: 'pending',
        created_by: currentUser().id || session()?.user?.id || null,
        created_at: now,
        updated_at: now
      };
      const saved = await rest('/rest/v1/concern_edit_requests', { method: 'POST', body: JSON.stringify(payload) });
      const request = Array.isArray(saved) ? saved[0] : { ...payload, request_id: createId() };
      if (!Array.isArray(store().concernEditRequests)) store().concernEditRequests = [];
      upsert(store().concernEditRequests, request);
      notifyAdminsFallback(concern.id, 'Concern Edit Request', `${concern.organization_name || 'An organization'} requested changes for "${concern.title}".`, 'concern_edit_requested');
      decorateConcerns();
      alert('Concern edit request submitted for admin approval.');
    } catch (error) {
      alert(`Could not submit concern edit request: ${error.message}`);
    } finally {
      busy = false;
    }
  }

  async function reviewConcernEditRequest(requestId, status) {
    if (!ENABLE_CONCERN_EDIT_REQUESTS) return;
    if (busy || !isAdmin()) return;
    const request = (store()?.concernEditRequests || []).find((item) => String(item.request_id || '') === String(requestId || ''));
    if (!request) return;
    const concern = concernById(request.concern_id);
    if (!concern) return;
    const note = prompt(status === 'approved' ? 'Approval note for this concern edit:' : 'Rejection reason for this concern edit:', request.admin_response || '');
    if (note === null) return;
    busy = true;
    try {
      const now = new Date().toISOString();
      const reviewPayload = {
        status,
        admin_response: clean(note),
        reviewed_by: currentUser().id || session()?.user?.id || null,
        reviewed_at: now,
        updated_at: now
      };
      await rest(`/rest/v1/concern_edit_requests?request_id=eq.${encodeURIComponent(request.request_id)}`, {
        method: 'PATCH',
        body: JSON.stringify(reviewPayload)
      }, 'return=minimal');
      Object.assign(request, reviewPayload);
      if (status === 'approved') {
        const update = {
          ...request.requested_values,
          admin_response: clean(note),
          updated_at: now
        };
        const saved = await rest(`/rest/v1/concerns?id=eq.${encodeURIComponent(concern.id)}`, {
          method: 'PATCH',
          body: JSON.stringify(update)
        });
        Object.assign(concern, Array.isArray(saved) ? saved[0] : update);
      }
      notifyOrgFallback(
        concern,
        status === 'approved' ? 'Concern Edit Approved' : 'Concern Edit Rejected',
        status === 'approved'
          ? `CSC admin approved your edit request for "${concern.title}".${note ? ` Note: ${clean(note)}` : ''}`
          : `CSC admin rejected your edit request for "${concern.title}".${note ? ` Reason: ${clean(note)}` : ''}`,
        status === 'approved' ? 'concern_approved' : 'concern_rejected'
      );
      decorateConcerns();
      alert(status === 'approved' ? 'Concern edit approved.' : 'Concern edit rejected.');
    } catch (error) {
      alert(`Could not review concern edit request: ${error.message}`);
    } finally {
      busy = false;
    }
  }

  function scheduleDecorate() {
    clearTimeout(decorateTimer);
    decorateTimer = setTimeout(() => {
      decorateScheduleRequests();
      decorateConcerns();
    }, 80);
  }

  function injectStyle() {
    if (document.getElementById('approval-workflow-guard-style')) return;
    const style = document.createElement('style');
    style.id = 'approval-workflow-guard-style';
    style.textContent = `
      .workflow-change-summary{border:1px solid #fed7aa;background:#fff7ed;border-radius:14px;padding:10px;margin:8px 0;color:#7c2d12}
      .workflow-change-summary>strong{display:block;color:#9a3412;margin-bottom:4px}
      .workflow-change-summary>p{margin:0 0 8px;color:#9a3412;font-weight:700}
      .workflow-change-grid{display:grid;grid-template-columns:minmax(80px,.7fr) minmax(0,1fr) minmax(0,1fr);gap:1px;background:#fed7aa;border:1px solid #fed7aa;border-radius:10px;overflow:hidden}
      .workflow-change-grid span{background:#fff;padding:6px 8px;color:#334155;font-size:.78rem;line-height:1.25;overflow-wrap:anywhere}
      .workflow-change-grid span:nth-child(-n+3){font-weight:800;color:#7c2d12;background:#ffedd5;text-transform:uppercase;letter-spacing:.04em}
      .workflow-change-grid span.changed{background:#fff7ed;color:#9a3412;font-weight:800}
      .workflow-edit-request-title{color:#0f172a!important}
      .workflow-request-kind-label{background:#fff7ed!important;border:1px solid #fdba74!important;border-radius:999px!important;color:#9a3412!important;display:inline-block!important;font-size:.72rem!important;font-weight:900!important;line-height:1.2!important;margin-left:8px!important;padding:3px 8px!important;vertical-align:middle!important;white-space:nowrap!important}
      .workflow-edited-field{background:#fff7ed!important;border-color:#fdba74!important;color:#9a3412!important;font-weight:900!important;border-radius:8px!important}
      .er-detail-row.workflow-edited-field{padding:3px 5px!important;margin-inline:-5px!important}
      .workflow-reviewed-request{opacity:.78}
      .workflow-concern-actions{margin-top:12px!important}
      #concernsList .activity-item[data-workflow-status="approved"] strong span{background:#dcfce7!important;color:#166534!important}
      #concernsList .activity-item[data-workflow-status="rejected"] strong span{background:#fee2e2!important;color:#991b1b!important}
      #concernsList .activity-item[data-workflow-status="in_review"] strong span{background:#fef3c7!important;color:#92400e!important}
      .${FOCUS_CLASS}{animation:workflowFocusPulse 1.1s ease-in-out 2;outline:4px solid rgba(37,99,235,.35)!important;outline-offset:3px}
      @keyframes workflowFocusPulse{50%{box-shadow:0 0 0 10px rgba(37,99,235,.18)}}
      @media(max-width:640px){.workflow-change-grid{grid-template-columns:1fr}.workflow-change-grid span:nth-child(-n+3){display:none}}
    `;
    document.head.appendChild(style);
  }

  function bind() {
    document.addEventListener('click', (event) => {
      const button = event.target.closest('[data-action="workflow-concern-approve"],[data-action="workflow-concern-reject"],[data-action="workflow-concern-update"]');
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      const action = button.dataset.action.replace('workflow-concern-', '');
      void reviewConcern(button.dataset.id, action);
    }, true);

    document.addEventListener('click', (event) => {
      const button = event.target.closest('[data-action="workflow-concern-request-edit"],[data-action="workflow-concern-edit-approve"],[data-action="workflow-concern-edit-reject"]');
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (button.dataset.action === 'workflow-concern-request-edit') void submitConcernEditRequest(button.dataset.id);
      else void reviewConcernEditRequest(button.dataset.id, button.dataset.action === 'workflow-concern-edit-approve' ? 'approved' : 'rejected');
    }, true);

    document.addEventListener('click', (event) => {
      if (event.target.closest('#eventRequestsButton,#concernsButton,#notificationsButton')) {
        setTimeout(scheduleDecorate, 160);
        setTimeout(scheduleDecorate, 600);
      }
    }, true);

    window.addEventListener('csc:workflow-focus-schedule', (event) => {
      setTimeout(() => focusScheduleRequest(event.detail?.id), 220);
      setTimeout(() => focusScheduleRequest(event.detail?.id), 700);
    });
    window.addEventListener('csc:workflow-focus-concern', (event) => {
      setTimeout(() => focusConcern(event.detail?.id), 220);
      setTimeout(() => focusConcern(event.detail?.id), 700);
    });

    new MutationObserver(scheduleDecorate).observe(document.body, { childList: true, subtree: true });
  }

  function init() {
    injectStyle();
    bind();
    if (ENABLE_CONCERN_EDIT_REQUESTS) void loadConcernEditRequests();
    scheduleDecorate();
    if (ENABLE_CONCERN_EDIT_REQUESTS) {
      setInterval(() => {
        void loadConcernEditRequests().finally(scheduleDecorate);
      }, 45000);
    }
    setInterval(scheduleDecorate, 15000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else queueMicrotask(init);
})();
