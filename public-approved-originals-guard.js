import './single-day-span-fix.js?v=20260625-single-day-span-v1';
(() => {
  if (window.__publicApprovedOriginalsGuard) return;
  window.__publicApprovedOriginalsGuard = true;
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async function(input, init = {}) {
    const url = typeof input === 'string' ? input : input?.url || '';
    const method = String(init?.method || 'GET').toUpperCase();
    const response = await nativeFetch(input, init);
    if (method !== 'GET' || !url.includes('/rest/v1/calendar_items') || !response.ok) return response;
    try {
      const data = await response.clone().json();
      if (!Array.isArray(data)) return response;
      const filtered = data.filter((row) => row.record_type !== 'schedule' || !row.revision_of || row.approval_status === 'approved');
      return new Response(JSON.stringify(filtered), { status: response.status, statusText: response.statusText, headers: response.headers });
    } catch {
      return response;
    }
  };
})();
