# Module Map — Organization Dashboard

Use this guide to know where Codex should look when fixing a specific bug.

## Original reference

- `org-dashboard.html`
  - Current compacted working fallback.
  - Do not delete until the modular dashboard is fully verified.

- `legacy/original-compacted/org-dashboard.html`
  - Clean reference copy of the original uploaded dashboard.

## Extracted legacy sources

- `src/legacy-bundle/`
  - Files extracted from the embedded `moduleSources` object.
  - These are the closest readable version of the bundled app modules.

Key files:

- `src/legacy-bundle/app-data.js`
  - Seed data, collection names, categories, account defaults.

- `src/legacy-bundle/app-rules.js`
  - Role rules, public user defaults, permission-related constants.

- `src/legacy-bundle/supabase-storage.js`
  - Supabase storage/data logic.

- `src/legacy-bundle/script.js`
  - Main large dashboard behavior.
  - Many features still live here until Codex extracts them properly.

- `src/legacy-bundle/calendar-logic-guard.js`
  - Calendar behavior guard.

- `src/legacy-bundle/org-integrated-bootstrap.js`
  - Organization dashboard bootstrap.

## Feature folders

### Calendar

Folder:

- `src/features/calendar/`

Use this for:

- month/week/day/year rendering,
- Google Calendar-like display,
- drag-to-create schedules,
- schedule modal opening,
- event click behavior,
- time range and multi-day display.

Important files:

- `calendar-logic-guard.js`
- `calendar-google-style-addon.js`
- `calendar-google-style-addon.inlined-from-dashboard.js`
- `personal-calendar-addon.js`
- `schedule-modal-fit.js`
- `calendar-drag-create.js`
- `schedule-modal.js`

### Notifications

Folder:

- `src/features/notifications/`

Use this for:

- notification list,
- unread count,
- mark-as-read,
- opening related schedule/request/concern,
- notification routing.

Important files:

- `notification-routing-guard.js`
- `notification-routing-guard.inlined-from-dashboard.js`
- `notification-render.js`
- `notification-actions.js`

### Approval workflow

Folder:

- `src/features/approvals/`

Use this for:

- organization event requests,
- edit requests,
- approval/rejection status,
- request cards,
- notification after admin response.

Important files:

- `approval-workflow-guard.js`
- `approval-workflow-guard.inlined-from-dashboard.js`
- `event-request-cards.js`

### Concerns

Folder:

- `src/features/concerns/`

Use this for:

- concern panel,
- concern sync bridge,
- org concern status UI,
- concern edit/update workflow.

Important files:

- `concern-sync-bridge.js`
- `concern-sync-bridge.inlined-from-dashboard.js`
- `org-status-concerns-polish.js`
- `concern-panel.js`

### Auth/session

Folder:

- `src/features/auth/`

Use this for:

- organization dashboard bootstrap,
- session restore,
- portal bootstrap/login flow.

Important files:

- `org-integrated-bootstrap.js`
- `portal-bootstrap.js`

### UI and mobile

Folder:

- `src/ui/`

Use this for:

- responsive modals,
- sidebar auto-hide,
- mobile card layout,
- dashboard reload state,
- visual polish.

Important files:

- `modal-responsive-center.js`
- `responsive-ui-final-pass.js`
- `dashboard-modal-notification-fixes.js`
- `org-all-modal-fit.js`
- `sidebar-auto-hide.js`
- `portal-ui-polish.js`
- `ui-light-cards.js`

## Services

Folder:

- `src/services/`

Use this to gradually isolate database logic:

- `supabase-storage.js`
- `schedule-service.js`
- `notification-service.js`
- `concern-service.js`
- `auth-service.js`

The placeholder service files are intentional. Codex should extract logic into them only after the first modular version works.

