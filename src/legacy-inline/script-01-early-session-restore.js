// Extracted from org-dashboard.html inline script #1

(() => {
      try {
        const session = JSON.parse(sessionStorage.getItem('core_supabase_auth_session') || 'null');
        if (session?.access_token) document.documentElement.classList.add('dashboard-session-restoring-early');
      } catch {}
    })();
